import type { DetectedItem, SubmitResponse } from "../types";
import { API, authHeaders, ensureOk } from "./client";

export async function submitItem(
  item: DetectedItem,
  accessToken: string,
  notes?: string,
): Promise<SubmitResponse> {
  const res = await fetch(`${API}/submit`, {
    method: "POST",
    headers: authHeaders(accessToken, true),
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
  await ensureOk(res, "submit");
  return (await res.json()) as SubmitResponse;
}
