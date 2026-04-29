import { API, authHeaders, ensureOk } from "./client";

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
    headers: authHeaders(accessToken, true),
    body: JSON.stringify({ url, title, description }),
  });
  await ensureOk(res, "enrich");
  return (await res.json()) as EnrichResponse;
}
