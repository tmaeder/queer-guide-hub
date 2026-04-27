/**
 * worker-submit — receives content suggestions from the queer.guide Chrome
 * extension (and potentially other authenticated clients) and stages them
 * into Supabase `ingestion_staging` for the existing pipeline to process.
 *
 *   POST /submit            — body: SubmitBody, header: Authorization: Bearer <supabase-jwt>
 *   GET  /submissions/:id   — status of own submission
 *   GET  /health
 */

import { extractBearer, verifySupabaseJwt } from "./auth";
import { getCorsHeaders, json } from "./cors";
import { sha256Hex, stableStringify } from "./hash";
import { rateLimit } from "./rate-limit";
import { entityTypeToTargetTable, SubmitBody } from "./schema";
import { getSubmissionStatus, insertStagingRow } from "./supabase";

export interface Env {
  RATE_LIMIT: KVNamespace;
  ALLOWED_ORIGINS: string;
  SUBMISSION_RATE_PER_MIN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
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
    return await verifySupabaseJwt(token, env.SUPABASE_JWT_SECRET);
  } catch {
    throw new HttpError(401, "invalid_token");
  }
}

async function handleSubmit(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const user = await authenticate(request, env).catch((e) => e);
  if (user instanceof HttpError) return json({ error: user.code }, user.status, cors);

  // Rate limit per user.
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

  // Compute payload hash + source_entity_id. source_entity_id is derived
  // from the user-submitted URL so resubmitting the same page by the same
  // user is idempotent (UNIQUE constraint on source_type+source_entity_id+
  // payload_hash). Different users get different source_names which means
  // their submissions are separate rows even for the same URL — intentional;
  // moderators see who submitted what, dedup happens later in the pipeline.
  const payloadHash = await sha256Hex(stableStringify(body.raw_data));
  const sourceEntityId = await sha256Hex(`${user.sub}|${body.source_url}`);

  const targetTable = body.target_table ?? entityTypeToTargetTable(body.entity_type) ?? "venues";

  const inserted = await insertStagingRow({
    supabaseUrl: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_KEY,
    userId: user.sub,
    body,
    payloadHash,
    sourceEntityId,
    targetTable,
  });

  return json(
    {
      submission_id: inserted.id,
      disposition: inserted.disposition,
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
  const user = await authenticate(request, env).catch((e) => e);
  if (user instanceof HttpError) return json({ error: user.code }, user.status, cors);

  const row = await getSubmissionStatus({
    supabaseUrl: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_KEY,
    userId: user.sub,
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
