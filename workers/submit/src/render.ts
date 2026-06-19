/**
 * Server-side fallback for pages where the in-page extractor finds nothing.
 *
 * Strategy: plain `fetch` + two extraction passes against the response body:
 *
 *   1. Every `<script type="application/ld+json">` block goes through the
 *      shared client-sdk JSON-LD core, which already handles @graph,
 *      ItemList unwrap, subEvent, @id resolution, and full per-type field
 *      mapping (telephone, instagram, ticket_url, …). Server stays at
 *      parity with the extension automatically.
 *   2. If JSON-LD yielded nothing, run an OpenGraph/Twitter pass via
 *      Cloudflare's built-in HTMLRewriter — feeds the shared og-core.
 *   3. If BOTH static passes find nothing (the client-rendered SPA case),
 *      call the internal extract worker with render:true — Browser Rendering
 *      settles the DOM, deepcrawl cleans it, and we map the returned
 *      title/description/image/markdown into an OG-equivalent DetectedItem.
 *
 * The extension itself never needs (3): it runs in the user's already-rendered
 * tab, so its client-side extractors see the live DOM. The render fallback is a
 * server-only augmentation; the static passes (1)(2) keep client-sdk parity.
 *
 * Covers Eventbrite/Outsavvy listings, festival subEvent pages, Substack/Medium
 * posts (OG-only), SSR'd marketplace + venue pages, and — via (3) — SPAs.
 */

import type { DetectedItem as SchemaDetectedItem } from "./schema";
import { extractFromJsonLd, parseLdJson } from "../../../client-sdk/jsonld-core";
import { buildOgItem, type MetaMap } from "../../../client-sdk/og-core";

const FETCH_TIMEOUT_MS = 8000;
const EXTRACT_TIMEOUT_MS = 20000;

interface RenderOpts {
  extractWorkerUrl?: string;
  internalSecret?: string;
}

export async function renderAndExtract(
  url: string,
  opts: RenderOpts = {},
): Promise<SchemaDetectedItem[]> {
  const res = await fetchHtml(url);
  const html = await res.text();

  const jsonLdItems: SchemaDetectedItem[] = [];
  for (const block of extractJsonLdBlocks(html)) {
    const parsed = parseLdJson(block);
    if (parsed == null) continue;
    const out = extractFromJsonLd(parsed, url);
    jsonLdItems.push(...(out.items as SchemaDetectedItem[]));
  }
  if (jsonLdItems.length > 0) return jsonLdItems;

  const meta = await readMetaFromHtml(html);
  const ogItem = buildOgItem(meta, url);
  if (ogItem) return [ogItem as SchemaDetectedItem];

  // SPA fallback — render via the extract worker and map its meta → OG item.
  return await renderViaWorker(url, opts);
}

async function renderViaWorker(
  url: string,
  opts: RenderOpts,
): Promise<SchemaDetectedItem[]> {
  if (!opts.extractWorkerUrl || !opts.internalSecret) return [];

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), EXTRACT_TIMEOUT_MS);
  try {
    const res = await fetch(`${opts.extractWorkerUrl.replace(/\/$/, "")}/extract`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-internal-secret": opts.internalSecret,
      },
      body: JSON.stringify({ url, render: true }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      markdown?: string;
      meta?: { title?: string | null; description?: string | null; image?: string | null };
    };
    if (!data.meta?.title) return [];

    // Synthesize an OG MetaMap so the shared og-core builds the DetectedItem —
    // keeps the rendered item's shape identical to the static OG path.
    const meta: MetaMap = new Map();
    meta.set("og:title", data.meta.title);
    if (data.meta.description) meta.set("og:description", data.meta.description);
    if (data.meta.image) meta.set("og:image", data.meta.image);
    const item = buildOgItem(meta, url);
    if (!item) return [];
    // Attach cleaned markdown for the downstream /enrich step.
    if (data.markdown) (item.raw_data as Record<string, unknown>).page_markdown = data.markdown;
    return [item as SchemaDetectedItem];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function fetchHtml(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en;q=0.9,de;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

function extractJsonLdBlocks(html: string): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(m[1].trim());
  }
  return out;
}

/**
 * Cloudflare's HTMLRewriter reads every `<meta>` tag's `property`/`name`/
 * `itemprop` + `content` into a Map. Streaming, built into the runtime —
 * zero new deps, no full-DOM parse.
 */
async function readMetaFromHtml(html: string): Promise<MetaMap> {
  const meta: MetaMap = new Map();
  const rewriter = new HTMLRewriter().on("meta", {
    element(el) {
      const key =
        el.getAttribute("property") ||
        el.getAttribute("name") ||
        el.getAttribute("itemprop");
      const value = el.getAttribute("content");
      if (key && value && !meta.has(key)) meta.set(key, value);
    },
  });
  await rewriter.transform(new Response(html)).text();
  return meta;
}
