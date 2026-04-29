import { getValidAccessToken } from "../auth";
import { ANON_KEY, SUPABASE_URL, jwtSub } from "./client";

const BUCKET = "feedback-screenshots";

/**
 * Upload a captured screenshot to the public feedback-screenshots bucket.
 * The bucket's RLS policy ("Anyone can upload feedback screenshots") permits
 * any authenticated insert, but in practice we still hit transient 400/403
 * RLS denials when the access token is stale (e.g. machine sleeping for an
 * hour, then waking up before getValidAccessToken's 30s skew check fires).
 *
 * Strategy: do one attempt; on a 4xx, force a refresh and retry once. The
 * refresh is unconditional on retry — it fetches a new token from
 * /auth/v1/token even if the cached one is still nominally valid.
 *
 * Path is prefixed with the JWT sub for traceability. Returns the public
 * URL the pipeline-media-process function can fetch.
 */
export async function uploadCapture(blob: Blob, accessToken: string): Promise<string> {
  try {
    return await tryUpload(blob, accessToken);
  } catch (e) {
    if (!isRetryable(e)) throw e;
    const refreshed = await getValidAccessToken();
    if (!refreshed) throw e;
    return tryUpload(blob, refreshed);
  }
}

async function tryUpload(blob: Blob, accessToken: string): Promise<string> {
  const sub = jwtSub(accessToken) ?? "anon";
  const filename = `screen-${Date.now()}.png`;
  const path = `${sub}/${filename}`;
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`;
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
  if (!res.ok) {
    const body = await res.text();
    throw new UploadError(res.status, body);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

class UploadError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`upload ${status}: ${body}`);
    this.status = status;
  }
}

function isRetryable(e: unknown): e is UploadError {
  return e instanceof UploadError && (e.status === 400 || e.status === 401 || e.status === 403);
}
