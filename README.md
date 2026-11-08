# Hatid Admin

The separate Hatid administrator client runs at **http://localhost:3012**. This first feature provides actual admin sign-in, verified refresh restoration, logout and a responsive account/session overview. Rider management and aggregate business dashboards are separate stages; no sample counts or public admin registration are included.

## Run locally

Use native Windows Node24 in this folder. The copied Linux dependencies were replaced using the existing lockfile (`npm ci --no-audit --no-fund`), without upgrading or adding packages.

The public API origin defaults to `http://127.0.0.1:8000`. If needed, copy `.env.example` to your ignored `.env.local` and set `NEXT_PUBLIC_API_URL` to the Laravel **origin**, without `/api/v1`. It is public configuration: never put passwords, tokens or provider keys there. Production must use the intended HTTPS API origin before building.

```bash
npm run dev
```

Dev and start both use3012; rider frontend remains3011. Preserve existing user servers. On the8GB device, run install/tests/lint/typecheck/build/page compilation one at a time. Do not start another Next server or build while available memory is low, and never build into an active dev output.

If there is no admin account yet, open your own terminal in the sibling **api** folder:

```bash
php artisan app:create-admin
```

This existing command asks for name/email and hidden password/confirmation interactively. The feature does not create a developer/default admin or modify a rider account. Rider credentials cannot sign in through the admin endpoint.

## Auth workflow

1. The native POST form normalizes only email; password whitespace is preserved. Its inputs are rendered only after browser session initialization, so the server-rendered checking screen cannot submit credentials before hydration. A synchronous submission guard prevents double clicks/Enter.
2. `POST /api/v1/admin/auth/login` issues an expiring Sanctum personal access token. `GET /api/v1/admin/auth/me` verifies the current administrator before the client stores credentials or renders protected content. Backend role and token-ability checks remain authoritative.
3. Only token/expiry are saved in an API-specific **admin sessionStorage** key, separate from rider storage. User/role/profile are allowlisted from `/me` and stay in memory. Refresh revalidates; expiry/focus/reconnect also recheck established sessions. JavaScript-readable storage has the same XSS limitation as the accepted rider approach; these database-backed tokens are not stateless JWTs.
4. Connection or unreadable responses block access and offer Retry or Use another account. A token issued during login stays in memory while `/me` is unavailable, so Retry checks it again without submitting the password. A 401 or 403 during verification discards those credentials. If storage fails, the app shows a warning and keeps a verified session in memory.
5. Logout clears local access immediately and calls `POST /api/v1/admin/auth/logout`. The API confirms revocation with a 204. A 401 indicates that the token already lacks access. When the app cannot confirm revocation or clear saved credentials, it reports each failure. Generation checks prevent an older response from changing a newer session.

All auth fetches use credentials omitted, no-store, a15second timeout and redirect rejection. No cookies/CSRF SPA flow, localStorage, external redirect destination, background business sender, native financial fixture or rider source change.

## Read/review order

Four new cohesive application modules:

- `lib/auth.ts`: the three controlled auth requests, parsing/allowlisting and one observable session owner. Read `signIn` → `verifySession` → `restore` → `signOut`; these are the actual functions tested.
- `features/auth.tsx`: native React subscription/context, expiry/focus lifecycle, shared verification/retry view and login form. Follow the submit handler into `signIn` rather than tracing a wrapper chain.
- `components/ui.tsx`: reused Brand, native SVG Icon and Button. No new UI dependency.
- `features/workspace.tsx`: protected responsive shell, reused desktop/mobile navigation and actual current-account overview. No rider data is fetched.

Thin Next files own `/`, `/login`, the workspace layout and `/dashboard`; root layout mounts one provider. `app/globals.css` reuses Hatid forest/mint colors with system fonts, avoiding a build-time font download. The existing Hatid SVG is reused as a public asset. `lib/auth.test.ts` is supporting test code; package/TypeScript/example-env/rules are configuration/docs, not additional business layers. No API source or database schema is required.

## Rider Directory

The protected **Riders** page reads `GET /api/v1/admin/riders`. Search with Enter or Search, filter by vehicle, and select 10, 50 or 100 entries. A profile dialog displays the selected result. The page and result range come from Laravel's paginated response.

For this feature, read `features/riders.tsx` for the request and screen states, then `components/pagination.tsx` and the shared Modal in `components/ui.tsx`. The existing `lib/auth.ts` session owner verifies the token and cancels stale reads. Focus rechecks keep a verified session visible while the API responds. A failed verification takes the user to the existing retry or sign-in view.

## Verification

```bash
npm test
npm run typecheck
npm run lint
```

Run these sequentially. Native Node tests execute the actual transport/session owner with only fetch/sessionStorage boundaries substituted. They cover safe storage, fresh `/me` identity, role rejection, expiration, malformed/network responses, retry, storage failure, late response/unmount races, validation/throttling and honest offline logout. Real Laravel auth tests use isolated SQLite and existing role/ability/revocation/CORS coverage; they create no development account.

Production build, browser/phone interaction and publication evidence are recorded with current limits in the project `outputs/Hatid-admin-foundation-plan.md` and `PROJECT_MEMORY.md`. A passing transport test does not claim that the Next browser lifecycle or a deployed build has been exercised.
