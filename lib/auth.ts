export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: "admin";
  created_at: string;
}

interface Credentials {
  access_token: string;
  expires_at: string;
}

export interface AdminSession extends Credentials {
  user: AdminUser;
}

export interface AuthState {
  status: "checking" | "guest" | "unavailable" | "authenticated";
  session: AdminSession | null;
  notice: string;
}

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");
export const AUTH_STORAGE_KEY = `hatid.admin.auth.v1:${API_URL}`;
const INITIAL_STATE: AuthState = {
  status: "checking",
  session: null,
  notice: "",
};
const STORAGE_WARNING =
  "Browser storage is unavailable. Refresh may restore an earlier sign-in or require signing in again.";
const STORAGE_CLEAR_WARNING =
  "Browser storage could not be cleared. A saved sign-in may remain. Close this tab and clear this site’s data on a shared device.";

/** Expose controlled UI messages and validation fields without reflecting server internals. */
export class AuthError extends Error {
  status: number;
  fields: Record<string, string[]>;

  /** Keep the HTTP category separate from the safe user-facing explanation. */
  constructor(
    message: string,
    status: number,
    fields: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.fields = fields;
  }
}

/** Narrow untrusted JSON before reading any credential or profile field. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Allow only nonempty opaque credentials with a future expiry, never a claimed stored identity. */
function parseCredentials(value: unknown): Credentials | null {
  if (
    !isRecord(value) ||
    typeof value.access_token !== "string" ||
    !value.access_token ||
    /\s/.test(value.access_token) ||
    typeof value.expires_at !== "string" ||
    !(Date.parse(value.expires_at) > Date.now())
  )
    return null;
  return { access_token: value.access_token, expires_at: value.expires_at };
}

/** Treat corrupted or expired tab values as guests rather than granting access or crashing. */
export function parseStoredSession(value: string | null): Credentials | null {
  try {
    return parseCredentials(JSON.parse(value ?? "null"));
  } catch {
    return null;
  }
}

/** Persist only this app/API's credentials; removal first prevents an older account surviving a failed write. */
function saveCredentials(value: Credentials | null): boolean {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    if (value)
      sessionStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          access_token: value.access_token,
          expires_at: value.expires_at,
        }),
      );
    return true;
  } catch {
    return false;
  }
}

/** Keep requests on the existing admin auth endpoints with no cookies, caches or redirects. */
async function authRequest(
  action: "login" | "me" | "logout",
  token?: string,
  values?: Record<string, string>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/admin/auth/${action}`, {
      method: action === "me" ? "GET" : "POST",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        ...(values ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: values ? JSON.stringify(values) : undefined,
    });
  } catch {
    throw new AuthError(
      "Couldn’t reach Hatid. Check your connection and try again.",
      0,
    );
  }
  if (response.status === 204 && action === "logout") return null;
  if (response.ok && action === "logout") {
    throw new AuthError("Hatid did not confirm server sign-out.", 0);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A successful status without its expected body cannot verify an identity.
  }
  if (!response.ok) {
    const fields: Record<string, string[]> = {};
    if (
      response.status === 422 &&
      isRecord(payload) &&
      isRecord(payload.errors)
    ) {
      for (const field of ["email", "password"]) {
        const messages = payload.errors[field];
        if (Array.isArray(messages)) {
          /** Discard nontext validation details instead of forwarding arbitrary JSON. */
          fields[field] = messages.filter(
            (message): message is string => typeof message === "string",
          );
        }
      }
    }
    const message =
      response.status === 401
        ? "Your session has ended. Please sign in again."
        : response.status === 403
          ? "This account does not have administrator access."
          : response.status === 422
            ? "Check your email and password."
            : response.status === 429
              ? "Too many attempts. Please wait a moment before trying again."
              : "Hatid is temporarily unavailable. Please try again.";
    throw new AuthError(message, response.status, fields);
  }
  if (!isRecord(payload))
    throw new AuthError(
      "Hatid returned an unreadable response. Please try again.",
      0,
    );
  return payload.data;
}

/** A real /admin/auth/me response, not login JSON or browser storage, establishes the current role. */
async function verifySession(candidate: Credentials): Promise<AdminSession> {
  if (!(Date.parse(candidate.expires_at) > Date.now()))
    throw new AuthError("Your session has expired. Please sign in again.", 401);
  const user = await authRequest("me", candidate.access_token);
  if (isRecord(user) && typeof user.role === "string" && user.role !== "admin")
    throw new AuthError(
      "This account does not have administrator access.",
      403,
    );
  if (
    !isRecord(user) ||
    user.role !== "admin" ||
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id < 1 ||
    typeof user.name !== "string" ||
    typeof user.email !== "string" ||
    typeof user.created_at !== "string"
  )
    throw new AuthError(
      "Hatid returned an unreadable profile. Please try again.",
      0,
    );
  if (!(Date.parse(candidate.expires_at) > Date.now()))
    throw new AuthError("Your session has expired. Please sign in again.", 401);
  return {
    ...candidate,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: "admin",
      created_at: user.created_at,
    },
  };
}

/** Own one browser-root session, including observable state and race-safe async actions. */
export function createAdminAuth() {
  let state = INITIAL_STATE;
  let credentials: Credentials | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();

  /** Publish immutable snapshots so native React subscriptions do not loop or expose half an update. */
  function publish(next: AuthState) {
    state = next;
    for (const listener of listeners) listener();
  }

  /** End access synchronously and invalidate any response belonging to the preceding session. */
  function clear(notice = "") {
    generation += 1;
    credentials = null;
    const cleared = saveCredentials(null);
    publish({
      status: "guest",
      session: null,
      notice: [notice, cleared ? "" : STORAGE_CLEAR_WARNING]
        .filter(Boolean)
        .join(" "),
    });
  }

  /** Share blocked-verification handling for fresh tokens and restored tab credentials. */
  function verificationFailed(error: unknown) {
    if (
      error instanceof AuthError &&
      (error.status === 401 || error.status === 403)
    )
      clear(error.message);
    else
      publish({
        status: "unavailable",
        session: null,
        notice: "We couldn’t verify your sign-in. Reconnect and try again.",
      });
  }

  /** Revalidate on refresh, explicit retry or focus without trusting the saved profile. */
  async function restore() {
    const attempt = ++generation;
    if (!credentials) {
      try {
        const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
        credentials = parseStoredSession(raw);
        if (!credentials) {
          clear(
            raw ? "Your saved session has ended. Please sign in again." : "",
          );
          return;
        }
      } catch {
        publish({ status: "guest", session: null, notice: STORAGE_WARNING });
        return;
      }
    }
    const candidate = credentials;
    publish({ status: "checking", session: null, notice: "" });
    try {
      const session = await verifySession(candidate);
      if (attempt !== generation) return;
      const persisted = saveCredentials(session);
      publish({
        status: "authenticated",
        session,
        notice: persisted ? "" : STORAGE_WARNING,
      });
    } catch (error) {
      if (attempt !== generation) return;
      verificationFailed(error);
    }
  }

  /** Verify newly issued admin credentials before storing anything or publishing authenticated state. */
  async function signIn(email: string, password: string) {
    const attempt = ++generation;
    const data = await authRequest("login", undefined, {
      email: email.trim().toLowerCase(),
      password,
      device_name: "Hatid admin browser",
    });
    if (attempt !== generation)
      throw new AuthError("This sign-in was cancelled. Please try again.", 0);
    const candidate = parseCredentials(data);
    if (!candidate || !isRecord(data) || data.token_type !== "Bearer")
      throw new AuthError(
        "Hatid returned an unreadable sign-in response. Please try again.",
        0,
      );
    credentials = candidate;
    publish({ status: "checking", session: null, notice: "" });
    try {
      const session = await verifySession(candidate);
      if (attempt !== generation)
        throw new AuthError("This sign-in was cancelled. Please try again.", 0);
      const persisted = saveCredentials(candidate);
      publish({
        status: "authenticated",
        session,
        notice: persisted ? "" : STORAGE_WARNING,
      });
    } catch (error) {
      if (attempt === generation) verificationFailed(error);
      throw error;
    }
  }

  /** Clear local access first; an unreachable API must never falsely confirm server revocation. */
  async function signOut() {
    const token = credentials?.access_token;
    clear("Signed out from this tab.");
    const localNotice = state.notice;
    const attempt = generation;
    if (!token) return;
    try {
      await authRequest("logout", token);
    } catch (error) {
      if (attempt !== generation) return;
      if (!(error instanceof AuthError && error.status === 401)) {
        publish({
          status: "guest",
          session: null,
          notice: `${localNotice} Server sign-out could not be confirmed; the token may remain valid until expiry.`,
        });
      }
    }
  }

  return {
    /** Read the same snapshot until an auth transition actually changes it. */
    getSnapshot: () => state,
    /** Server rendering never contains a browser identity or its credentials. */
    getServerSnapshot: () => INITIAL_STATE,
    /** Subscribe one mounted client without creating a second auth owner. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      /** Remove only this React subscription on unmount. */
      return () => {
        listeners.delete(listener);
      };
    },
    /** Discard late async results when a provider unmounts or StrictMode replaces its effect. */
    cancelPending() {
      generation += 1;
    },
    restore,
    signIn,
    signOut,
  };
}
