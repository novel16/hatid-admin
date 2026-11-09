import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";
import {
  AUTH_STORAGE_KEY,
  AuthError,
  createAdminAuth,
  parseStoredSession,
} from "./auth.ts";
import { readActivity, readStatusResult } from "./riders.ts";

const originalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);
let saved: Map<string, string>;

/** Supply only the browser storage boundary; all auth logic remains the real implementation. */
beforeEach(() => {
  saved = new Map();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      /** Read only the requested tab key. */
      getItem: (key: string) => saved.get(key) ?? null,
      /** Keep disposable credentials in test memory only. */
      setItem: (key: string, value: string) => saved.set(key, value),
      /** Remove no unrelated browser key. */
      removeItem: (key: string) => saved.delete(key),
    },
  });
});

/** Restore native boundaries so one test cannot lend another its identity or network. */
afterEach(() => {
  mock.restoreAll();
  if (originalStorage)
    Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

/** Produce short-lived synthetic credentials, never a native Hatid account/token. */
function credentials(token = "synthetic-admin-token") {
  return {
    access_token: token,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

/** Stand in for the API's controlled profile rather than a stored client identity. */
function profile(id = 7) {
  return {
    id,
    name: "Verified administrator",
    email: "admin@example.test",
    role: "admin",
    created_at: "2026-01-01T00:00:00Z",
  };
}

/** Issue the same envelope as the real scoped login endpoint. */
function loginResponse(token = "synthetic-admin-token") {
  return Response.json({
    data: {
      ...credentials(token),
      token_type: "Bearer",
      user: { ...profile(), name: "Unverified login name" },
    },
  });
}

/** Resolve two real auth requests while recording their native fetch options. */
function workingApi() {
  const calls: { url: string; options?: RequestInit }[] = [];
  mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith("/login")) return loginResponse();
      if (String(url).endsWith("/logout"))
        return new Response(null, { status: 204 });
      return Response.json({
        data: { ...profile(), password: "never-allow-this-field" },
      });
    },
  );
  return calls;
}

/** Persisting a claimed user/role must never turn it into an authenticated administrator. */
test("stored sessions retain only unexpired token credentials", () => {
  const candidate = credentials();
  assert.deepEqual(
    parseStoredSession(
      JSON.stringify({ ...candidate, user: profile(), role: "admin" }),
    ),
    candidate,
  );
  for (const raw of [
    null,
    "broken",
    "{}",
    JSON.stringify({ ...candidate, access_token: "has whitespace" }),
    JSON.stringify({ ...candidate, expires_at: "invalid" }),
    JSON.stringify({ ...candidate, expires_at: "2000-01-01" }),
  ]) {
    assert.equal(parseStoredSession(raw), null);
  }
  assert.match(AUTH_STORAGE_KEY, /^hatid\.admin\.auth\./);
  assert.notEqual(AUTH_STORAGE_KEY, "hatid.auth.v1");
});

/** The same real path owns login normalization, /me verification and credential-only persistence. */
test("sign-in uses only admin Bearer routes, omitted cookies and a fresh verified identity", async () => {
  const calls = workingApi();
  const auth = createAdminAuth();
  await auth.restore();
  await auth.signIn("  ADMIN@EXAMPLE.TEST  ", " keep password spaces ");
  assert.equal(auth.getSnapshot().status, "authenticated");
  assert.deepEqual(auth.getSnapshot().session?.user, profile());
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith("/api/v1/admin/auth/login"));
  assert.ok(calls[1].url.endsWith("/api/v1/admin/auth/me"));
  assert.deepEqual(JSON.parse(String(calls[0].options?.body)), {
    email: "admin@example.test",
    password: " keep password spaces ",
    device_name: "Hatid admin browser",
  });
  for (const call of calls) {
    assert.equal(call.options?.credentials, "omit");
    assert.equal(call.options?.cache, "no-store");
    assert.equal(call.options?.redirect, "error");
    assert.equal(new URL(call.url).search, "");
  }
  assert.equal(
    new Headers(calls[1].options?.headers).get("Authorization"),
    "Bearer synthetic-admin-token",
  );
  assert.deepEqual(
    Object.keys(JSON.parse(saved.get(AUTH_STORAGE_KEY)!)).sort(),
    ["access_token", "expires_at"],
  );
  assert.equal(auth.getServerSnapshot().session, null);
});

/** A cold refresh remains blocked until the actual server profile arrives. */
test("refresh verifies stored credentials and never grants access from a stored role", async () => {
  saved.set(
    AUTH_STORAGE_KEY,
    JSON.stringify({ ...credentials(), user: profile(123) }),
  );
  let finish!: (response: Response) => void;
  mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const auth = createAdminAuth();
  const restoring = auth.restore();
  assert.equal(auth.getSnapshot().status, "checking");
  assert.equal(auth.getSnapshot().session, null);
  finish(Response.json({ data: profile(42) }));
  await restoring;
  assert.equal(auth.getSnapshot().session?.user.id, 42);
});

/** Forging the login profile cannot bypass the role returned by /admin/auth/me. */
test("rider profiles and malformed successful profiles never grant admin access", async () => {
  for (const user of [
    { ...profile(), role: "rider" },
    { ...profile(), id: "7" },
    null,
  ]) {
    mock.method(globalThis, "fetch", async (url: string | URL | Request) =>
      String(url).endsWith("/login")
        ? loginResponse()
        : Response.json({ data: user }),
    );
    const auth = createAdminAuth();
    await assert.rejects(
      auth.signIn("admin@example.test", "synthetic password"),
      AuthError,
    );
    assert.notEqual(auth.getSnapshot().status, "authenticated");
    assert.equal(saved.has(AUTH_STORAGE_KEY), false);
    mock.restoreAll();
  }
});

/** Unusable tab credentials should be discarded without contacting another endpoint. */
test("expired stored tokens are cleared without sending a request", async () => {
  saved.set(
    AUTH_STORAGE_KEY,
    JSON.stringify({ ...credentials(), expires_at: "2000-01-01" }),
  );
  saved.set("hatid.auth.v1", "unrelated rider session");
  const calls = workingApi();
  const auth = createAdminAuth();
  await auth.restore();
  assert.equal(auth.getSnapshot().status, "guest");
  assert.equal(saved.has(AUTH_STORAGE_KEY), false);
  assert.equal(saved.get("hatid.auth.v1"), "unrelated rider session");
  assert.equal(calls.length, 0);
});

/** Only authoritative credential rejection ends the saved session; errors do not fabricate access. */
test("revoked or forbidden refreshes remove only admin credentials", async () => {
  for (const status of [401, 403]) {
    saved.set(AUTH_STORAGE_KEY, JSON.stringify(credentials()));
    mock.method(globalThis, "fetch", async () =>
      Response.json({ message: "Rejected" }, { status }),
    );
    const auth = createAdminAuth();
    await auth.restore();
    assert.equal(auth.getSnapshot().status, "guest");
    assert.equal(auth.getSnapshot().session, null);
    assert.equal(saved.has(AUTH_STORAGE_KEY), false);
    mock.restoreAll();
  }
});

/** The actual retry path keeps an uncertain token without treating it as verified. */
test("connection and unreadable-body failures preserve blocked credentials for retry", async () => {
  for (const unreadable of [false, true]) {
    saved.set(AUTH_STORAGE_KEY, JSON.stringify(credentials()));
    mock.method(globalThis, "fetch", async () => {
      if (unreadable) return new Response("broken JSON", { status: 200 });
      throw new TypeError("synthetic network failure");
    });
    const auth = createAdminAuth();
    await auth.restore();
    assert.equal(auth.getSnapshot().status, "unavailable");
    assert.equal(auth.getSnapshot().session, null);
    assert.ok(saved.has(AUTH_STORAGE_KEY));
    mock.restoreAll();
    workingApi();
    await auth.restore();
    assert.equal(auth.getSnapshot().status, "authenticated");
    mock.restoreAll();
  }
});

/** A token expiring during the network round trip cannot slip through the post-response gate. */
test("expiry is rechecked after server verification", async () => {
  const now = Date.now();
  mock.method(Date, "now", () => now);
  saved.set(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      ...credentials(),
      expires_at: new Date(now + 1_000).toISOString(),
    }),
  );
  mock.method(globalThis, "fetch", async () => {
    mock.method(Date, "now", () => now + 2_000);
    return Response.json({ data: profile() });
  });
  const auth = createAdminAuth();
  await auth.restore();
  assert.equal(auth.getSnapshot().status, "guest");
  assert.equal(saved.has(AUTH_STORAGE_KEY), false);
});

/** Logout wins even when an older successful /me response is still in flight. */
test("late refresh cannot resurrect a locally signed-out session", async () => {
  saved.set(AUTH_STORAGE_KEY, JSON.stringify(credentials()));
  let finish!: (response: Response) => void;
  mock.method(globalThis, "fetch", (url: string | URL | Request) =>
    String(url).endsWith("/logout")
      ? Promise.resolve(new Response(null, { status: 204 }))
      : new Promise<Response>((resolve) => {
          finish = resolve;
        }),
  );
  const auth = createAdminAuth();
  const restoring = auth.restore();
  await auth.signOut();
  finish(Response.json({ data: profile() }));
  await restoring;
  assert.equal(auth.getSnapshot().status, "guest");
  assert.equal(saved.has(AUTH_STORAGE_KEY), false);
});

/** A late failed logout must not overwrite a newer verified sign-in or its notice. */
test("an older logout result cannot clear a newer sign-in", async () => {
  workingApi();
  const auth = createAdminAuth();
  await auth.signIn("admin@example.test", "synthetic password");
  mock.restoreAll();
  let finish!: (response: Response) => void;
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    if (String(url).endsWith("/logout"))
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    if (String(url).endsWith("/login"))
      return loginResponse("second-synthetic-token");
    return Response.json({ data: profile(88) });
  });
  const leaving = auth.signOut();
  assert.equal(auth.getSnapshot().session, null);
  await auth.signIn("admin@example.test", "synthetic password");
  finish(Response.json({ message: "unavailable" }, { status: 503 }));
  await leaving;
  assert.equal(auth.getSnapshot().session?.user.id, 88);
  assert.equal(
    auth.getSnapshot().session?.access_token,
    "second-synthetic-token",
  );
});

/** Quota/blocked storage changes persistence, never the requirement for server verification. */
test("blocked storage allows verified memory-only access with an explicit warning", async () => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get() {
      throw new Error("synthetic storage restriction");
    },
  });
  workingApi();
  const auth = createAdminAuth();
  await auth.restore();
  assert.equal(auth.getSnapshot().status, "guest");
  assert.match(auth.getSnapshot().notice, /storage/i);
  await auth.signIn("admin@example.test", "synthetic password");
  assert.equal(auth.getSnapshot().status, "authenticated");
  assert.match(auth.getSnapshot().notice, /refresh|storage/i);
  await auth.signOut();
  assert.equal(auth.getSnapshot().session, null);
});

/** Local logout succeeds immediately while accurately reporting an unconfirmed server revocation. */
test("offline logout clears local access without claiming server revocation", async () => {
  workingApi();
  const auth = createAdminAuth();
  await auth.signIn("admin@example.test", "synthetic password");
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("synthetic offline boundary");
  });
  await auth.signOut();
  assert.equal(auth.getSnapshot().status, "guest");
  assert.equal(saved.has(AUTH_STORAGE_KEY), false);
  assert.match(auth.getSnapshot().notice, /could not be confirmed/i);
});

/** Cancelling an unmounted provider's read prevents a later response from granting access. */
test("cancelled verification never publishes an authenticated snapshot", async () => {
  saved.set(AUTH_STORAGE_KEY, JSON.stringify(credentials()));
  let finish!: (response: Response) => void;
  mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const auth = createAdminAuth();
  let authenticatedNotices = 0;
  const unsubscribe = auth.subscribe(() => {
    if (auth.getSnapshot().status === "authenticated")
      authenticatedNotices += 1;
  });
  const restoring = auth.restore();
  auth.cancelPending();
  finish(Response.json({ data: profile() }));
  await restoring;
  unsubscribe();
  assert.equal(authenticatedNotices, 0);
});

/** Keep field errors readable while never reflecting server stack traces into the sign-in UI. */
test("validation, throttling and server errors stay controlled and never persist credentials", async () => {
  for (const status of [422, 429, 500]) {
    mock.method(globalThis, "fetch", async () =>
      Response.json(
        {
          message: "SQL trace should remain private",
          errors: {
            email: ["Check your email.", 123],
            password: ["Check your password."],
          },
        },
        { status },
      ),
    );
    const auth = createAdminAuth();
    await assert.rejects(
      auth.signIn("admin@example.test", "synthetic password"),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.status, status);
        assert.doesNotMatch(error.message, /SQL/);
        if (status === 422)
          assert.deepEqual(error.fields.email, ["Check your email."]);
        return true;
      },
    );
    assert.notEqual(auth.getSnapshot().status, "authenticated");
    assert.equal(saved.has(AUTH_STORAGE_KEY), false);
    mock.restoreAll();
  }
});

/** A known issued token survives a temporary /me failure without another password submission. */
test("fresh sign-in retries verification with one login POST and no premature persistence", async () => {
  let logins = 0;
  let verifications = 0;
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    if (String(url).endsWith("/login")) {
      logins += 1;
      return loginResponse();
    }
    verifications += 1;
    return verifications === 1
      ? Response.json({}, { status: 503 })
      : Response.json({ data: profile() });
  });
  const auth = createAdminAuth();
  await auth.restore();
  await assert.rejects(
    auth.signIn("admin@example.test", "synthetic password"),
    AuthError,
  );
  assert.equal(auth.getSnapshot().status, "unavailable");
  assert.equal(auth.getSnapshot().session, null);
  assert.equal(saved.has(AUTH_STORAGE_KEY), false);
  await auth.restore();
  assert.equal(auth.getSnapshot().status, "authenticated");
  assert.equal(logins, 1);
  assert.equal(verifications, 2);
  assert.ok(saved.has(AUTH_STORAGE_KEY));
});

/** Middleware403 and unexpected2xx are not evidence that the logout controller revoked a token. */
test("logout requires its documented success and warns on forbidden or unexpected responses", async () => {
  for (const status of [403, 200]) {
    workingApi();
    const auth = createAdminAuth();
    await auth.signIn("admin@example.test", "synthetic password");
    mock.restoreAll();
    mock.method(globalThis, "fetch", async () =>
      Response.json({ message: "Unexpected result" }, { status }),
    );
    await auth.signOut();
    assert.equal(auth.getSnapshot().session, null);
    assert.match(auth.getSnapshot().notice, /could not be confirmed/i);
    mock.restoreAll();
  }
});

/** A shared device must not hide an old saved token when both cleanup and server revocation fail. */
test("logout retains both storage cleanup and server revocation warnings", async () => {
  workingApi();
  const auth = createAdminAuth();
  await auth.signIn("admin@example.test", "synthetic password");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      /** Model a previously saved token that remains readable. */
      getItem: (key: string) => saved.get(key) ?? null,
      /** Model cleanup being denied after login. */
      removeItem() {
        throw new Error("synthetic cleanup denial");
      },
    },
  });
  mock.restoreAll();
  mock.method(globalThis, "fetch", async () => {
    throw new TypeError("synthetic offline boundary");
  });
  await auth.signOut();
  assert.equal(auth.getSnapshot().status, "guest");
  assert.ok(saved.has(AUTH_STORAGE_KEY));
  assert.match(
    auth.getSnapshot().notice,
    /storage.*could not|storage.*couldn’t/i,
  );
  assert.match(auth.getSnapshot().notice, /saved sign-in may remain/i);
  assert.match(auth.getSnapshot().notice, /could not be confirmed/i);
});

/** A late first sign-in cannot replace the identity or persisted credentials of a newer account. */
test("late fresh sign-in verification cannot replace a newer verified account", async () => {
  let logins = 0;
  let finishFirst!: (response: Response) => void;
  let firstStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      if (String(url).endsWith("/login"))
        return loginResponse(
          ++logins === 1 ? "first-synthetic-token" : "newer-synthetic-token",
        );
      if (String(url).endsWith("/logout"))
        return new Response(null, { status: 204 });
      if (
        new Headers(options?.headers).get("Authorization") ===
        "Bearer first-synthetic-token"
      ) {
        return new Promise<Response>((resolve) => {
          finishFirst = resolve;
          firstStarted();
        });
      }
      return Response.json({ data: profile(88) });
    },
  );
  const auth = createAdminAuth();
  const olderAttempt = assert.rejects(
    auth.signIn("first@example.test", "synthetic password"),
    /cancelled/i,
  );
  await started;
  await auth.signOut();
  await auth.signIn("newer@example.test", "synthetic password");
  finishFirst(Response.json({ data: profile(7) }));
  await olderAttempt;
  assert.equal(auth.getSnapshot().session?.user.id, 88);
  assert.equal(
    JSON.parse(saved.get(AUTH_STORAGE_KEY)!).access_token,
    "newer-synthetic-token",
  );
});

/** Require verified access and preserve Laravel's data and pagination envelope. */
test("rider reads use the verified admin Bearer and encoded search parameters", async () => {
  const calls = workingApi();
  const auth = createAdminAuth();
  const query = new URLSearchParams({
    q: "a+b@example.test",
    page: "2",
    per_page: "50",
  });
  await assert.rejects(auth.readRiders(query), { status: 401 });
  assert.equal(calls.length, 0);
  await auth.signIn("admin@example.test", "synthetic password");
  mock.restoreAll();

  const page = {
    data: [],
    meta: { current_page: 2, last_page: 2, per_page: 50, total: 0 },
  };
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/api/v1/admin/riders");
      assert.deepEqual([...url.searchParams], [...query]);
      assert.equal(options?.method, "GET");
      assert.equal(options?.credentials, "omit");
      assert.equal(options?.cache, "no-store");
      assert.equal(options?.redirect, "error");
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        "Bearer synthetic-admin-token",
      );
      return Response.json(page);
    },
  );

  assert.deepEqual(await auth.readRiders(query), page);
});

/** A current directory denial invalidates the same session that made the request. */
test("rider read authorization failures end the active admin session", async () => {
  for (const status of [401, 403]) {
    workingApi();
    const auth = createAdminAuth();
    await auth.signIn("admin@example.test", "synthetic password");
    mock.restoreAll();
    /** Simulate the server rejecting the verified token after its permissions changed. */
    mock.method(globalThis, "fetch", async () => Response.json({}, { status }));

    await assert.rejects(auth.readRiders(new URLSearchParams()), { status });
    assert.equal(auth.getSnapshot().status, "guest");
    assert.equal(saved.has(AUTH_STORAGE_KEY), false);
    mock.restoreAll();
  }
});

/** Sign-out and a newer login must make both old successes and old denials irrelevant. */
test("an old rider read cannot expose rows or clear a newer admin session", async () => {
  for (const status of [200, 403]) {
    workingApi();
    const auth = createAdminAuth();
    await auth.signIn("admin@example.test", "synthetic password");
    mock.restoreAll();
    let finish!: (response: Response) => void;
    mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/login"))
        return loginResponse("newer-synthetic-admin");
      if (path.endsWith("/me")) return Response.json({ data: profile(88) });
      if (path.endsWith("/logout")) return new Response(null, { status: 204 });
      /** Keep the obsolete directory response in flight across account replacement. */
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });

    const older = assert.rejects(
      auth.readRiders(new URLSearchParams()),
      /cancelled/i,
    );
    await auth.signOut();
    await auth.signIn("newer@example.test", "synthetic password");
    finish(Response.json({ data: [{ id: 7 }] }, { status }));
    await older;
    assert.equal(auth.getSnapshot().session?.user.id, 88);
    assert.equal(
      JSON.parse(saved.get(AUTH_STORAGE_KEY)!).access_token,
      "newer-synthetic-admin",
    );
    mock.restoreAll();
  }
});

/** Ignore a stale search even if its transport resolves after the component cancelled it. */
test("a cancelled rider read cannot apply a late denial", async () => {
  workingApi();
  const auth = createAdminAuth();
  await auth.signIn("admin@example.test", "synthetic password");
  mock.restoreAll();
  let finish!: (response: Response) => void;
  mock.method(
    globalThis,
    "fetch",
    (_input: string | URL | Request, options?: RequestInit) => {
      /** Resolve despite cancellation so the store's late-result guard is exercised. */
      return new Promise<Response>((resolve) => {
        finish = resolve;
        assert.ok(options?.signal instanceof AbortSignal);
      });
    },
  );
  const controller = new AbortController();
  const read = assert.rejects(
    auth.readRiders(new URLSearchParams(), controller.signal),
    /cancelled/i,
  );
  controller.abort();
  finish(Response.json({}, { status: 403 }));
  await read;
  assert.equal(auth.getSnapshot().status, "authenticated");
});

/** Keep directory filters mounted during a recheck, then block access if the check fails. */
test("a background recheck retains the verified session only while verification is pending", async () => {
  workingApi();
  const auth = createAdminAuth();
  await auth.signIn("admin@example.test", "synthetic password");
  mock.restoreAll();
  let finish!: (response: Response) => void;
  /** Hold a previously verified account's recheck without relying on timers. */
  mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );

  const recheck = auth.restore();
  assert.equal(auth.getSnapshot().status, "authenticated");
  assert.equal(auth.getSnapshot().session?.user.id, 7);
  finish(Response.json({}, { status: 503 }));
  await recheck;
  assert.equal(auth.getSnapshot().status, "unavailable");
  assert.equal(auth.getSnapshot().session, null);
  assert.ok(saved.has(AUTH_STORAGE_KEY));
});

/** The status action uses the reviewed revision and the current administrator's Bearer. */
test("confirmed rider status changes use one protected PATCH with the reviewed revision", async () => {
  const calls = workingApi();
  const auth = createAdminAuth();
  const change = {
    status: "suspended" as const,
    reason: "Account review.",
    expected_revision: 4,
  };
  await assert.rejects(auth.updateRiderStatus(12, change), { status: 401 });
  assert.equal(calls.length, 0);
  await auth.signIn("admin@example.test", "synthetic password");
  mock.restoreAll();

  const result = { data: { id: 12, status: "suspended", status_revision: 5 } };
  /** Observe the native request without writing to a development account. */
  mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/api/v1/admin/riders/12/status");
      assert.equal(url.search, "");
      assert.equal(options?.method, "PATCH");
      assert.equal(options?.credentials, "omit");
      assert.equal(options?.cache, "no-store");
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        "Bearer synthetic-admin-token",
      );
      assert.deepEqual(JSON.parse(String(options?.body)), change);
      return Response.json(result);
    },
  );

  assert.deepEqual(await auth.updateRiderStatus(12, change), result);
});

/** Supply the allowlisted profile fields used by history and status responses. */
function activeRider() {
  return {
    id: 12,
    name: "Test rider",
    email: "rider@example.test",
    phone: null,
    vehicle: "bicycle",
    created_at: "2026-01-01T00:00:00Z",
    status: "active",
    status_revision: 4,
    suspended_at: null,
  };
}

/** An activity page must belong to the open rider before it can enable a status action. */
test("profile activity requires the requested rider and fixed history page", () => {
  const envelope = {
    rider: activeRider(),
    data: [],
    meta: { current_page: 1, last_page: 1, per_page: 10, total: 0 },
  };
  assert.equal(readActivity(envelope, 12, 1).rider.status_revision, 4);
  assert.throws(() => readActivity(envelope, 13, 1), AuthError);
  assert.throws(() => readActivity(envelope, 12, 2), AuthError);
});

/** A malformed or unrelated success reply must lead to verification, not a success message. */
test("status confirmation requires the selected rider, requested status and next revision", () => {
  const update = {
    status: "suspended" as const,
    reason: "Account review.",
    expected_revision: 4,
  };
  const suspended = {
    ...activeRider(),
    status: "suspended",
    status_revision: 5,
    suspended_at: "2026-11-08T00:00:00Z",
  };
  assert.equal(
    readStatusResult({ data: suspended }, 12, update).status,
    "suspended",
  );
  for (const data of [
    activeRider(),
    { ...suspended, id: 13 },
    { ...suspended, status_revision: 7 },
    { ...suspended, suspended_at: null },
  ]) {
    assert.throws(() => readStatusResult({ data }, 12, update), { status: 0 });
  }
});
