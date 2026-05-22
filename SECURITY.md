# Security Policy

Queer Guide handles sensitive data: location traces for LGBTQ+ travelers in jurisdictions where being out is dangerous, account credentials, payment metadata, and user submissions. We take security reports seriously.

## Supported versions

Only the latest commit on `main` (deployed to [queer.guide](https://queer.guide)) is supported. There are no maintained release branches.

| Version        | Supported          |
| -------------- | ------------------ |
| `main` (live)  | :white_check_mark: |
| Anything older | :x:                |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Email: **security@queer.guide** (or **tmaeder@me.com** if the security alias bounces).

If the issue is urgent (active exploitation, credential leak, PII exposure), put `URGENT` in the subject.

Please include:
- A clear description of the vulnerability.
- Steps to reproduce (URL, account role, payload, etc.).
- Impact — what an attacker could do.
- Your name/handle if you'd like to be credited.

## What to expect

- **Acknowledgement:** within 72 hours.
- **Triage update:** within 7 days, including severity assessment and rough fix timeline.
- **Fix + disclosure:** critical issues patched and deployed within 14 days. Lower-severity issues may take longer.
- **Credit:** with your permission, we'll credit you in the release notes once a fix has shipped.

## Scope

In scope:
- `queer.guide` and any `*.queer.guide` subdomain
- The Supabase project `xqeacpakadqfxjxjcewc` (edge functions, RLS, auth flows)
- Cloudflare Workers in this repo (`workers/*`)
- The Chrome extension (`extension/`)

Out of scope:
- Social engineering of staff or moderators
- Physical attacks
- Denial-of-service testing against production
- Findings from automated scanners with no proven impact
- Vulnerabilities requiring a rooted device or already-compromised browser

## Safe harbor

We will not pursue legal action against researchers who:
- Make a good-faith effort to avoid privacy violations, service disruption, and data destruction.
- Report through the channel above before any public disclosure.
- Give us reasonable time to fix the issue before disclosing it.

## Things we already know

Before reporting, check `docs/`:
- `docs/rls-audit.md` — Row-Level Security review
- `docs/security-definer-function-audit.md` — SECURITY DEFINER function review
- `docs/architecture-guardrails.md` — security boundaries we maintain

If your finding is already documented there, we'd still like to hear how you'd improve the mitigation.
