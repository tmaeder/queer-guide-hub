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
