/**
 * Core extraction — reproduces deepcrawl v0's read pipeline (@ cb4817b) on a
 * single HTML string: main-content isolation (cheerio) → markdown
 * (node-html-markdown) → deepcrawl markdown post-processors. Plus metadata and a
 * same-origin links list for crawl/discovery.
 *
 * Pure given (html, url): no network here. The caller (index.ts / a future
 * render.ts) supplies the HTML, so the static-fetch and Browser-Rendering paths
 * share one cleaner. See src/deepcrawl/VENDORED.md.
 */
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import {
  processMultiLineLinks,
  removeSkipToContentLinks,
} from './deepcrawl/markdown-helpers';

export interface ExtractMeta {
  title: string | null;
  description: string | null;
  lang: string | null;
  author: string | null;
  publishedAt: string | null;
  image: string | null;
  /** Social profile URLs harvested from rel="me" links + anchors (schema.org sameAs shape). */
  sameAs?: string[];
}

export interface ExtractLinks {
  flat: string[]; // same-origin candidate page URLs, deduped, capped
  external: string[]; // off-origin links, deduped, capped
}

export interface CleanResult {
  markdown: string;
  meta: ExtractMeta;
  links: ExtractLinks;
  /** schema.org objects parsed from <script type="application/ld+json"> — the
   *  highest-signal source on event/venue/product pages. Empty if none found. */
  jsonLd: Array<Record<string, unknown>>;
  contentMethod: 'article' | 'main' | 'density' | 'body';
  charCount: number;
}

const NOISE_SELECTOR = [
  'script', 'style', 'noscript', 'template', 'iframe', 'svg', 'form',
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  '[aria-hidden="true"]',
  '.ad', '.ads', '.advert', '.advertisement', '.share', '.social',
  '.newsletter', '.related', '.recommended', '.comments', '.comment',
  '.cookie', '.consent', '.subscribe', '.paywall', '.promo', '.sidebar',
].join(',');

const LINKS_CAP = 200;

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const s = (v ?? '').toString().trim();
    if (s) return s;
  }
  return null;
}

function absolutize(src: string | null, baseUrl: string): string | null {
  if (!src) return null;
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return src;
  }
}

function normalizeIsoDate(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function langPrimary(v: string | null): string | null {
  if (!v) return null;
  const m = v.trim().toLowerCase().match(/^[a-z]{2,3}/);
  return m ? m[0] : null;
}

function extractMeta($: cheerio.CheerioAPI, url: string): ExtractMeta {
  return {
    title: firstNonEmpty(
      $('meta[property="og:title"]').attr('content'),
      $('meta[name="twitter:title"]').attr('content'),
      $('title').first().text(),
    ),
    description: firstNonEmpty(
      $('meta[name="description"]').attr('content'),
      $('meta[property="og:description"]').attr('content'),
    ),
    lang: langPrimary(
      firstNonEmpty(
        $('html').attr('lang'),
        $('meta[property="og:locale"]').attr('content'),
      ),
    ),
    author: firstNonEmpty(
      $('meta[name="author"]').attr('content'),
      $('meta[property="article:author"]').attr('content'),
      $('[rel="author"]').first().text(),
    ),
    publishedAt: normalizeIsoDate(
      firstNonEmpty(
        $('meta[property="article:published_time"]').attr('content'),
        $('meta[name="date"]').attr('content'),
        $('meta[itemprop="datePublished"]').attr('content'),
        $('time[datetime]').first().attr('datetime'),
      ),
    ),
    image: absolutize(
      firstNonEmpty(
        $('meta[property="og:image"]').attr('content'),
        $('meta[name="twitter:image"]').attr('content'),
      ),
      url,
    ),
    sameAs: extractSocialUrls($),
  };
}

/** Harvest social profile URLs from rel="me" links and known-host anchors. */
function extractSocialUrls($: cheerio.CheerioAPI): string[] {
  const hosts =
    /(instagram\.com|tiktok\.com|(?:twitter|x)\.com|facebook\.com|youtube\.com|linkedin\.com|threads\.net|bsky\.app|t\.me\/|patreon\.com|ko-fi\.com|twitch\.tv|open\.spotify\.com|soundcloud\.com|onlyfans\.com|fansly\.com|fetlife\.com|joyclub\.|(?:planet|gay)?romeo\.com|grindr\.com|scruff\.com|recon\.com|pornhub\.com|xhamster\.com|xtube\.com)/i;
  // Share-button / widget / post-permalink paths are not profile links.
  const shareWidget =
    /\/(?:sharer?\.php|sharer|share\/url|share|intent|dialog|reels?|p|watch|hashtag|explore|stories)(?:[/?#]|$)/i;
  const out = new Set<string>();
  $('a[rel~="me"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (href && !shareWidget.test(href)) out.add(href.split('?')[0] ?? href);
  });
  $('a[href]').each((_i, el) => {
    if (out.size >= 12) return;
    const href = $(el).attr('href') ?? '';
    if (hosts.test(href) && !shareWidget.test(href)) out.add(href.split('?')[0] ?? href);
  });
  return Array.from(out).slice(0, 12);
}

/** schema.org @type values worth keeping (substring match, case-insensitive). */
const JSONLD_KEEP = [
  'event', 'place', 'localbusiness', 'restaurant', 'barorpub', 'nightclub',
  'product', 'article', 'organization', 'museum', 'touristattraction',
];
const JSONLD_MAX_OBJECTS = 5;
const JSONLD_MAX_BYTES = 8_000;

function jsonLdTypeMatches(type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (t) => typeof t === 'string' && JSONLD_KEEP.includes(t.toLowerCase()),
  );
}

/** Parse all <script type="application/ld+json"> blocks, flatten @graph, and keep
 *  objects whose @type is event/venue/product-ish. Runs before noise stripping. */
function extractJsonLd($: cheerio.CheerioAPI): Array<Record<string, unknown>> {
  const kept: Array<Record<string, unknown>> = [];
  let bytes = 0;

  const consider = (obj: unknown) => {
    if (kept.length >= JSONLD_MAX_OBJECTS || bytes >= JSONLD_MAX_BYTES) return;
    if (!obj || typeof obj !== 'object') return;
    const record = obj as Record<string, unknown>;
    if (!jsonLdTypeMatches(record['@type'])) return;
    const size = JSON.stringify(record).length;
    if (size > JSONLD_MAX_BYTES) return;
    kept.push(record);
    bytes += size;
  };

  $('script[type="application/ld+json"]').each((_i, el) => {
    if (kept.length >= JSONLD_MAX_OBJECTS) return;
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // malformed JSON-LD is common — skip silently
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (node && typeof node === 'object' && Array.isArray((node as Record<string, unknown>)['@graph'])) {
        for (const g of (node as Record<string, unknown>)['@graph'] as unknown[]) consider(g);
      } else {
        consider(node);
      }
    }
  });

  return kept;
}

/** Same main-content strategy as the news extractor, returning the element's HTML. */
function pickMainContentHtml(
  $: cheerio.CheerioAPI,
): { html: string; method: CleanResult['contentMethod'] } {
  $(NOISE_SELECTOR).remove();

  const byTextLen = (sel: string) =>
    $(sel)
      .toArray()
      .map((el) => ({ el, len: $(el).text().replace(/\s+/g, ' ').trim().length }))
      .sort((a, b) => b.len - a.len)[0];

  const article = byTextLen('article');
  if (article && article.len >= 250) {
    return { html: $.html(article.el) ?? '', method: 'article' };
  }
  const main = byTextLen('main, [role="main"]');
  if (main && main.len >= 250) {
    return { html: $.html(main.el) ?? '', method: 'main' };
  }

  // Densest <p>-cluster container.
  const scores = new Map<Element, number>();
  $('p').each((_i, p) => {
    const len = $(p).text().replace(/\s+/g, ' ').trim().length;
    if (len < 40) return;
    const parent = $(p).parent().get(0);
    if (parent) scores.set(parent, (scores.get(parent) ?? 0) + len);
  });
  let best: Element | null = null;
  let bestScore = 0;
  for (const [el, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best && bestScore >= 250) {
    return { html: $.html(best) ?? '', method: 'density' };
  }

  return { html: $('body').html() ?? '', method: 'body' };
}

function extractLinks($: cheerio.CheerioAPI, url: string): ExtractLinks {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return { flat: [], external: [] };
  }
  const internal = new Set<string>();
  const external = new Set<string>();
  $('a[href]').each((_i, a) => {
    const href = $(a).attr('href');
    if (!href || href.startsWith('#')) return;
    let abs: URL;
    try {
      abs = new URL(href, url);
    } catch {
      return;
    }
    // Protocol allowlist is the complete guard — drops javascript:, data:,
    // vbscript:, mailto:, tel:, etc. (an incomplete scheme prefix-blocklist misses some).
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return;
    abs.hash = '';
    const s = abs.toString();
    if (abs.origin === origin) {
      if (s !== url && internal.size < LINKS_CAP) internal.add(s);
    } else if (external.size < LINKS_CAP) {
      external.add(s);
    }
  });
  return { flat: [...internal], external: [...external] };
}

const nhm = new NodeHtmlMarkdown();

function toMarkdown(contentHtml: string): string {
  let md = nhm.translate(contentHtml);
  md = processMultiLineLinks(md);
  md = removeSkipToContentLinks(md);
  return md.trim();
}

export function cleanHtml(
  html: string,
  url: string,
  opts: { crawl?: boolean } = {},
): CleanResult {
  const $ = cheerio.load(html);
  const meta = extractMeta($, url);
  const jsonLd = extractJsonLd($);
  const links = opts.crawl ? extractLinks($, url) : { flat: [], external: [] };

  // pickMainContentHtml mutates $ (strips noise incl. <script>) — run metadata,
  // JSON-LD, and links first.
  const { html: contentHtml, method } = pickMainContentHtml($);
  const markdown = toMarkdown(contentHtml);

  return { markdown, meta, jsonLd, links, contentMethod: method, charCount: markdown.length };
}
