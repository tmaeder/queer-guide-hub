/**
 * trip-inbox — Cloudflare Email Worker.
 *
 * Receives forwarded booking confirmation emails at `*@inbox.queer.guide`.
 * Local-part is `trip-<short_id>` → looks up trip_inboxes.short_id → parses
 * email body with Claude Haiku → inserts trip_inbox_items. If parser
 * confidence ≥ AUTO_SLOT_CONFIDENCE, immediately invokes the
 * `trip-inbox-slot` edge function to promote to a reservation.
 *
 * Unrecognized local-parts and revoked inboxes are dropped silently — we
 * never bounce, to avoid leaking which addresses exist.
 */

import PostalMime from 'postal-mime';
import { callAnthropic } from './anthropic';
import { bytesToPgHex, encryptBody } from './crypto';
import { SupabaseClient } from './supabase';

export interface Env {
  INBOX_DOMAIN: string;
  AUTO_SLOT_CONFIDENCE: string;
  ANTHROPIC_MODEL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ANTHROPIC_API_KEY: string;
  INBOX_ENCRYPTION_KEY: string;
}

const SHORT_ID_RE = /^trip-([a-z0-9]{6,32})$/i;

export function extractShortId(toAddress: string, domain: string): string | null {
  // toAddress example: "trip-abc123@inbox.queer.guide"
  const at = toAddress.indexOf('@');
  if (at < 0) return null;
  const local = toAddress.slice(0, at).toLowerCase();
  const host = toAddress.slice(at + 1).toLowerCase();
  if (host !== domain.toLowerCase()) return null;
  const m = SHORT_ID_RE.exec(local);
  return m ? m[1]!.toLowerCase() : null;
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export default {
  // Email Workers use the `email` handler. The `EmailMessage` type comes from
  // @cloudflare/workers-types but is not exported as a global — we type it
  // structurally to avoid pulling in the experimental types module.
  async email(
    message: {
      to: string;
      from: string;
      raw: ReadableStream<Uint8Array>;
      setReject?: (reason: string) => void;
    },
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const shortId = extractShortId(message.to, env.INBOX_DOMAIN);
    if (!shortId) return; // drop silently

    const sb = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    let inbox;
    try {
      inbox = await sb.findInboxByShortId(shortId);
    } catch (err) {
      console.error('lookup failed', err);
      return;
    }
    if (!inbox || inbox.revoked_at) return; // drop silently

    const rawBytes = await readStream(message.raw);

    let subject = '';
    let text = '';
    let html = '';
    try {
      const parsed = await PostalMime.parse(rawBytes);
      subject = parsed.subject ?? '';
      text = parsed.text ?? '';
      html = parsed.html ?? '';
    } catch (err) {
      console.warn('postal-mime parse failed', err);
    }
    const body = text.trim() || stripHtml(html);

    // Encrypt the *raw RFC822* message — includes headers + body + any
    // attachments — for forensics if a user reports a parse miss.
    const encrypted = await encryptBody(
      env.INBOX_ENCRYPTION_KEY,
      new TextDecoder().decode(rawBytes),
    );
    const encryptedHex = bytesToPgHex(encrypted);

    let parsed;
    let parseStatus: 'parsed' | 'failed' = 'parsed';
    try {
      parsed = await callAnthropic(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL, {
        subject,
        from: message.from,
        body,
      });
    } catch (err) {
      console.error('anthropic failed', err);
      parseStatus = 'failed';
    }

    let inserted;
    try {
      inserted = await sb.insertInboxItem({
        trip_id: inbox.trip_id,
        raw_subject: subject,
        raw_from: message.from,
        raw_body_encrypted: encryptedHex,
        parse_status: parseStatus,
        parsed,
      });
    } catch (err) {
      console.error('insert failed', err);
      return;
    }

    const threshold = Number(env.AUTO_SLOT_CONFIDENCE || '0.85');
    if (parsed && parsed.confidence >= threshold && parsed.type !== 'unknown') {
      try {
        await sb.invokeSlot(inserted.id);
      } catch (err) {
        console.warn('auto-slot failed (user can slot manually)', err);
      }
    }
  },
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
