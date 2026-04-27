/**
 * worker-submit — receives content suggestions from the queer.guide Chrome
 * extension (and other authenticated clients) and writes them into Supabase
 * `community_submissions` (the canonical user-submission table). The
 * existing `source-community-submissions` edge function then promotes them
 * into ingestion_staging for the rest of the pipeline (normalize → media
 * → dedupe → quality → review-gate → commit).
 *
 *   POST /submit            — body: SubmitBody, header: Authorization: Bearer <supabase-jwt>
 *   GET  /submissions/:id   — status of own submission
 *   GET  /health
 *
 * The worker forwards the user's JWT to PostgREST so the existing RLS
 * policy `Users can create submissions` (`submitted_by = auth.uid()`)
 * authorizes the write. We still verify the JWT locally first to gate
 * rate-limit + body validation, and to bail out fast on invalid tokens.
 */

import { extractBearer, verifySupabaseJwt } from "./auth";
import { getCorsHeaders, json } from "./cors";
import { rateLimit } from "./rate-limit";
import { SubmitBody } from "./schema";
import { getSubmissionStatus, insertSubmission } from "./supabase";

export interface Env {
  RATE_LIMIT: KVNamespace;
  ALLOWED_ORIGINS: string;
  SUBMISSION_RATE_PER_MIN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_JWT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = getCorsHeaders(request, env.ALLOWED_ORIGINS);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);

    try {
      if (url.pathname === "/health") {
        return json({ ok: true, ts: Date.now() }, 200, cors);
      }

      if (url.pathname === "/submit" && request.method === "POST") {
        return await handleSubmit(request, env, cors);
      }

      const statusMatch = url.pathname.match(/^\/submissions\/([^/]+)$/);
      if (statusMatch && request.method === "GET") {
        return await handleStatus(request, env, statusMatch[1]!, cors);
      }

      return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      console.error("worker-submit error", err);
      const message = err instanceof Error ? err.message : "unknown";
      return json({ error: "internal", message }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;

async function authenticate(request: Request, env: Env) {
  const token = extractBearer(request);
  if (!token) throw new HttpError(401, "missing_bearer");
  try {
    const user = await verifySupabaseJwt(token, env.SUPABASE_JWT_SECRET);
    return { user, token };
  } catch {
    throw new HttpError(401, "invalid_token");
  }
}

async function handleSubmit(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);
  const { user, token } = auth;

  const perMin = parseInt(env.SUBMISSION_RATE_PER_MIN || "10", 10);
  const rl = await rateLimit(env.RATE_LIMIT, user.sub, perMin);
  if (!rl.ok) {
    return json({ error: "rate_limited", retry_after: rl.retryAfter }, 429, {
      ...cors,
      "Retry-After": String(rl.retryAfter),
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }
  const parsed = SubmitBody.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid_body", issues: parsed.error.issues }, 400, cors);
  }
  const body = parsed.data;

  const inserted = await insertSubmission({
    supabaseUrl: env.SUPABASE_URL,
    userJwt: token,
    anonKey: env.SUPABASE_ANON_KEY,
    userId: user.sub,
    body,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return json(
    {
      submission_id: inserted.id,
      status: inserted.status,
      rate_limit_remaining: rl.remaining,
    },
    202,
    cors,
  );
}

async function handleStatus(
  request: Request,
  env: Env,
  id: string,
  cors: HeadersInit,
): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);

  const row = await getSubmissionStatus({
    supabaseUrl: env.SUPABASE_URL,
    userJwt: auth.token,
    anonKey: env.SUPABASE_ANON_KEY,
    id,
  });
  if (!row) return json({ error: "not_found" }, 404, cors);
  return json(row, 200, cors);
}

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
