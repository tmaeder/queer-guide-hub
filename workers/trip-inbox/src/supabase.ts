/**
 * Thin Supabase REST helper for the trip-inbox worker. Uses the service-role
 * key, which bypasses RLS — every call here is server-only and validates
 * inputs against `trip_inboxes.short_id` first.
 */

import type { ParsedBooking } from './prompt';

export interface InboxRow {
  id: string;
  trip_id: string;
  revoked_at: string | null;
  created_by: string;
}

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

  async findInboxByShortId(shortId: string): Promise<InboxRow | null> {
    const u = new URL(`${this.url}/rest/v1/trip_inboxes`);
    u.searchParams.set('select', 'id,trip_id,revoked_at,created_by');
    u.searchParams.set('short_id', `eq.${shortId}`);
    u.searchParams.set('limit', '1');
    const r = await fetch(u, { headers: this.headers() });
    if (!r.ok) throw new Error(`findInboxByShortId: ${r.status} ${await r.text()}`);
    const rows = (await r.json()) as InboxRow[];
    return rows[0] ?? null;
  }

  async insertInboxItem(row: {
    trip_id: string;
    raw_subject: string;
    raw_from: string;
    raw_body_encrypted: string; // \x... hex literal
    parse_status: 'parsed' | 'failed';
    parsed?: ParsedBooking;
  }): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      trip_id: row.trip_id,
      raw_subject: row.raw_subject,
      raw_from: row.raw_from,
      raw_body_encrypted: row.raw_body_encrypted,
      parse_status: row.parse_status,
    };
    if (row.parsed) {
      body.parse_confidence = row.parsed.confidence;
      body.parsed_type = row.parsed.type;
      body.parsed_vendor = row.parsed.vendor;
      body.parsed_title = row.parsed.title;
      body.parsed_start_at = row.parsed.start;
      body.parsed_end_at = row.parsed.end;
      body.parsed_location = row.parsed.location;
      body.parsed_price = row.parsed.price;
      body.parsed_currency = row.parsed.currency;
      body.parsed_confirmation = row.parsed.confirmation;
    }
    const r = await fetch(`${this.url}/rest/v1/trip_inbox_items`, {
      method: 'POST',
      headers: this.headers({ prefer: 'return=representation' }),
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`insertInboxItem: ${r.status} ${await r.text()}`);
    const rows = (await r.json()) as Array<{ id: string }>;
    return rows[0]!;
  }

  async invokeSlot(itemId: string): Promise<void> {
    // Calls the trip-inbox-slot edge function with service-role auth.
    const r = await fetch(`${this.url}/functions/v1/trip-inbox-slot`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ item_id: itemId }),
    });
    if (!r.ok) throw new Error(`invokeSlot: ${r.status} ${await r.text()}`);
  }
}
