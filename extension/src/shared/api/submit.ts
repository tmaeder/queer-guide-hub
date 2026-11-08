import type { DetectedItem, SubmitResponse } from "../types";

const API = import.meta.env.VITE_SUBMIT_API as string;

export async function submitItem(
  item: DetectedItem,
  accessToken: string,
  notes?: string,
): Promise<SubmitResponse> {
  const res = await fetch(`${API}/submit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
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
  if (!res.ok) throw new Error(`submit ${res.status}: ${await res.text()}`);
  return (await res.json()) as SubmitResponse;
}
