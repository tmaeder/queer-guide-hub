/**
 * resend-webhook — inbound Resend webhook receiver.
 *
 * Verifies Svix-style signature (https://resend.com/docs/dashboard/webhooks)
 * using `RESEND_WEBHOOK_SECRET`, finds the corresponding reply entry in
 * `community_submissions.data.replies[*].email_id`, and updates its
 * delivery state (`delivered_at` / `opened_at` / `bounced_at` /
 * `bounce_reason`). So the drawer thread can show "Email delivered" /
 * "Email bounced" chips alongside the admin reply.
 *
 * Idempotent via `webhook_deliveries.delivery_id` = Svix-Id header.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256Base64(secretB64: string, message: string): Promise<string> {
  const keyBytes = b64ToBytes(secretB64);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

interface ResendEvent {
  type: string; // e.g. 'email.sent', 'email.delivered', 'email.bounced', 'email.opened'
  created_at: string;
  data: {
    email_id?: string;
    id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    reason?: string; // on bounce
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!rawSecret) return json({ error: 'Webhook secret not configured' }, 500);
  // Resend secrets start with "whsec_" followed by base64. Strip prefix if present.
  const secret = rawSecret.startsWith('whsec_') ? rawSecret.slice(6) : rawSecret;

  const svixId = req.headers.get('svix-id') ?? '';
  const svixTs = req.headers.get('svix-timestamp') ?? '';
  const svixSig = req.headers.get('svix-signature') ?? '';
  if (!svixId || !svixTs || !svixSig) {
    return json({ error: 'Missing Svix headers' }, 400);
  }

  const raw = await req.text();
  const toSign = `${svixId}.${svixTs}.${raw}`;
  const expected = await hmacSha256Base64(secret, toSign);

  // Svix signature header format: "v1,<b64sig> v1,<b64sig2> ..."
  // We accept any match.
  const parts = svixSig.split(' ');
  let matched = false;
  for (const p of parts) {
    const [, sig] = p.split(',');
    if (sig && timingSafeEqual(sig, expected)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    return json({ error: 'Invalid signature' }, 401);
  }

  const svc = getServiceClient();

  const { error: dupErr } = await svc
    .from('webhook_deliveries')
    .insert({ delivery_id: svixId, source: 'resend' });
  if (dupErr) {
    const code = (dupErr as { code?: string }).code;
    if (code === '23505') return json({ success: true, already_processed: true });
    return json({ error: `Delivery log failed: ${dupErr.message}` }, 500);
  }

  let payload: ResendEvent;
  try {
    payload = JSON.parse(raw) as ResendEvent;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const emailId = payload.data?.email_id ?? payload.data?.id ?? null;
  if (!emailId) return json({ success: true, skipped: 'no email id' });

  // Find the submission whose data.replies[*] contains a reply with this email_id.
  const { data: row } = await svc
    .from('community_submissions')
    .select('id,data')
    .filter('data->replies', 'cs', JSON.stringify([{ email_id: emailId }]))
    .maybeSingle();

  if (!row) {
    // Fall back to scanning via jsonb path — contains-search on array of objects
    // isn't universally supported; do a broader query and filter locally.
    const { data: candidates } = await svc
      .from('community_submissions')
      .select('id,data')
      .eq('content_type', 'feedback')
      .gte('submitted_at', new Date(Date.now() - 30 * 86400_000).toISOString());
    const match = (candidates || []).find((c) => {
      const replies = (c.data as { replies?: Array<Record<string, unknown>> })?.replies;
      return Array.isArray(replies) && replies.some((r) => r.email_id === emailId);
    });
    if (!match) return json({ success: true, skipped: 'no matching submission' });
    return await applyUpdate(svc, match.id, (match.data ?? {}) as Record<string, unknown>);
  }

  return await applyUpdate(svc, row.id, (row.data ?? {}) as Record<string, unknown>);

  async function applyUpdate(
    client: SupabaseClient,
    id: string,
    data: Record<string, unknown>,
  ): Promise<Response> {
    const replies = Array.isArray(data.replies)
      ? (data.replies as Array<Record<string, unknown>>)
      : [];
    const now = new Date().toISOString();
    let changed = false;
    const nextReplies = replies.map((r) => {
      if (r.email_id !== emailId) return r;
      changed = true;
      switch (payload.type) {
        case 'email.delivered':
          return { ...r, delivered_at: now };
        case 'email.opened':
          return { ...r, opened_at: now };
        case 'email.bounced':
          return { ...r, bounced_at: now, bounce_reason: payload.data.reason ?? null };
        case 'email.complained':
          return { ...r, complained_at: now };
        default:
          return r;
      }
    });
    if (!changed) {
      return json({ success: true, skipped: `no matching reply for ${payload.type}` });
    }
    const { error: updErr } = await client
      .from('community_submissions')
      .update({ data: { ...data, replies: nextReplies } })
      .eq('id', id);
    if (updErr) return json({ error: updErr.message }, 500);
    return json({ success: true, event: payload.type, submission_id: id });
  }
});
