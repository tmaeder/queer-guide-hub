import { API, authHeaders, ensureOk } from "./client";

export interface WatchedRow {
  id: string;
  url: string;
  frequency_minutes: number;
  is_active: boolean;
  last_checked_at: string | null;
  last_fingerprint?: string | null;
  created_at: string;
}

export async function listWatched(accessToken: string): Promise<WatchedRow[]> {
  const res = await fetch(`${API}/watch`, { headers: authHeaders(accessToken) });
  await ensureOk(res, "watch list");
  const body = (await res.json()) as { rows: WatchedRow[] };
  return body.rows;
}

export async function addWatched(url: string, accessToken: string): Promise<WatchedRow> {
  const res = await fetch(`${API}/watch`, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ url }),
  });
  await ensureOk(res, "watch add");
  return (await res.json()) as WatchedRow;
}

export async function removeWatched(id: string, accessToken: string): Promise<void> {
  const res = await fetch(`${API}/watch/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  await ensureOk(res, "watch del");
}
