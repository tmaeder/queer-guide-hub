# Stalwart — team-inbox mail server (NAS)

Self-hosted mail server that backs the CRM team inboxes. It exists so Twenty has
a **real IMAP mailbox** to sync (Twenty refuses forwarding aliases, and Cloudflare
Email Routing is forwarding-only). It is **not** a public mail server:

- **Inbound** arrives from the `team-inbox` Cloudflare Email Worker via **JMAP**
  over the tunnel (`mail.queer.guide → stalwart:8080`). Stalwart itself never
  listens on the public internet (no port 25, no host ports).
- **Twenty** connects **IMAP + submission** over the internal docker network
  (the `mail.queer.guide` network alias → the container).
- **Outbound** (replies) is relayed to the internet through **Resend** as a
  smarthost, so mail rides Resend's reputation and existing `queer.guide` DKIM.

```
Email Worker ──JMAP/HTTPS(tunnel)──▶ stalwart:8080  (import into mailbox)
Twenty  ──IMAP 993 / SMTP 587 (internal)──▶ stalwart   (sync + send)
stalwart ──smarthost──▶ smtp.resend.com:465 ──▶ internet
```

## Mailboxes

`contact@`, `support@`, `legal@`, `press@` (extend by adding an account here **and**
a Cloudflare Email Routing rule for the new address → `team-inbox` worker).

## First-boot setup (web-admin)

1. `docker compose up -d stalwart`, then open the web-admin. It's only exposed
   through the tunnel route you add for `mail.queer.guide`; before that route
   exists, reach it on the LAN by temporarily publishing the port, or run the CLI
   inside the container. Log in as `admin` with `STALWART_ADMIN_SECRET`.
2. **Domain** → add `queer.guide`.
3. **TLS** → enable **ACME** with the **Cloudflare DNS-01** provider (needs a
   scoped Cloudflare API token: *Zone → DNS → Edit* on the queer.guide zone) so
   the server presents a valid cert for `mail.queer.guide`. This is what lets
   Twenty connect over TLS internally without cert-validation errors.
4. **Accounts** → create the four mailboxes above, each with a strong password.
   - Put the same passwords in the `team-inbox` worker secret
     `STALWART_MAILBOX_PASSWORDS` (JSON: `{"contact":"…","support":"…",…}`) and in
     Twenty's per-account IMAP/SMTP settings.
5. **Outbound / smarthost** → add a relay route sending all outbound mail to
   `smtp.resend.com:465` (implicit TLS), auth user `resend`, password =
   `RESEND_API_KEY`. Restrict Stalwart from delivering directly to the internet.
6. **Listeners** — confirm: IMAP `993` (implicit TLS), submission `587`
   (STARTTLS), JMAP/HTTP `8080`. No SMTP `25` listener is needed (nothing
   delivers to Stalwart over SMTP; inbound is JMAP import).

`config.reference.toml` documents these same settings for operators who prefer
file-based config. Stalwart persists runtime config in its data volume and the
web-admin is the source of truth after bootstrap, so treat the reference as a
guide, not a mounted file.

## Verify

```sh
# IMAP login for a mailbox (run on the NAS / inside the compose network)
openssl s_client -quiet -connect mail.queer.guide:993 <<'EOF'
a login contact@queer.guide <password>
a list "" "*"
a logout
EOF
```

Then send a real email to `contact@queer.guide` and confirm it lands in that
mailbox's INBOX (see the top-level README "Mail" runbook for the full
end-to-end test through the worker and Twenty).
