# Booking & Welcome-Email Disposition — 2026-06-10

Disposition record for dead-code audit items **BR-2** (in-app hotel booking) and
**BR-5** (send-welcome-email never invoked). Shipped via PR #1554; everything
below is live in production.

## BR-2 — In-app hotel booking: REMOVED

### Evidence it never worked

| Check | Result |
|---|---|
| `bookings` table (written by `hotel-booking`, `booking-confirmation`, `booking-webhook`) | does not exist in prod |
| `booking_webhooks` table (written by `booking-webhook`) | does not exist |
| `trip_reservations` table (written by `hotel-booking`) | does not exist |
| `impalaProvider` registration | never registered in `bookingRegistry` (`src/lib/booking/index.ts`) — no search result ever had `supportsInApp=true`, so the in-app branch of `HotelBookingFlow` was unreachable |
| `hotel-booking` fn body | stub: "Future: Will call Impala/Booking.com Demand API" — no provider API call existed |
| Impala activation precondition | `affiliate_partners.supports_in_app` was never set; no `IMPALA_API_KEY` |

### What was removed

- Edge functions `hotel-booking`, `booking-confirmation`, `booking-webhook`
  (deleted from the repo **and** the live project — both now 404).
- `src/lib/booking/providers/impala.ts` (+ tests).
- `src/components/booking/HotelBookingFlow.tsx` (+ test) — its only reachable
  branch collected guest name/email that went nowhere, then opened the
  affiliate link.
- The `supportsInApp` concept end-to-end: `BookingResult`/`BookingProvider`
  fields, the in-app-only types (`BookingFlowData`, `BookingRoom`,
  `BookingConfirmation`) and optional provider methods
  (`getRoomOptions`/`createBooking`/`cancelBooking`/`getBookingStatus`).
- Stale `[functions.create-booking]` entry in `supabase/config.toml`
  (no such function existed).

### What booking is now

Affiliate-only. `TripBookingAssistant` opens the partner `bookingUrl` and saves
a pending row in `reservations` (columns + owner-insert RLS verified). The
affiliate URL builders in `src/utils/transport/bookingUrl.ts` and the four
registered providers (hotellook, getyourguide, viator, travelpayouts-flights)
are untouched. `source-booking` (scraper source) and `hotel-search` are
unrelated and kept.

If in-app booking ever returns it is a **new product build** (provider API
agreement, booking tables, payment handling, webhooks) — there is nothing left
to revive.

## BR-5 — send-welcome-email: WIRED

The function was deployed but had no caller (no auth hook, no trigger, no
cron); `profiles.welcome_email_sent_at` was NULL for every row since launch.

### Dispatch path (live)

```
pg_cron welcome_email_dispatch (*/15 min)
  → public.run_welcome_email_dispatch()      -- migration 20260610100000
    → pg_net POST /functions/v1/send-welcome-email per eligible user
      (X-Internal-Secret from vault 'internal_invoke_secret';
       fn deployed verify_jwt=false, self-gated hasInternalSecret/requireAdmin)
```

- Eligible = profile with `welcome_email_sent_at IS NULL` whose auth user has
  `email_confirmed_at` set. Fn is idempotent (re-checks + stamps).
- The 9 pre-wiring profiles were grandfathered (stamped, no retro emails).
- Registered in `admin_automations` as `welcome_email_dispatch` (enabled).

### Bugs found and fixed while wiring

1. **Wrong template columns (latent, fatal):** the fn selected
   `body_html`/`body_text` but `email_templates` has
   `html_content`/`text_content` — every send would have 500'd
   ("welcome template missing"). Caught in the first live E2E send.
2. **Anon JWT in migration:** the first draft embedded the publishable anon
   key for the gateway; GitGuardian fails PRs on any JWT-shaped literal.
   Switched to the translate-i18n pattern (verify_jwt=false + vault secret
   only) and rewrote branch history so the key never reached main.

### Verification (prod, 2026-06-10)

- Real send → Resend → `welcome_email_sent_at` stamped (owner's own account).
- Second call → `already_sent` (idempotent).
- No secret / no auth → 401; cron path without Authorization header → 200.
- Cron ran at :45/:00/:15 — all `succeeded`.
