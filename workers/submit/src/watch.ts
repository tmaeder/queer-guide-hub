/**
 * M7 — watchlist + RSS feed registration. Both write to user-owned or
 * admin-gated tables via PostgREST with the user's JWT, so RLS does the
 * authorization. The worker only validates input shape + rate-limits.
 */

import type { Env } from "./index";

export interface WatchRow {
  id: string;
  url: string;
  frequency_minutes: number;
  is_active: boolean;
  last_checked_at: string | null;
  created_at: string;
}

export async function listWatched(opts: {
  env: Env;
  userJwt: string;
}): Promise<WatchRow[]> {
  const url = `${opts.env.SUPABASE_URL}/rest/v1/watched_urls?select=id,url,frequency_minutes,is_active,last_checked_at,created_at&order=created_at.desc&limit=100`;
  const res = await fetch(url, {
    headers: {
      apikey: opts.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${opts.userJwt}`,
    },
  });
  if (!res.ok) throw new Error(`watch list ${res.status}: ${await res.text()}`);
  return (await res.json()) as WatchRow[];
}

export async function addWatch(opts: {
  env: Env;
  userJwt: string;
  userId: string;
  url: string;
  frequencyMinutes: number;
}): Promise<WatchRow> {
  const row = {
    user_id: opts.userId,
    url: opts.url,
    frequency_minutes: opts.frequencyMinutes,
    is_active: true,
  };
  const res = await fetch(
    `${opts.env.SUPABASE_URL}/rest/v1/watched_urls?on_conflict=user_id,url`,
    {
      method: "POST",
      headers: {
        apikey: opts.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${opts.userJwt}`,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    },
  );
  if (!res.ok) throw new Error(`watch insert ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as WatchRow[];
  if (!data[0]) throw new Error("watch insert empty");
  return data[0];
}

export async function deleteWatch(opts: {
  env: Env;
  userJwt: string;
  id: string;
}): Promise<void> {
  const res = await fetch(
    `${opts.env.SUPABASE_URL}/rest/v1/watched_urls?id=eq.${encodeURIComponent(opts.id)}`,
    {
      method: "DELETE",
      headers: {
        apikey: opts.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${opts.userJwt}`,
      },
    },
  );
  if (!res.ok) throw new Error(`watch delete ${res.status}: ${await res.text()}`);
}

export async function addNewsFeed(opts: {
  env: Env;
  userJwt: string;
  url: string;
  name: string;
  category: string;
  frequencyMinutes: number;
}): Promise<{ id: string; name: string; url: string }> {
  // Quick sanity check: HEAD the feed URL to make sure it responds.
  // Not a strict content-type check — some feeds serve text/html.
  try {
    const probe = await fetch(opts.url, { method: "HEAD" });
    if (!probe.ok && probe.status !== 405) {
      throw new Error(`feed unreachable: ${probe.status}`);
    }
  } catch (e) {
    throw new Error(`feed probe failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const row = {
    name: opts.name,
    url: opts.url,
    source_type: "rss" as const,
    category: opts.category,
    is_active: true,
    fetch_frequency: opts.frequencyMinutes,
  };
  const res = await fetch(`${opts.env.SUPABASE_URL}/rest/v1/news_sources`, {
    method: "POST",
    headers: {
      apikey: opts.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${opts.userJwt}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`news_sources insert ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as Array<{ id: string; name: string; url: string }>;
  if (!data[0]) throw new Error("news_sources insert empty");
  return data[0];
}
