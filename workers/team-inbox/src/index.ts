/**
 * team-inbox — Cloudflare Email Worker.
 *
 * Receives mail for the public team addresses (`contact@`, `support@`, `legal@`,
 * `press@` on queer.guide), bound via per-address Email Routing rules that take
 * priority over the apex catch-all. Each message is imported over JMAP into the
 * matching mailbox on the self-hosted Stalwart server (reached through the
 * existing Cloudflare Tunnel, no mail port exposed). Twenty then syncs those
 * mailboxes over IMAP and shows them as CRM message threads.
 *
 * The message is DELIVERED here (JMAP import); nothing writes to Supabase. On
 * any failure we log and return without throwing — Cloudflare must not answer
 * 421 and have the sender redeliver into a loop. Non-team recipients are dropped
 * silently (defense in depth; the routing rules already scope us).
 */

import PostalMime from 'postal-mime';
import { resolveTeamMailbox } from './recipient';
import { getSession, uploadBlob, getInboxId, messageExists, importEmail } from './jmap';

export interface Env {
  INBOX_DOMAIN: string; // "queer.guide"
  STALWART_JMAP_URL: string; // "https://mail.queer.guide"
  MAILBOX_MAX_RAW_BYTES: string;
  // JSON secret: { "contact": "pw", "support": "pw", "legal": "pw", "press": "pw" }
  STALWART_MAILBOX_PASSWORDS: string;
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

function mailboxPassword(env: Env, localPart: string): string | null {
  try {
    const map = JSON.parse(env.STALWART_MAILBOX_PASSWORDS) as Record<string, string>;
    return map[localPart] ?? null;
  } catch (err) {
    console.error('STALWART_MAILBOX_PASSWORDS is not valid JSON', err);
    return null;
  }
}

export default {
  async email(
    message: {
      to: string;
      from: string;
      raw: ReadableStream<Uint8Array>;
      rawSize?: number;
      setReject?: (reason: string) => void;
    },
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const localPart = resolveTeamMailbox(message.to, env.INBOX_DOMAIN);
    if (!localPart) return; // not a team inbox — drop silently

    const maxRaw = Number(env.MAILBOX_MAX_RAW_BYTES || '10485760');
    if (typeof message.rawSize === 'number' && message.rawSize > maxRaw) return;

    const pass = mailboxPassword(env, localPart);
    if (!pass) {
      console.error(`no password configured for team mailbox ${localPart}`);
      return;
    }
    const user = `${localPart}@${env.INBOX_DOMAIN}`;

    const rawBytes = await readStream(message.raw);
    if (rawBytes.byteLength > maxRaw) return;

    // Best-effort Message-ID for dedupe (SMTP retries redeliver the same id).
    let messageId: string | null = null;
    try {
      const mime = await PostalMime.parse(rawBytes);
      messageId = mime.messageId ?? null;
    } catch (err) {
      console.warn('postal-mime parse failed (continuing to import)', err);
    }

    try {
      const session = await getSession(env.STALWART_JMAP_URL, user, pass);
      if (messageId && (await messageExists(session, user, pass, messageId))) return;
      const blobId = await uploadBlob(session, rawBytes, user, pass);
      const inboxId = await getInboxId(session, user, pass);
      await importEmail(session, user, pass, blobId, inboxId);
    } catch (err) {
      // Never throw out of the handler — a 421 would loop the sender. A lost
      // message is recoverable (sender bounce/resend); a redelivery storm is not.
      console.error(`team-inbox import failed for ${user}`, err);
    }
  },
};
