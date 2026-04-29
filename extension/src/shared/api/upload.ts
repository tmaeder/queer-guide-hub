import { ANON_KEY, SUPABASE_URL, jwtSub } from "./client";

/**
 * Upload a captured screenshot to the public feedback-screenshots bucket.
 * Its RLS policy allows any authenticated client to insert without a
 * path constraint, so we can use it for extension-captured page images
 * even though the original use-case is bug-report screenshots.
 *
 * Path is prefixed with the JWT sub for traceability. Returns the public
 * URL the pipeline-media-process function can fetch.
 */
export async function uploadCapture(blob: Blob, accessToken: string): Promise<string> {
  const sub = jwtSub(accessToken) ?? "anon";
  const filename = `screen-${Date.now()}.png`;
  const path = `${sub}/${filename}`;
  const url = `${SUPABASE_URL}/storage/v1/object/feedback-screenshots/${path}`;
  // Supabase storage REST expects multipart/form-data with a `file` part —
  // a raw body produces a misleading 403 RLS error rather than a 415.
  const fd = new FormData();
  fd.append("file", blob, filename);
  fd.append("cacheControl", "3600");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON_KEY,
    },
    body: fd,
  });
  if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/feedback-screenshots/${path}`;
}
