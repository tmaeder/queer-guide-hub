import type { DetectedItem, SubmitResponse } from "./types";

const API = import.meta.env.VITE_SUBMIT_API as string;

export async function submitItem(
  item: DetectedItem,
  accessToken: string,
  notes?: string,
): Promise<SubmitResponse> {
  const res = await fetch(`${API}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      entity_type: item.entity_type,
      raw_data: item.raw_data,
      source_url: item.source_url,
      client: `extension/${chrome.runtime.getManifest().version}`,
      notes,
      field_confidence: item.field_confidence,
      extraction_method: item.extraction_method,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`submit failed ${res.status}: ${text}`);
  }
  return (await res.json()) as SubmitResponse;
}

export interface EnrichResponse {
  summary: string;
  suggested_tags: string[];
}

export async function enrichItem(
  url: string,
  title: string | undefined,
  description: string | undefined,
  accessToken: string,
): Promise<EnrichResponse> {
  const res = await fetch(`${API}/enrich`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ url, title, description }),
  });
  if (!res.ok) throw new Error(`enrich ${res.status}: ${await res.text()}`);
  return (await res.json()) as EnrichResponse;
}

export async function fetchStatus(
  id: string | number,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/submissions/${encodeURIComponent(String(id))}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export interface SubmissionRow {
  id: string;
  content_type: string;
  status: string;
  feedback_status: string;
  source_url: string | null;
  submitted_at: string;
  data: Record<string, unknown>;
  promoted_to_table: string | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Recent submissions for the signed-in user. RLS on community_submissions
 * scopes the result to `submitted_by = auth.uid()` so we don't need the
 * worker — PostgREST + the user's access token is enough.
 */
export async function fetchMySubmissions(accessToken: string, limit = 10): Promise<SubmissionRow[]> {
  const url = `${SUPABASE_URL}/rest/v1/community_submissions?select=id,content_type,status,feedback_status,source_url,submitted_at,data,promoted_to_table&order=submitted_at.desc&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) throw new Error(`history ${res.status}: ${await res.text()}`);
  return (await res.json()) as SubmissionRow[];
}

export interface ExistingMatch {
  table: "venues" | "events" | "news_articles";
  id: string;
  slug: string | null;
  title: string;
}

/**
 * Reverse lookup — is this URL already a known entity in queer.guide?
 * Reads the public RLS-allowed canonical tables directly via PostgREST.
 * Uses `venues.website_domain` (computed + indexed) for venues, exact
 * `website` / `url` matches for events and news.
 */
export async function findExisting(sourceUrl: string): Promise<ExistingMatch | null> {
  let host = "";
  try { host = new URL(sourceUrl).host.replace(/^www\./, ""); } catch { return null; }
  if (!host) return null;
  const headers = { apikey: ANON_KEY };
  const enc = encodeURIComponent;
  const url = enc(sourceUrl);
  const queries = [
    {
      table: "venues" as const,
      url: `${SUPABASE_URL}/rest/v1/venues?website_domain=eq.${enc(host)}&select=id,slug,name&limit=1`,
      titleField: "name" as const,
    },
    {
      table: "events" as const,
      url: `${SUPABASE_URL}/rest/v1/events?website=eq.${url}&select=id,slug,title&limit=1`,
      titleField: "title" as const,
    },
    {
      table: "news_articles" as const,
      url: `${SUPABASE_URL}/rest/v1/news_articles?url=eq.${url}&select=id,slug,title&limit=1`,
      titleField: "title" as const,
    },
  ];
  const responses = await Promise.allSettled(
    queries.map((q) => fetch(q.url, { headers }).then((r) => (r.ok ? r.json() : []))),
  );
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    if (!r || r.status !== "fulfilled") continue;
    const rows = r.value as Array<Record<string, unknown>>;
    if (rows.length === 0) continue;
    const row = rows[0]!;
    const q = queries[i]!;
    return {
      table: q.table,
      id: String(row.id),
      slug: typeof row.slug === "string" ? row.slug : null,
      title: String(row[q.titleField] ?? "(unnamed)"),
    };
  }
  return null;
}
