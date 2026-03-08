import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.50.5";

/**
 * Redirect Handler Edge Function
 *
 * Resolves short links (/go/:slug) server-side with:
 * - DB lookup via resolve_short_redirect() function
 * - Query parameter handling (preserve/drop/override + UTM defaults)
 * - Atomic click recording via record_redirect_click()
 * - Target allowlist validation (no open redirects)
 * - Loop detection
 * - In-memory TTL cache for hot slugs
 *
 * Invoke: GET /functions/v1/redirect-handler?slug=pride-zrh&q=utm_source%3Dqr
 */

// ── Config ──────────────────────────────────────────────────────────────────

const ALLOWED_HOSTS = new Set([
  "queer.guide",
  "www.queer.guide",
  "queer-guide.pages.dev",
]);

const DANGEROUS_PROTOCOLS = new Set([
  "javascript:",
  "data:",
  "vbscript:",
  "blob:",
  "file:",
]);

const CACHE_TTL_MS = 120_000; // 2 minutes
const NEGATIVE_CACHE_TTL_MS = 30_000; // 30 seconds for misses
const IP_HASH_SALT = "qg-redirect-salt-2026";

// ── In-memory cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  data: ResolvedRedirect | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

interface ResolvedRedirect {
  id: string;
  slug: string;
  target: string;
  status_code: number;
  preserve_query: boolean;
  query_mode: string;
  query_override: Record<string, string> | null;
  utm_defaults: Record<string, string> | null;
  click_limit: number | null;
  click_count: number;
}

function getCached(slug: string): { hit: boolean; data: ResolvedRedirect | null } {
  const entry = cache.get(slug);
  if (entry && entry.expiresAt > Date.now()) {
    return { hit: true, data: entry.data };
  }
  cache.delete(slug);
  return { hit: false, data: null };
}

function setCache(slug: string, data: ResolvedRedirect | null) {
  const ttl = data ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
  cache.set(slug, { data, expiresAt: Date.now() + ttl });
  // Evict old entries if cache grows too large
  if (cache.size > 5000) {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function validateTarget(target: string): boolean {
  const lower = target.toLowerCase();
  for (const proto of DANGEROUS_PROTOCOLS) {
    if (lower.startsWith(proto)) return false;
  }
  if (target.startsWith("/")) {
    return !target.includes("..") && !target.includes("//");
  }
  try {
    const url = new URL(target);
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function mergeQuery(
  targetUrl: string,
  mode: string,
  incomingQuery: string | null,
  overrides: Record<string, string> | null,
  utmDefaults: Record<string, string> | null,
): string {
  let basePath: string;
  let targetParams: URLSearchParams;

  if (targetUrl.startsWith("http")) {
    const url = new URL(targetUrl);
    basePath = url.origin + url.pathname;
    targetParams = url.searchParams;
  } else {
    const qIdx = targetUrl.indexOf("?");
    if (qIdx >= 0) {
      basePath = targetUrl.substring(0, qIdx);
      targetParams = new URLSearchParams(targetUrl.substring(qIdx + 1));
    } else {
      basePath = targetUrl;
      targetParams = new URLSearchParams();
    }
  }

  if (mode === "DROP") {
    const qs = targetParams.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const merged = new URLSearchParams(targetParams);

  if (mode === "PRESERVE" && incomingQuery) {
    const incoming = new URLSearchParams(incomingQuery);
    for (const [key, value] of incoming) {
      if (!merged.has(key)) merged.set(key, value);
    }
  }

  if (mode === "OVERRIDE" && overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      merged.set(key, value);
    }
    if (incomingQuery) {
      const incoming = new URLSearchParams(incomingQuery);
      for (const [key, value] of incoming) {
        if (!merged.has(key)) merged.set(key, value);
      }
    }
  }

  if (utmDefaults) {
    for (const [key, value] of Object.entries(utmDefaults)) {
      if (!merged.has(key)) merged.set(key, value);
    }
  }

  const qs = merged.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + IP_HASH_SALT);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16); // Truncated for privacy
}

// ── 404 page ────────────────────────────────────────────────────────────────

function notFoundResponse(slug: string, detail?: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Not Found - Queer Guide</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}
.c{text-align:center;max-width:400px}.h{font-size:2rem;margin-bottom:.5rem}.s{color:#888;margin-bottom:2rem}
a{color:#a78bfa;text-decoration:none}a:hover{text-decoration:underline}</style></head>
<body><div class="c">
<div class="h">Link not found</div>
<div class="s">The short link <code>/go/${slug}</code> doesn't exist or has expired.${detail ? `<br><small>${detail}</small>` : ""}</div>
<a href="https://queer.guide">Go to Queer Guide</a>
</div></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Only GET requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.toLowerCase().trim();
  const incomingQuery = url.searchParams.get("q") || null;

  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate slug format
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length < 3 || slug.length > 64) {
    return notFoundResponse(slug);
  }

  // Check cache
  const cached = getCached(slug);
  if (cached.hit) {
    if (!cached.data) return notFoundResponse(slug);
    // Use cached redirect data
    return handleRedirect(req, cached.data, incomingQuery, slug);
  }

  // DB lookup
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await db.rpc("resolve_short_redirect", { p_slug: slug });

  if (error || !data || data.length === 0) {
    setCache(slug, null);
    return notFoundResponse(slug);
  }

  const redirect = data[0] as ResolvedRedirect;
  setCache(slug, redirect);

  return handleRedirect(req, redirect, incomingQuery, slug);
});

async function handleRedirect(
  req: Request,
  redirect: ResolvedRedirect,
  incomingQuery: string | null,
  slug: string,
): Promise<Response> {
  // Validate target
  if (!validateTarget(redirect.target)) {
    return notFoundResponse(slug, "Invalid target configuration");
  }

  // Build final URL
  const finalUrl = mergeQuery(
    redirect.target,
    redirect.query_mode,
    incomingQuery,
    redirect.query_override,
    redirect.utm_defaults,
  );

  // Loop detection: check if final URL points back to /go/
  if (finalUrl.includes("/go/") || finalUrl.includes("/functions/v1/redirect-handler")) {
    return notFoundResponse(slug, "Redirect loop detected");
  }

  // Make target absolute for the Location header
  let locationUrl = finalUrl;
  if (finalUrl.startsWith("/")) {
    locationUrl = `https://queer.guide${finalUrl}`;
  }

  // Record click — must await so Deno runtime doesn't exit before it completes
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey);
  const ip = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  try {
    const ipHash = await hashIp(ip);
    await db.rpc("record_redirect_click", {
      p_redirect_id: redirect.id,
      p_path: `/go/${slug}`,
      p_query: incomingQuery,
      p_referer: req.headers.get("referer"),
      p_user_agent: req.headers.get("user-agent")?.substring(0, 256),
      p_country: req.headers.get("cf-ipcountry"),
      p_ip_hash: ipHash,
      p_status: redirect.status_code,
    });
  } catch {
    // Analytics failure is non-critical — don't block the redirect
  }

  return new Response(null, {
    status: redirect.status_code,
    headers: {
      "Location": locationUrl,
      "Cache-Control": "no-cache, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
