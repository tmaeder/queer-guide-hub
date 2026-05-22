# Session storage — `localStorage` vs. HttpOnly cookies

*Status: deferred. Tracked here as the canonical follow-up for finding **F3** of the 2026-05-22 defensive-security pass.*

## What the audit found

Supabase Auth stores the active session (access JWT + refresh token) in
`localStorage` under the key `sb-<project>-auth-token`. Any JavaScript
running on the origin can read this key. If an XSS bug is ever
introduced — directly, or via a vulnerable dependency / third-party
widget — the attacker can exfiltrate the session and impersonate the
user from off-device.

There is no `HttpOnly` session cookie. The browser will never refuse a
script's request to read `localStorage`, so the standard
defence-in-depth measure that limits cookie-stealing XSS payloads
(`HttpOnly`) is unavailable here.

## Why we did not migrate in this pass

Moving to cookie-based sessions requires switching from the
browser-side `@supabase/supabase-js` client to `@supabase/ssr`, plus:

- A server route (Cloudflare Pages Function) that issues the cookie.
- Refresh-token rotation on the server side (Supabase's `auth-helpers`
  contract).
- Updating every component / hook that reads the auth token directly,
  including the Service Worker offline pack, Sentry breadcrumb auth
  context, and admin route guards.
- A migration path for users whose current session is only in
  `localStorage` so they aren't logged out at deploy.

The QG codebase has ~75 sites that touch `supabase.auth.*` and ~6
direct readers of the `sb-…-auth-token` key. This is a multi-day
project on its own and would have collided with the rest of the
security pass.

## Compensating controls in place

Until the migration lands, the following defence-in-depth controls
reduce the impact of a hypothetical XSS:

| Control | Where | Effect |
|---|---|---|
| Nonce-based CSP, no `'unsafe-inline'` on `script-src` | `functions/_middleware.ts`, `functions/_lib/securityHeaders.ts` | Inline-script XSS payloads are blocked. The token can only be exfiltrated by code already loaded from an allow-listed origin. |
| Tight `connect-src` allow-list | same | An attacker who *does* run JS still has to ship the stolen token to one of the allow-listed hosts; arbitrary domains are blocked. |
| HSTS preload (2 years) | `public/_headers` | Forecloses the network-injection path to XSS via MITM. |
| `X-Frame-Options: DENY` + `frame-ancestors 'self'` | `public/_headers` | Forecloses clickjacking → token-leak chains. |
| Cookie-consent gating on third-party loaders | `src/utils/analyticsLoader.ts` | Reduces the surface of third-party JS that ever runs in the origin. |
| Strong Referrer-Policy | `public/_headers` | The token isn't sent in `Referer` URLs because Supabase puts it in `Authorization` headers — defence anyway. |

A successful XSS would still be high-severity. The CSP narrows the
practical exploitation paths (no inline payload, no exfil to random
hosts), but does not prevent same-origin / allow-listed-origin
exfiltration.

## Recommended follow-up

Treat as a dedicated milestone:

1. Adopt `@supabase/ssr` and route auth via a Pages Function.
2. Issue the session as `Secure; HttpOnly; SameSite=Lax`.
3. Migrate the SSR helpers into the existing `functions/_middleware.ts`
   chain so SSR auth context is available for the SEO crawler-aware
   responses too.
4. Keep `localStorage` as a transitional reader for one release so
   existing sessions are not invalidated on deploy.
5. Verify post-deploy: `document.cookie` contains the session cookie
   with the three attributes; `localStorage.getItem('sb-…-auth-token')`
   is null; reload preserves auth.

This document should be deleted (and the change recorded in
`CHANGELOG.md`) when that milestone ships.
