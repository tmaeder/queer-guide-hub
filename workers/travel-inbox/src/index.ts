/**
 * travel-inbox — Cloudflare Email Worker.
 *
 * Receives forwarded booking-confirmation emails at `{username}@queer.guide`.
 * The local-part is a Queer Guide username → resolved to a user_id → the email
 * body is parsed via Workers AI → a `travel_inbox_items` row (status='pending')
 * is inserted → `travel_inbox_post_item` drops a rich itinerary card into the
 * user's "Travel Inbox" conversation, shown natively in /hub/messages.
 *
 * Because the address is guessable, NOTHING auto-commits: every booking lands
 * as 'pending' and the user Approves / Rejects it in the feed.
 *
 * Role mailboxes (submit@, tip@, press@, bug@, feedback@, …) are handled by
 * their own Email Routing rules and never reach this catch-all worker; we also
 * hard-drop them here as defense in depth. Unknown/reserved local-parts are
 * dropped silently — we never bounce, to avoid leaking which usernames exist.
 */

import PostalMime from 'postal-mime';
import { callWorkersAi, type AiBinding } from './workersai';
import { bytesToPgHex, encryptBody } from './crypto';
import { SupabaseClient } from './supabase';

export interface Env {
  INBOX_DOMAIN: string; // "queer.guide"
  WORKERS_AI_MODEL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  INBOX_ENCRYPTION_KEY: string;
  AI: AiBinding;
}

// Role mailboxes / impersonation handles that must never be treated as a user
// inbox even if an email somehow reaches this worker. Reserved usernames have
// no profile, so `user_id_for_username` already returns null for them — this is
// belt-and-suspenders plus it skips a needless DB round-trip.
const RESERVED_LOCAL_PARTS = new Set([
  'submit', 'tip', 'press', 'bug', 'feedback', 'info', 'hello', 'contact',
  'support', 'admin', 'noreply', 'no-reply', 'postmaster', 'hostmaster',
  'webmaster', 'abuse', 'mail', 'security', 'root', 'system', 'api', 'help',
  'team', 'staff', 'moderator', 'official',
]);

const USERNAME_RE = /^[a-z][a-z0-9._]{1,18}[a-z0-9]$/;

/**
 * Extract the username local-part from a recipient address, or null when the
 * host does not match, the shape is invalid, or it is a reserved mailbox.
 * A `+subaddress` tag is stripped (`tobias+booking@` → `tobias`).
 */
export function extractLocalPart(toAddress: string, domain: string): string | null {
  const at = toAddress.indexOf('@');
  if (at < 0) return null;
  let local = toAddress.slice(0, at).toLowerCase().trim();
  const host = toAddress.slice(at + 1).toLowerCase().trim();
  if (host !== domain.toLowerCase()) return null;
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (!local || RESERVED_LOCAL_PARTS.has(local)) return null;
  if (!USERNAME_RE.test(local)) return null;
  return local;
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
    const username = extractLocalPart(message.to, env.INBOX_DOMAIN);
    if (!username) return; // drop silently

    const sb = new SupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    let userId: string | null;
    try {
      userId = await sb.resolveUsername(username);
    } catch (err) {
      console.error('resolveUsername failed', err);
      return;
    }
    if (!userId) return; // no such user — drop silently

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

    const encrypted = await encryptBody(
      env.INBOX_ENCRYPTION_KEY,
      new TextDecoder().decode(rawBytes),
    );
    const encryptedHex = bytesToPgHex(encrypted);

    let parsed;
    let status: 'pending' | 'failed' = 'pending';
    try {
      parsed = await callWorkersAi(env.AI, env.WORKERS_AI_MODEL, {
        subject,
        from: message.from,
        body,
      });
    } catch (err) {
      console.error('workers-ai failed', err);
      status = 'failed';
    }

    let inserted;
    try {
      inserted = await sb.insertItem({
        user_id: userId,
        raw_subject: subject,
        raw_from: message.from,
        raw_body_encrypted: encryptedHex,
        status,
        parsed,
      });
    } catch (err) {
      console.error('insert failed', err);
      return;
    }

    // Surface the card in the user's Travel Inbox thread. Never auto-slot —
    // approval is required.
    try {
      await sb.postItem(inserted.id);
    } catch (err) {
      console.error('postItem failed', err);
    }
  },
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
