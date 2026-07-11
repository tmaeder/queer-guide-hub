/**
 * Thin Supabase REST helper for the travel-inbox worker. Uses the service-role
 * key, which bypasses RLS — every call here is server-only. Username resolution
 * and card posting both go through SECURITY DEFINER RPCs.
 */

import type { ParsedBooking } from './prompt';
import { toStoredType } from './prompt';

export class SupabaseClient {
  constructor(
    private readonly url: string,
    private readonly key: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      apikey: this.key,
      authorization: `Bearer ${this.key}`,
      'content-type': 'application/json',
      ...extra,
    };
  }

  /** Resolve an inbound username local-part → user_id, or null. */
  async resolveUsername(username: string): Promise<string | null> {
    const r = await fetch(`${this.url}/rest/v1/rpc/user_id_for_username`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_text: username }),
    });
    if (!r.ok) throw new Error(`resolveUsername: ${r.status} ${await r.text()}`);
    const uid = (await r.json()) as string | null;
    return uid ?? null;
  }

  async insertItem(row: {
    user_id: string;
    raw_subject: string;
    raw_from: string;
    raw_body_encrypted: string; // \x... hex literal
    status: 'pending' | 'failed';
    parsed?: ParsedBooking;
  }): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      user_id: row.user_id,
      raw_subject: row.raw_subject,
      raw_from: row.raw_from,
      raw_body_encrypted: row.raw_body_encrypted,
      status: row.status,
    };
    if (row.parsed) {
      body.parse_confidence = row.parsed.confidence;
      body.parsed_type = toStoredType(row.parsed.type);
      body.parsed_vendor = row.parsed.vendor;
      body.parsed_title = row.parsed.title;
      body.parsed_start_at = row.parsed.start;
      body.parsed_end_at = row.parsed.end;
      body.parsed_location = row.parsed.location;
      body.parsed_price = row.parsed.price;
      body.parsed_currency = row.parsed.currency;
      body.parsed_confirmation = row.parsed.confirmation;
    }
    const r = await fetch(`${this.url}/rest/v1/travel_inbox_items`, {
      method: 'POST',
      headers: this.headers({ prefer: 'return=representation' }),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`insertItem: ${r.status} ${await r.text()}`);
    const rows = (await r.json()) as Array<{ id: string }>;
    return rows[0]!;
  }

  /** Inbound emails for this owner in the last hour (rate-limit input). */
  async countRecentInbound(ownerId: string): Promise<number> {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const u = new URL(`${this.url}/rest/v1/mailbox_emails`);
    u.searchParams.set('select', 'id');
    u.searchParams.set('owner_id', `eq.${ownerId}`);
    u.searchParams.set('direction', 'eq.inbound');
    u.searchParams.set('created_at', `gte.${since}`);
    const r = await fetch(u, {
      method: 'HEAD',
      headers: this.headers({ prefer: 'count=exact' }),
    });
    if (!r.ok) throw new Error(`countRecentInbound: ${r.status}`);
    const total = Number((r.headers.get('content-range') ?? '').split('/')[1]);
    return Number.isFinite(total) ? total : 0;
  }

  /** First existing email of this owner matching any of the Message-IDs. */
  async findParentByMessageId(
    ownerId: string,
    messageIds: string[],
  ): Promise<{ id: string; thread_id: string | null } | null> {
    if (!messageIds.length) return null;
    const list = messageIds.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
    const u = new URL(`${this.url}/rest/v1/mailbox_emails`);
    u.searchParams.set('select', 'id,thread_id');
    u.searchParams.set('owner_id', `eq.${ownerId}`);
    u.searchParams.set('message_id_header', `in.(${list})`);
    u.searchParams.set('limit', '1');
    const r = await fetch(u, { headers: this.headers() });
    if (!r.ok) throw new Error(`findParentByMessageId: ${r.status} ${await r.text()}`);
    const rows = (await r.json()) as Array<{ id: string; thread_id: string | null }>;
    return rows[0] ?? null;
  }

  async insertMailboxEmail(row: Record<string, unknown>): Promise<{ id: string }> {
    const r = await fetch(`${this.url}/rest/v1/mailbox_emails`, {
      method: 'POST',
      headers: this.headers({ prefer: 'return=representation' }),
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`insertMailboxEmail: ${r.status} ${await r.text()}`);
    const rows = (await r.json()) as Array<{ id: string }>;
    return rows[0]!;
  }

  /** Post the item as a pending itinerary card in the user's Travel Inbox thread. */
  async postItem(itemId: string): Promise<void> {
    const r = await fetch(`${this.url}/rest/v1/rpc/travel_inbox_post_item`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ p_item_id: itemId }),
    });
    if (!r.ok) throw new Error(`postItem: ${r.status} ${await r.text()}`);
  }
}
