/**
 * push-dispatcher — fan out Web Push notifications to a user's devices.
 *
 * Two modes, selected by the caller (pg_cron jobs in
 * 20260418010000_push_subscriptions.sql):
 *   * `{ kind: "next_item" }` — iterate reservations starting in 25–35 min.
 *   * `{ kind: "doc_expiry" }` — iterate trip_documents with 30/7 days left.
 *   * `{ user_id, title, body, url, tag }` — direct test invocation.
 *
 * Stale-endpoint handling: a 404 or 410 response from the push service
 * means the subscription is dead (user cleared site data, rotated keys,
 * uninstalled the PWA). We delete the row instead of retrying.
 *
 * VAPID keys come from function secrets:
 *   VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT
 * Generate once with `npx web-push generate-vapid-keys` and configure
 * via Project Settings → Edge Functions → Secrets. Set VAPID_SUBJECT to
 * a mailto: URL you control (e.g. mailto:alerts@queer.guide).
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:alerts@queer.guide';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

interface Subscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) throw error;

  await Promise.all(
    (subs ?? []).map(async (sub: Subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        await admin
          .from('push_subscriptions')
          .update({ last_success_at: new Date().toISOString() })
          .eq('id', sub.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('push failed', sub.id, err);
        }
      }
    }),
  );
}

async function markSent(userId: string, kind: string, refId: string): Promise<void> {
  // Insert is a no-op if the (user, kind, ref, day) row already exists.
  await admin
    .from('push_sent')
    .insert({
      user_id: userId,
      kind,
      ref_id: refId,
      day_bucket: new Date().toISOString().slice(0, 10),
    })
    .select()
    .maybeSingle();
}

async function handleNextItem(): Promise<number> {
  const { data, error } = await admin.rpc('push_next_item_candidates');
  if (error) throw error;
  let sent = 0;
  for (const row of (data ?? []) as Array<{
    reservation_id: string;
    user_id: string;
    trip_id: string | null;
    title: string;
    start_at: string;
  }>) {
    const when = new Date(row.start_at);
    const hh = when.getHours().toString().padStart(2, '0');
    const mm = when.getMinutes().toString().padStart(2, '0');
    await sendToUser(row.user_id, {
      title: row.title,
      body: `Starts at ${hh}:${mm}`,
      url: row.trip_id ? `/trips/${row.trip_id}/today` : '/trips',
      tag: `next-item:${row.reservation_id}`,
    });
    await markSent(row.user_id, 'next_item', row.reservation_id);
    sent += 1;
  }
  return sent;
}

async function handleDocExpiry(): Promise<number> {
  const { data, error } = await admin.rpc('push_doc_expiry_candidates');
  if (error) throw error;
  let sent = 0;
  for (const row of (data ?? []) as Array<{
    document_id: string;
    user_id: string;
    doc_type: string;
    title: string;
    days_out: number;
    expiry_date: string;
  }>) {
    await sendToUser(row.user_id, {
      title: `${row.title} expires in ${row.days_out} days`,
      body: `${row.doc_type.replace('_', ' ')} · ${row.expiry_date}`,
      url: '/trips',
      tag: `doc-expiry:${row.document_id}`,
    });
    await markSent(row.user_id, 'doc_expiry', row.document_id);
    sent += 1;
  }
  return sent;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* fall through */
  }

  try {
    const kind = body.kind as string | undefined;
    if (kind === 'next_item') {
      const sent = await handleNextItem();
      return new Response(JSON.stringify({ ok: true, sent }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (kind === 'doc_expiry') {
      const sent = await handleDocExpiry();
      return new Response(JSON.stringify({ ok: true, sent }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Direct test invocation: { user_id, title, body, url, tag }
    const userId = body.user_id as string | undefined;
    const title = body.title as string | undefined;
    if (!userId || !title) {
      return new Response(JSON.stringify({ error: 'user_id + title required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    await sendToUser(userId, {
      title,
      body: (body.body as string) ?? '',
      url: (body.url as string) ?? '/',
      tag: body.tag as string | undefined,
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('dispatcher error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
