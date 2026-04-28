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
