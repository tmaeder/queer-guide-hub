/**
 * Mailbox delivery — every email accepted for `{username}@queer.guide` also
 * lands as a `mailbox_emails` row (direction='inbound'), so forwarded bookings
 * and ordinary mail show up in the user's Queer Guide mail inbox alongside the
 * itinerary card the booking pipeline posts.
 *
 * Pure helpers live here so they can be unit-tested without the worker runtime.
 */

import type { Email } from 'postal-mime';

/** Cap stored body text — the DB is disk-constrained; oversize mail is truncated. */
export function capText(value: string | null | undefined, maxChars: number): string | null {
  if (!value) return null;
  return value.length > maxChars ? value.slice(0, maxChars) : value;
}

export function makeSnippet(text: string | null | undefined, maxChars = 160): string | null {
  if (!text) return null;
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;
  return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars - 1)}…` : collapsed;
}

/**
 * Message-IDs to look up when resolving the parent of this email. In-Reply-To
 * (the direct parent) first, then the References ancestry, deduped.
 */
export function threadCandidateIds(
  inReplyTo: string | null | undefined,
  references: string | null | undefined,
): string[] {
  const ids: string[] = [];
  const push = (raw: string) => {
    const id = raw.trim();
    if (id && !ids.includes(id)) ids.push(id);
  };
  if (inReplyTo) for (const m of inReplyTo.match(/<[^>]+>/g) ?? []) push(m);
  if (references) for (const m of references.match(/<[^>]+>/g) ?? []) push(m);
  return ids.slice(0, 20);
}

export interface MailboxEmailRow {
  owner_id: string;
  direction: 'inbound';
  from_address: string;
  from_name: string | null;
  to_address: string;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  attachments: Array<{ filename: string | null; mimeType: string | null; size: number }>;
  status: 'delivered';
  folder: 'inbox';
  message_id_header: string | null;
  in_reply_to_header: string | null;
  references_header: string[] | null;
  email_date: string;
}

/** Build the insert row from a parsed message (thread fields resolved later). */
export function buildMailboxRow(
  parsed: Email,
  opts: {
    ownerId: string;
    toAddress: string;
    envelopeFrom: string;
    maxBodyChars: number;
    nowIso: string;
  },
): MailboxEmailRow {
  const bodyText = capText(parsed.text ?? null, opts.maxBodyChars);
  const bodyHtml = capText(parsed.html ?? null, opts.maxBodyChars);
  const candidates = threadCandidateIds(parsed.inReplyTo, parsed.references);
  return {
    owner_id: opts.ownerId,
    direction: 'inbound',
    from_address: parsed.from?.address || opts.envelopeFrom,
    from_name: parsed.from?.name || null,
    to_address: opts.toAddress,
    subject: parsed.subject?.trim() || '(no subject)',
    body_text: bodyText,
    body_html: bodyHtml,
    snippet: makeSnippet(bodyText ?? stripHtmlText(bodyHtml ?? '')),
    // Attachment CONTENT is not stored in Phase 1 (disk guard) — metadata only.
    attachments: (parsed.attachments ?? []).slice(0, 20).map((a) => ({
      filename: a.filename ?? null,
      mimeType: a.mimeType ?? null,
      size: typeof a.content === 'string' ? a.content.length : (a.content?.byteLength ?? 0),
    })),
    status: 'delivered',
    folder: 'inbox',
    message_id_header: parsed.messageId ?? null,
    in_reply_to_header: candidates[0] ?? null,
    references_header: candidates.length ? candidates : null,
    email_date: parsed.date ?? opts.nowIso,
  };
}

function stripHtmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
