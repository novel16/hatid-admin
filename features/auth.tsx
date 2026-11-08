"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AuthError, createAdminAuth, type AuthState } from "@/lib/auth";
import { Brand, Button, Icon } from "@/components/ui";

type AuthActions = Pick<
  ReturnType<typeof createAdminAuth>,
  "restore" | "signIn" | "signOut"
>;
const AuthContext = createContext<(AuthState & AuthActions) | null>(null);

/** Subscribe the app to one verified session; no private identity is rendered by the server. */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [auth] = useState(createAdminAuth);
  const state = useSyncExternalStore(
    auth.subscribe,
    auth.getSnapshot,
    auth.getServerSnapshot,
  );

  /** Restore once and recheck only established sessions on focus/reconnect, never an in-progress login. */
  useEffect(() => {
    void auth.restore();
    /** A browser focus event must not cancel credential submission in the guest form. */
    function recheck() {
      if (
        document.visibilityState === "visible" &&
        auth.getSnapshot().status === "authenticated"
      )
        void auth.restore();
    }
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    /** Prevent a previous mount's response from restoring access after unmount. */
    return () => {
      auth.cancelPending();
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
    };
  }, [auth]);

  /** Expiry removes access even when an otherwise idle tab makes no further API call. */
  useEffect(() => {
    if (!state.session) return;
    const delay = Math.max(
      0,
      Math.min(
        2_147_000_000,
        Date.parse(state.session.expires_at) - Date.now(),
      ),
    );
    /** The auth owner checks expiry before considering another server request. */
    const timer = setTimeout(() => {
      void auth.restore();
    }, delay);
    /** Replace the timer when the session changes or the provider is removed. */
    return () => clearTimeout(timer);
  }, [auth, state.session]);

  return (
    <AuthContext
      value={{
        ...state,
        restore: auth.restore,
        signIn: auth.signIn,
        signOut: auth.signOut,
      }}
    >
      {children}
    </AuthContext>
  );
}

/** Keep every admin screen on the same session owner instead of separate token reads. */
export function useAdminAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("Admin auth must be used inside its provider.");
  return auth;
}

/** Reuse one blocking verification/retry view before either login or protected content. */
export function SessionCheck({ opening = false }: { opening?: boolean }) {
  const { status, notice, restore, signOut } = useAdminAuth();
  return (
    <main id="main-content" className="session-check">
      <Brand login />
      <div className="session-check-card">
        <span className="icon-tile">
          <Icon name="shield" size={26} />
        </span>
        <h1>
          {status === "unavailable"
            ? "Let’s reconnect."
            : opening
              ? "Opening your workspace…"
              : "Checking your sign-in…"}
        </h1>
        {status === "unavailable" ? (
          <>
            <p role="alert">{notice}</p>
            <div className="action-row">
              <Button onClick={restore}>
                Try again <Icon name="refresh" size={17} />
              </Button>
              <Button variant="secondary" onClick={signOut}>
                Use another account
              </Button>
            </div>
          </>
        ) : (
          <p role="status">
            {opening
              ? "Your next page is on its way."
              : "Confirming your administrator access with Hatid."}
          </p>
        )}
      </div>
    </main>
  );
}

/** Sign in through the admin API only; no rider registration, demo access or password URL fallback. */
export function AdminLogin() {
  const auth = useAdminAuth();
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});

  /** A confirmed session reaches the fixed internal workspace, ignoring arbitrary redirect inputs. */
  useEffect(() => {
    if (auth.status === "authenticated") router.replace("/dashboard");
  }, [auth.status, router]);

  /** Collect native form values once and prevent duplicate click/Enter submissions synchronously. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setFields({});
    const values = new FormData(event.currentTarget);
    try {
      await auth.signIn(
        String(values.get("email") ?? ""),
        String(values.get("password") ?? ""),
      );
    } catch (cause) {
      setError(
        cause instanceof AuthError
          ? cause.message
          : "Unable to sign in. Please try again.",
      );
      if (cause instanceof AuthError) setFields(cause.fields);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (auth.status === "checking" || auth.status === "unavailable")
    return <SessionCheck />;
  if (auth.status === "authenticated") return <SessionCheck opening />;

  return (
    <main id="main-content" className="login-layout">
      <aside className="login-story">
        <Brand login />
        <div className="story-copy">
          <span className="eyebrow">THE HATID ADMIN WORKSPACE</span>
          <h1>The workspace behind every delivery.</h1>
          <p>
            A little more clarity.
            <br />A smoother day for your riders.
          </p>
        </div>
        <div className="story-art" aria-hidden="true">
          <div className="story-orbit orbit-one" />
          <div className="story-orbit orbit-two" />
          <span className="art-stop stop-one" />
          <span className="art-stop stop-two" />
          <span className="art-package">
            <Icon name="shield" size={54} />
          </span>
          <span className="art-tag">A clear view, every day.</span>
        </div>
        <p className="story-footer">
          <span className="status-dot" /> Built around your riders.
        </p>
      </aside>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <div className="login-heading">
            <span className="pill">
              <Icon name="shield" size={15} /> Administrator access
            </span>
            <h2 id="login-title">Welcome back.</h2>
            <p>Sign in to your Hatid admin workspace.</p>
          </div>
          {auth.notice && (
            <p className="notice" role="status">
              {auth.notice}
            </p>
          )}
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          <form
            method="post"
            onSubmit={submit}
            className="form-stack"
            aria-busy={busy}
          >
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                required
                maxLength={255}
                disabled={busy}
                aria-invalid={Boolean(fields.email?.length)}
                aria-describedby={
                  fields.email?.length ? "email-error" : undefined
                }
              />
              {fields.email?.length ? (
                <span id="email-error" className="field-error">
                  {fields.email[0]}
                </span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="password-input">
                <input
                  id="password"
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  disabled={busy}
                  aria-invalid={Boolean(fields.password?.length)}
                  aria-describedby={
                    fields.password?.length ? "password-error" : undefined
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  disabled={busy}
                  aria-label={visible ? "Hide password" : "Show password"}
                  aria-pressed={visible}
                  onClick={
                    /** Reveal only this input at the user's explicit request. */
                    () => setVisible(!visible)
                  }
                >
                  {visible ? "Hide" : "Show"}
                </button>
              </div>
              {fields.password?.length ? (
                <span id="password-error" className="field-error">
                  {fields.password[0]}
                </span>
              ) : null}
            </div>
            <Button type="submit" disabled={busy} className="login-submit">
              {busy ? "Verifying your access…" : "Sign in"}
              <Icon name="arrow" size={19} />
            </Button>
          </form>
          <p className="login-assistance">
            Need account access?
            <br />
            Contact your Hatid administrator for assistance.
          </p>
          <div className="login-footnote">
            <Icon name="shield" size={17} />
            <span>For authorized Hatid administrators.</span>
          </div>
        </div>
        <p className="login-copyright">Hatid · Deliver with clarity.</p>
      </section>
    </main>
  );
}
