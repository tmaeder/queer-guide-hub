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

import { embedText, enrich, suggestTagsFromNeighbours } from "./ai";
import { extractBearer, verifySupabaseJwt } from "./auth";
import { getCorsHeaders, json } from "./cors";
import { rateLimit } from "./rate-limit";
import { BulkSubmitBody, EnrichBody, FindSimilarBody, RenderBody, ScanSitemapBody, SubmitBody, WatchBody, WatchFeedBody } from "./schema";
import { renderAndExtract } from "./render";
import { fetchSitemap } from "./sitemap";
import { findSimilar, getSubmissionStatus, insertSubmission, insertSubmissionBatch } from "./supabase";
import { addNewsFeed, addWatch, deleteWatch, listWatched } from "./watch";

export interface Env {
  AI: Ai;
  RATE_LIMIT: KVNamespace;
  ALLOWED_ORIGINS: string;
  SUBMISSION_RATE_PER_MIN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_JWT_SECRET: string;
  AI_GATEWAY_NAME?: string;
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

      if (url.pathname === "/enrich" && request.method === "POST") {
        return await handleEnrich(request, env, cors);
      }

      if (url.pathname === "/find-similar" && request.method === "POST") {
        return await handleFindSimilar(request, env, cors);
      }

      if (url.pathname === "/watch") {
        if (request.method === "GET") return await handleListWatch(request, env, cors);
        if (request.method === "POST") return await handleAddWatch(request, env, cors);
      }
      const delMatch = url.pathname.match(/^\/watch\/([^/]+)$/);
      if (delMatch && request.method === "DELETE") {
        return await handleDeleteWatch(request, env, delMatch[1]!, cors);
      }
      if (url.pathname === "/watch-feed" && request.method === "POST") {
        return await handleAddFeed(request, env, cors);
      }

      if (url.pathname === "/scan-sitemap" && request.method === "POST") {
        return await handleScanSitemap(request, env, cors);
      }
      if (url.pathname === "/bulk-submit" && request.method === "POST") {
        return await handleBulkSubmit(request, env, cors);
      }
      if (url.pathname === "/render" && request.method === "POST") {
        return await handleRender(request, env, cors);
      }
      if (url.pathname === "/known-urls" && request.method === "GET") {
        return await handleKnownUrls(env, cors);
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
    const user = await verifySupabaseJwt(token, env.SUPABASE_JWT_SECRET, env.SUPABASE_URL);
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

async function handleEnrich(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);
  const { user } = auth;

  // Same rate-limit bucket as /submit so users can't spam Workers AI for free.
  const perMin = parseInt(env.SUBMISSION_RATE_PER_MIN || "10", 10);
  const rl = await rateLimit(env.RATE_LIMIT, user.sub, perMin);
  if (!rl.ok) {
    return json({ error: "rate_limited", retry_after: rl.retryAfter }, 429, {
      ...cors,
      "Retry-After": String(rl.retryAfter),
    });
  }

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }
  const parsed = EnrichBody.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_body", issues: parsed.error.issues }, 400, cors);

  const text = `${parsed.data.title ?? ""}. ${parsed.data.description ?? ""}`.trim();
  const [summaryOut, tags] = await Promise.all([
    enrich(env, parsed.data),
    text.length > 6
      ? embedText(env, text).then((vec) => suggestTagsFromNeighbours(env, vec, auth.token, 5)).catch(() => [])
      : Promise.resolve<string[]>([]),
  ]);

  return json({ summary: summaryOut.summary, suggested_tags: tags }, 200, cors);
}

async function handleFindSimilar(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
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
  try { raw = await request.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }
  const parsed = FindSimilarBody.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_body", issues: parsed.error.issues }, 400, cors);

  const embedding = await embedText(env, parsed.data.text);
  let hits = await findSimilar({
    supabaseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    userJwt: token,
    embedding,
    limit: parsed.data.limit ?? 5,
  });
  if (parsed.data.content_types?.length) {
    const allow = new Set(parsed.data.content_types);
    hits = hits.filter((h) => allow.has(h.content_type));
  }
  return json({ hits }, 200, cors);
}

async function handleListWatch(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);
  const rows = await listWatched({ env, userJwt: auth.token });
  return json({ rows }, 200, cors);
}

async function handleAddWatch(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);
  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }
  const parsed = WatchBody.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_body", issues: parsed.error.issues }, 400, cors);
  const row = await addWatch({
    env,
    userJwt: auth.token,
    userId: auth.user.sub,
    url: parsed.data.url,
    frequencyMinutes: parsed.data.frequency_minutes ?? 360,
  });
  return json(row, 201, cors);
}

async function handleDeleteWatch(request: Request, env: Env, id: string, cors: HeadersInit): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);
  await deleteWatch({ env, userJwt: auth.token, id });
  return json({ ok: true }, 200, cors);
}

async function handleAddFeed(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);
  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }
  const parsed = WatchFeedBody.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_body", issues: parsed.error.issues }, 400, cors);
  const row = await addNewsFeed({
    env,
    userJwt: auth.token,
    url: parsed.data.url,
    name: parsed.data.name,
    category: parsed.data.category ?? "general",
    frequencyMinutes: parsed.data.frequency_minutes ?? 60,
  });
  return json(row, 201, cors);
}

async function handleScanSitemap(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);

  // Sitemap fetch is heavier than a regular submit — same per-user bucket.
  const perMin = parseInt(env.SUBMISSION_RATE_PER_MIN || "10", 10);
  const rl = await rateLimit(env.RATE_LIMIT, auth.user.sub, perMin);
  if (!rl.ok) return json({ error: "rate_limited", retry_after: rl.retryAfter }, 429, cors);

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }
  const parsed = ScanSitemapBody.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_body", issues: parsed.error.issues }, 400, cors);

  const entries = await fetchSitemap(parsed.data.url);
  return json({ entries }, 200, cors);
}

async function handleBulkSubmit(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }
  const parsed = BulkSubmitBody.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_body", issues: parsed.error.issues }, 400, cors);

  // Counts as N submissions toward the rate limiter.
  const perMin = parseInt(env.SUBMISSION_RATE_PER_MIN || "10", 10);
  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  for (let i = 0; i < parsed.data.items.length; i++) {
    const rl = await rateLimit(env.RATE_LIMIT, auth.user.sub, perMin);
    if (!rl.ok) return json({ error: "rate_limited", retry_after: rl.retryAfter, completed: i }, 429, cors);
  }
  void ip;

  const inserted = await insertSubmissionBatch({
    supabaseUrl: env.SUPABASE_URL,
    userJwt: auth.token,
    anonKey: env.SUPABASE_ANON_KEY,
    userId: auth.user.sub,
    bodies: parsed.data.items,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return json({ submissions: inserted.map((r) => ({ id: r.id, status: r.status })) }, 202, cors);
}

/**
 * M9.1 — known-URL list for the inline overlay content_script. Returns a
 * compact JSON of (domain | url, slug, type) tuples covering all
 * publicly-listed venues, events and news. Edge-cached 1h via the Cache
 * API so the per-tab content_script just hits CF cache, not Supabase.
 */
async function handleKnownUrls(env: Env, cors: HeadersInit): Promise<Response> {
  const cacheKey = new Request("https://known-urls.queer.guide/v1");
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) {
    const body = await hit.text();
    return new Response(body, { status: 200, headers: { ...cors, "Content-Type": "application/json", "X-Cache": "HIT" } });
  }

  const sb = (path: string) => fetch(`${env.SUPABASE_URL}${path}`, {
    headers: { apikey: env.SUPABASE_ANON_KEY },
  }).then((r) => (r.ok ? r.json() : []));

  const [venues, events, news] = (await Promise.all([
    sb("/rest/v1/venues?select=website_domain,slug&website_domain=not.is.null&limit=5000"),
    sb("/rest/v1/events?select=website,slug&website=not.is.null&limit=5000"),
    sb("/rest/v1/news_articles?select=url,slug&url=not.is.null&limit=5000"),
  ])) as [
    Array<{ website_domain: string; slug: string }>,
    Array<{ website: string; slug: string }>,
    Array<{ url: string; slug: string }>,
  ];

  const payload = {
    domains: venues.filter((v) => v.website_domain && v.slug).map((v) => [v.website_domain, v.slug]),
    eventUrls: events.filter((e) => e.website && e.slug).map((e) => [e.website, e.slug]),
    newsUrls: news.filter((n) => n.url && n.slug).map((n) => [n.url, n.slug]),
  };

  const body = JSON.stringify(payload);
  const res = new Response(body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "X-Cache": "MISS",
    },
  });
  await cache.put(cacheKey, res.clone());
  return res;
}

async function handleRender(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const auth = await authenticate(request, env).catch((e) => e);
  if (auth instanceof HttpError) return json({ error: auth.code }, auth.status, cors);

  const perMin = parseInt(env.SUBMISSION_RATE_PER_MIN || "10", 10);
  const rl = await rateLimit(env.RATE_LIMIT, auth.user.sub, perMin);
  if (!rl.ok) return json({ error: "rate_limited", retry_after: rl.retryAfter }, 429, cors);

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }
  const parsed = RenderBody.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_body", issues: parsed.error.issues }, 400, cors);

  const items = await renderAndExtract(parsed.data.url);
  return json({ items }, 200, cors);
}

class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
