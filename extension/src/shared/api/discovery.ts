import { API, SUPABASE_URL, authHeaders, ensureOk, pgrstHeaders } from "./client";

export interface SimilarHit {
  content_id: string;
  content_type: string;
  content_text: string;
  similarity: number;
  metadata: { slug?: string; city?: string; tags?: string[] } | null;
}

export async function findSimilarItems(
  text: string,
  contentTypes: string[],
  accessToken: string,
  limit = 3,
): Promise<SimilarHit[]> {
  const res = await fetch(`${API}/find-similar`, {
    method: "POST",
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ text, content_types: contentTypes, limit }),
  });
  await ensureOk(res, "find-similar");
  const body = (await res.json()) as { hits: SimilarHit[] };
  return body.hits;
}

export interface ExistingMatch {
  table: "venues" | "events" | "news_articles";
  id: string;
  slug: string | null;
  title: string;
}

/**
 * Reverse lookup — is this URL already a known entity in queer.guide?
 * Single round-trip via the `find_existing_by_url(p_url)` RPC, which
 * unions venues / events / news_articles server-side and returns at most
 * one row. Replaces three parallel PostgREST calls.
 */
export async function findExisting(sourceUrl: string): Promise<ExistingMatch | null> {
  try { new URL(sourceUrl); } catch { return null; }
  const url = `${SUPABASE_URL}/rest/v1/rpc/find_existing_by_url`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...pgrstHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ p_url: sourceUrl }),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    source: string;
    id: string;
    slug: string | null;
    title: string | null;
  }>;
  const row = rows[0];
  if (!row) return null;
  const table = row.source === "venues" || row.source === "events" || row.source === "news_articles"
    ? row.source
    : null;
  if (!table) return null;
  return {
    table,
    id: String(row.id),
    slug: typeof row.slug === "string" ? row.slug : null,
    title: row.title ?? "(unnamed)",
  };
}
