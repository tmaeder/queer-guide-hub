# Email ingestion architecture

Spec for forward-by-email submission. Implementation is in
`workers/email-ingest/`; this document captures the routing logic,
trust model, and the contract with `community_submissions`.

## Goals

- Anyone can forward an email (flyer, press release, link, photo)
  to a queer.guide address; it lands in the admin inbox like any
  other submission.
- Distinguish trusted senders (admins, partners) from cold forwards.
- No mailbox of last resort: if the address can't be parsed,
  the row is still created with `status='pending'` and the raw
  blob preserved.

## Inbound flow

```
sender → MX (Cloudflare Email Routing)
       → Worker `email-ingest` (POST from CF Email Workers)
         ├─ parse MIME (postal-mime)
         ├─ classify route from To: address
         ├─ extract body + attachments
         ├─ upload attachments → R2 `ingestion-media`
         └─ insert community_submissions row
```

### Address routing

| To: address                          | content_type   | trust | notes |
|--------------------------------------|----------------|-------|-------|
| `submit@queer.guide`                 | event/venue    | low   | default; runs through full pipeline |
| `tip@queer.guide`                    | tag (general)  | low   | freeform; review-gate forces pending |
| `press@queer.guide`                  | news           | low   | sets `platform='email'`, `sub_source_type='forwarded'` |
| `bug@queer.guide` / `feedback@…`     | feedback       | low   | maps to existing feedback flow |
| anything else                        | tag            | low   | catch-all; reviewer reroutes |

Trusted senders are identified by exact match on
`config.email_trusted_senders` (admin-managed JSONB). Trusted
forwards get `permission_level='public_share'`; everything else
defaults to `community_only`.

## Field mapping

| MIME field                  | community_submissions column           |
|-----------------------------|----------------------------------------|
| `Subject`                   | `data.title`                           |
| `text/plain` body           | `raw_text`                             |
| `text/html` body            | `raw_html`                             |
| `From: name <addr>`         | `submitter_metadata.from`              |
| `Message-ID`                | `submitter_metadata.message_id` + dedup key |
| Inline + attached images    | `media_urls[]`, `media_storage_paths[]` |
| Forwarded-from headers      | `submitter_metadata.forward_origin`    |

## Trust & abuse

- **DKIM/SPF**: rely on CF Email Routing — fail-closed: messages
  failing both are dropped (logged to `ingestion_events`, no row
  created).
- **Rate limit**: per `From:` mailbox, 50/h (matches `analyze-flyer`
  user limit × 2.5; tunable via `EMAIL_RATE_LIMIT_PER_HOUR`).
- **Attachment size**: 10 MB total per message; oversize attachments
  are stripped and noted in `media_processing_errors`.
- **Reply-confirmation** (P2): if the sender is unknown,
  reply with a one-time confirmation link. Clicking it elevates
  `permission_level` from `community_only` to `submitter_consent`.

## Idempotency

`Message-ID` is hashed into `community_submissions.fingerprint`.
Re-deliveries (CF retries, BCC dupes) hit the existing UNIQUE
constraint on `fingerprint` and are silently ignored.

## Open questions / follow-ups

- Threaded replies: today we only store the first email of a thread.
  P2: append later messages to the same submission via `In-Reply-To`.
- HTML sanitisation for admin preview lives in `_shared/html.ts`;
  we should add a stricter allow-list before exposing raw HTML in
  the kanban drawer.
- Trusted-sender list is currently `config.email_trusted_senders`
  (free-form). Convert to a typed table when the partner programme
  ships.
