/**
 * M8.1 — fetch a sitemap.xml and return up to N URLs the popup can submit
 * in batches. Stays inside the worker-submit lifecycle (no pgmq) so the
 * caller knows up-front what they're about to import.
 *
 * Supports plain URL sets and sitemap-index files (recurses one level).
 */

const MAX_URLS = 500;
const FETCH_TIMEOUT_MS = 8000;

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

export async function fetchSitemap(url: string): Promise<SitemapEntry[]> {
  const xml = await timedFetchText(url);
  const tag = sniffRoot(xml);
  if (tag === "sitemapindex") {
    const children = parseLocs(xml).slice(0, 10);
    const inner = await Promise.all(
      children.map((c) => timedFetchText(c.loc).catch(() => "")),
    );
    const all: SitemapEntry[] = [];
    for (const x of inner) {
      if (!x) continue;
      for (const e of parseLocs(x)) {
        all.push(e);
        if (all.length >= MAX_URLS) return all;
      }
    }
    return all;
  }
  return parseLocs(xml).slice(0, MAX_URLS);
}

function assertPublicHttpUrl(raw: string): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid sitemap URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Blocked sitemap scheme: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80")
  ) {
    throw new Error("Blocked sitemap host");
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = m.slice(1).map(Number);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      throw new Error("Blocked sitemap host (private range)");
    }
  }
}

async function timedFetchText(url: string): Promise<string> {
  assertPublicHttpUrl(url);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "queer-guide-bot/1.0", Accept: "application/xml,text/xml" },
    });
    if (!res.ok) throw new Error(`sitemap fetch ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function sniffRoot(xml: string): "sitemapindex" | "urlset" | "unknown" {
  if (/<\s*sitemapindex/i.test(xml)) return "sitemapindex";
  if (/<\s*urlset/i.test(xml)) return "urlset";
  return "unknown";
}

function parseLocs(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  const blocks = xml.match(/<(?:url|sitemap)\b[\s\S]*?<\/(?:url|sitemap)>/gi) ?? [];
  for (const block of blocks) {
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    const lastmod = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1];
    out.push({ loc, lastmod });
  }
  return out;
}
