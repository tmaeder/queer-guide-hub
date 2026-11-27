import { JSDOM, VirtualConsole } from 'jsdom';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import {
  publicLogoUrl,
  genericLogoAsset,
  officialLogoOriginalUrls,
  transformedLogoRequest,
} from '../../../supabase/functions/_shared/logo-quality.ts';

export const REVIEW_VERSION = 'official-source-review-v2';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const BAD =
  /(?:^|[^a-z])(?:partners?|sponsors?|payments?|press|awards?|badges?|social|instagram|facebook|youtube|tiktok|whatsapp|pinterest|logout|spinner|loading|preloader|placeholder)(?:[^a-z]|$)|powered.?by|theme.?credit|site.?credit/i;
const BRAND = /logo|wordmark|brand(?:ing|mark)?|site[-_ ]?(?:title|identity|name)/i;
const htmlCache = new Map(),
  imageCache = new Map();
const numbers = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
  thirteenth: '13',
  fourteenth: '14',
  fifteenth: '15',
  sixteenth: '16',
  seventeenth: '17',
  eighteenth: '18',
  nineteenth: '19',
  twentieth: '20',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  sixteen: '16',
};

export function normalizeIdentity(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&|\band\b/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/(\d+)(st|nd|rd|th)\b/g, '$1')
    .replace(/(\d)(?=[a-z])/g, '$1 ')
    .replace(
      /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|sixteen)\b/g,
      (w) => numbers[w],
    )
    .replace(/\bst\b/g, 'street')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export function nameVariants(name, kind) {
  const base = normalizeIdentity(name);
  const a = [base, base.replace(/^(the|t) /, '')];
  // Remove explicit secondary labels, legal suffixes and business descriptors.
  // Both the official site identity and the image still need corroboration.
  const plain = normalizeIdentity(
    String(name)
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .split(/\s+[@|–—]\s+|\s+-\s+/)[0],
  )
    .replace(/\s+(?:e v|inc|llc|ltd|gmbh)$/, '')
    .trim();
  a.push(plain);
  const descriptors =
    /^(?:the |cafe |bar |restaurant )|(?: (?:patio )?(?:bar and grill|tattoo shop|coffeeshop|restaurant|campground and resort|lounge))$/g;
  for (const value of [plain, base]) {
    const core = value.replace(descriptors, '').trim();
    if (core.replace(/ /g, '').length >= 6) a.push(core);
  }
  if (kind === 'events')
    a.push(
      base
        .replace(/\b20\d\d\b/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  return [...new Set(a.filter((x) => x.length >= 4))];
}
export function identityMatch(name, text, kind = 'venues') {
  const t = normalizeIdentity(text),
    compact = t.replace(/ /g, '');
  return nameVariants(name, kind).some(
    (n) =>
      ` ${t} `.includes(` ${n} `) ||
      (n.replace(/ /g, '').length >= 6 && compact.includes(n.replace(/ /g, ''))),
  );
}
function owned(a, b) {
  try {
    const x = new URL(a).hostname.replace(/^www\./, ''),
      y = new URL(b).hostname.replace(/^www\./, '');
    return x === y || x.endsWith('.' + y) || y.endsWith('.' + x);
  } catch {
    return false;
  }
}
function homeLink(a, site) {
  try {
    const u = new URL(a, site),
      b = new URL(site);
    return (
      owned(u.href, b.href) &&
      (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/?)?$/i.test(u.pathname) || u.pathname === b.pathname) &&
      !u.hash &&
      !/search|product|event|partner/i.test(u.search)
    );
  } catch {
    return false;
  }
}
function attrContext(el) {
  return [el?.id, el?.className, el?.getAttribute?.('aria-label')]
    .filter((x) => typeof x === 'string')
    .join(' ');
}

export async function boundedFetch(url, kind = 'html') {
  if (!publicLogoUrl(url)) return null;
  const key = kind + '|' + url,
    cache = kind === 'html' ? htmlCache : imageCache;
  if (cache.has(key)) return cache.get(key);
  const promise = (async () => {
    const attempts = url.startsWith('http://') ? [url.replace(/^http:/, 'https:'), url] : [url];
    for (let current of attempts) {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 10000);
      try {
        for (let hop = 0; hop < 6; hop++) {
          if (!publicLogoUrl(current)) break;
          const r = await fetch(current, {
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/about)',
              Accept: kind === 'html' ? 'text/html,application/xhtml+xml' : 'image/*',
            },
          });
          if ([301, 302, 303, 307, 308].includes(r.status)) {
            const to = r.headers.get('location');
            await r.body?.cancel();
            if (!to) break;
            current = new URL(to, current).href;
            continue;
          }
          if (!r.ok || !r.body) {
            await r.body?.cancel();
            break;
          }
          const max = kind === 'html' ? 1_400_000 : 5_000_000;
          if (kind !== 'html' && Number(r.headers.get('content-length')) > max) {
            await r.body.cancel();
            break;
          }
          const reader = r.body.getReader(),
            chunks = [];
          let size = 0;
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            if (size + part.value.length > max) {
              await reader.cancel();
              if (kind !== 'html') return null;
              chunks.push(part.value.subarray(0, max - size));
              size = max;
              break;
            }
            chunks.push(part.value);
            size += part.value.length;
          }
          return {
            url: current,
            bytes: Buffer.concat(chunks, size),
            contentType: (r.headers.get('content-type') ?? '').split(';')[0].toLowerCase(),
          };
        }
      } catch {
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  })();
  cache.set(key, promise);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return promise;
}

export const originalAssetUrls = officialLogoOriginalUrls;
function imgUrls(el, base) {
  const sets = [
    el.getAttribute('srcset'),
    el.getAttribute('data-srcset'),
    el.closest('picture')?.querySelector('source')?.getAttribute('srcset'),
  ].filter(Boolean);
  const responsive = sets
    .flatMap((s) => [...s.matchAll(/(?:^|,\s*)(\S+?)\s+(\d+(?:\.\d+)?)(w|x)(?=\s*(?:,|$))/gi)])
    .sort(
      (a, b) => Number(b[2]) * (b[3] === 'x' ? 1000 : 1) - Number(a[2]) * (a[3] === 'x' ? 1000 : 1),
    )
    .map((m) => m[1]);
  return [
    ...new Set(
      [
        ...responsive,
        el.getAttribute('data-src'),
        el.getAttribute('data-lazy-src'),
        el.getAttribute('src'),
      ]
        .filter((x) => x && !x.startsWith('data:'))
        .flatMap((x) => originalAssetUrls(x, base)),
    ),
  ];
}
export function safeReviewSvg(svg) {
  const decoded = svg.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, s) => {
    const n = s[0].toLowerCase() === 'x' ? parseInt(s.slice(1), 16) : Number(s);
    return n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
  if (
    !/<svg\b/i.test(decoded) ||
    /<(?:[\w.-]+:)?(?:script|foreignObject|iframe|image|feImage|animate(?:Transform|Motion)?|set)\b|<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|\son[\w:-]+\s*=|@import|javascript:|\\/i.test(
      decoded,
    )
  )
    return false;
  if (
    [...decoded.matchAll(/\b(?:[\w-]+:)?(?:href|src)\s*=\s*(["'])(.*?)\1/gi)].some(
      (m) => !/^#[\w.:-]+$/.test(m[2]),
    )
  )
    return false;
  return [...decoded.matchAll(/url\s*\(([^)]*)\)/gi)].every((m) =>
    /^#[\w.:-]+$/.test(m[1].trim().replace(/^['"]|['"]$/g, '')),
  );
}

export function extractOfficialMarks(html, target, pageUrl, requestedUrl = pageUrl) {
  let dom,
    stylesUnavailable = false;
  try {
    dom = new JSDOM(html, { url: pageUrl, virtualConsole: new VirtualConsole() });
  } catch {
    // Some public sites contain malformed HTML style declarations that make
    // jsdom abort before reading the masthead. Preserve SVG artwork verbatim.
    stylesUnavailable = true;
    const svgs = [];
    const protectedHtml = html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, (svg) => {
      svgs.push(svg);
      return `<!--review-svg-${svgs.length - 1}-->`;
    });
    const clean = protectedHtml
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/<!--review-svg-(\d+)-->/g, (_, i) => svgs[Number(i)]);
    dom = new JSDOM(clean, { url: pageUrl, virtualConsole: new VirtualConsole() });
  }
  const doc = dom.window.document;
  const metas = [
    ...doc.querySelectorAll('meta[property="og:site_name"],meta[name="application-name"]'),
  ]
    .map((n) => n.getAttribute('content'))
    .filter(Boolean);
  const ownerNames = [],
    candidates = [];
  const add = (candidate) => {
    if (candidates.length >= 30) return;
    const text = [candidate.label, candidate.sourceUrl].join(' ');
    if (
      BAD.test(text) ||
      (!candidate.inline && !publicLogoUrl(candidate.sourceUrl)) ||
      genericLogoAsset(candidate.sourceUrl)
    )
      return;
    if (stylesUnavailable && candidate.inline) candidate.requiresVisual = true;
    candidate.nativeResolutionUnknown =
      !candidate.inline && transformedLogoRequest(candidate.sourceUrl);
    candidates.push(candidate);
  };
  const walk = (o, depth = 0) => {
    if (!o || depth > 7) return;
    if (Array.isArray(o)) {
      o.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (typeof o !== 'object') return;
    const type = [o['@type']].flat().join(' ');
    if (
      /Organization|LocalBusiness|Restaurant|BarOrPub|NightClub|Hotel|Store|NGO|PerformingGroup/i.test(
        type,
      ) &&
      typeof o.name === 'string'
    ) {
      const nodeUrl = typeof o.url === 'string' ? new URL(o.url, pageUrl).href : pageUrl;
      if (owned(nodeUrl, requestedUrl)) {
        ownerNames.push(o.name);
        for (const l of [o.logo].flat()) {
          const raw = typeof l === 'string' ? l : (l?.url ?? l?.contentUrl);
          if (typeof raw === 'string')
            for (const url of originalAssetUrls(raw, pageUrl))
              add({
                sourceUrl: url,
                source: 'official_jsonld',
                label: o.name,
                context: 'Organization.logo',
                declared: true,
                ownerName: o.name,
              });
        }
      }
    }
    for (const key of ['@graph', 'publisher', 'mainEntity']) walk(o[key], depth + 1);
  };
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(el.textContent));
    } catch {}
  }
  const mastheads = [
    ...doc.querySelectorAll(
      'header,[role="banner"],#masthead,#header,.site-header,.main-header,.navbar,.navbar-brand',
    ),
  ].filter((el) => !el.closest('article,main,[role="main"],.hentry'));
  const homeAnchors = [...doc.querySelectorAll('a[href]')].filter(
    (a) =>
      homeLink(a.getAttribute('href'), pageUrl) &&
      (BRAND.test(attrContext(a) + ' ' + attrContext(a.parentElement)) ||
        a.closest('header,[role="banner"],#masthead,#header,.site-header,.navbar,.main-header')),
  );
  const seen = new Set();
  const declaredImages = [
    ...doc.querySelectorAll(
      'img[alt*="logo" i],img[src*="logo" i],[class*="logo" i] img,[id*="logo" i] img',
    ),
  ];
  for (const area of [...homeAnchors, ...mastheads, ...declaredImages]) {
    for (const img of area.matches('img') ? [area] : area.querySelectorAll('img')) {
      if (seen.has(img)) continue;
      seen.add(img);
      const anchor = img.closest('a[href]'),
        scope =
          attrContext(img) +
          ' ' +
          attrContext(anchor) +
          ' ' +
          attrContext(img.parentElement) +
          ' ' +
          attrContext(img.parentElement?.parentElement);
      const alt = img.getAttribute('alt') ?? '';
      if (BAD.test(scope) || BAD.test(alt)) continue;
      const home = anchor && homeLink(anchor.getAttribute('href'), pageUrl);
      const logo = BRAND.test(scope + ' ' + alt + ' ' + (img.getAttribute('src') ?? ''));
      if (!logo && !(home && identityMatch(target.entity_name, alt, target.entity_table))) continue;
      if (anchor && !home) continue;
      const inMasthead = mastheads.some((h) => h.contains(img));
      for (const url of imgUrls(img, pageUrl))
        add({
          sourceUrl: url,
          source: inMasthead || home ? 'official_masthead' : 'official_document_logo',
          label: alt,
          context: scope.slice(0, 240),
          home: !!home,
          declared: logo,
          requiresVisual: !inMasthead && !home,
        });
    }
    for (const svg of area.querySelectorAll('svg')) {
      if (seen.has(svg)) continue;
      seen.add(svg);
      const a = svg.closest('a[href]');
      if (!a || !homeLink(a.getAttribute('href'), pageUrl)) continue;
      const scope = attrContext(a) + ' ' + attrContext(a.parentElement) + ' ' + attrContext(svg);
      const label =
        svg.getAttribute('aria-label') ??
        svg.querySelector('title')?.textContent ??
        a.getAttribute('aria-label') ??
        '';
      if (
        BAD.test(scope + ' ' + label) ||
        (!BRAND.test(scope) && !identityMatch(target.entity_name, label, target.entity_table))
      )
        continue;
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const originals = [svg, ...svg.querySelectorAll('*')],
        copies = [clone, ...clone.querySelectorAll('*')];
      try {
        for (let i = 0; i < originals.length; i++) {
          const css = dom.window.getComputedStyle(originals[i]);
          for (const p of ['fill', 'stroke', 'color', 'stroke-width', 'fill-rule']) {
            let val = css.getPropertyValue(p);
            if (val === 'currentColor') val = css.color;
            if (val && !/var\(|canvastext|initial|inherit/i.test(val))
              copies[i].style.setProperty(p, val);
          }
        }
      } catch {
        continue;
      } // A broken SVG stylesheet cannot invalidate other declared images.
      const inline = clone.outerHTML;
      if (!safeReviewSvg(inline)) continue;
      add({
        sourceUrl: pageUrl + '#official-inline-logo-' + hash(inline).slice(0, 12),
        source: 'official_inline_svg',
        label,
        context: scope.slice(0, 240),
        home: true,
        declared: true,
        inline,
      });
    }
  }
  // Some sites put the brand in a home-link outside a literal <header>.
  for (const a of homeAnchors) {
    if (!BRAND.test(attrContext(a))) continue;
    const style = a.getAttribute('style') ?? '';
    const bg = style.match(/background(?:-image)?\s*:\s*url\(["']?([^)'"\s]+)["']?\)/i)?.[1];
    if (bg)
      for (const url of originalAssetUrls(bg, pageUrl))
        add({
          sourceUrl: url,
          source: 'official_css_logo',
          label: a.getAttribute('aria-label') ?? '',
          context: attrContext(a),
          home: true,
          declared: true,
        });
  }
  // These fallback declarations require wordmark verification; never approve an
  // unexplained favicon or a generic OpenGraph image as a brand logo.
  for (const el of doc.querySelectorAll(
    'link[rel~="icon"],link[rel="apple-touch-icon"],meta[property="og:image"]',
  )) {
    const raw = el.getAttribute('href') ?? el.getAttribute('content');
    if (!raw || !BRAND.test(raw)) continue;
    for (const url of originalAssetUrls(raw, pageUrl))
      add({
        sourceUrl: url,
        source: 'official_logo_reference',
        label: '',
        context: el.outerHTML.slice(0, 300),
        declared: true,
        requiresWordmark: true,
      });
  }
  for (const script of doc.querySelectorAll(
    'script:not([src]):not([type="application/ld+json"])',
  )) {
    const matches = [
      ...script.textContent.matchAll(/"(?:headerLogo|logo)"\s*:\s*("(?:[^"\\]|\\.)*")/g),
    ].slice(0, 5);
    for (const m of matches) {
      try {
        const raw = JSON.parse(m[1]);
        if (!raw || !/\.(?:png|svg|webp|jpe?g)(?:\?|$)/i.test(raw)) continue;
        for (const url of originalAssetUrls(raw, pageUrl))
          add({
            sourceUrl: url,
            source: 'official_logo_reference',
            label: '',
            context: 'site configuration logo image reference',
            declared: true,
            requiresWordmark: true,
          });
      } catch {}
    }
  }
  const title = doc.title,
    heading = doc.querySelector('h1')?.textContent?.trim() ?? '';
  const textCopy = doc.body?.cloneNode(true);
  for (const el of textCopy?.querySelectorAll('script,style,svg,noscript,template,nav') ?? [])
    el.remove();
  const visibleText = (textCopy?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const identityExcerpt =
    visibleText.length <= 1600
      ? visibleText
      : visibleText.slice(0, 800) + ' … ' + visibleText.slice(-800);
  const siteIdentity = [title, ...metas, ...ownerNames];
  const literalIdentity = siteIdentity.some((x) =>
    identityMatch(target.entity_name, x, target.entity_table),
  );
  const compactTarget = nameVariants(target.entity_name, target.entity_table).map((x) =>
    x.replace(/ /g, ''),
  );
  const domainIdentity = compactTarget.some(
    (x) => x.length >= 6 && new URL(pageUrl).hostname.replace(/[^a-z0-9]/gi, '').includes(x),
  );
  const hasEdition =
    target.entity_table === 'events' ? target.entity_name.match(/\b20\d\d\b/)?.[0] : null;
  const unique = [...new Map(candidates.map((c) => [c.sourceUrl, c])).values()].map((c) => ({
    ...c,
    literalIdentity,
    domainIdentity,
    siteIdentity,
    title,
    heading,
    ownerNames,
    expectedEdition: hasEdition,
    strong: !!(
      (literalIdentity || domainIdentity) &&
      c.declared &&
      (c.source === 'official_jsonld'
        ? identityMatch(target.entity_name, c.ownerName, target.entity_table)
        : c.home || c.source === 'official_masthead' || c.requiresWordmark)
    ),
  }));
  dom.window.close();
  return {
    title,
    metas,
    ownerNames,
    heading,
    identityExcerpt,
    literalIdentity,
    domainIdentity,
    candidates: unique,
  };
}

export async function normalizeReviewedImage(asset, options = {}) {
  let input = asset.inline ? Buffer.from(asset.inline) : asset.bytes;
  if (!input || input.length < 80 || input.length > 5_000_000)
    throw new Error('invalid_source_image_size');
  const sourceHash = hash(input);
  let svg =
    !!asset.inline ||
    asset.contentType === 'image/svg+xml' ||
    input.subarray(0, 300).toString().includes('<svg');
  if (svg) {
    const embedded = embeddedLogoRaster(input.toString());
    if (embedded) {
      input = embedded;
      svg = false;
    }
  }
  if (svg && !safeReviewSvg(input.toString())) throw new Error('unsafe_or_external_svg');
  const metadata = await sharp(input, {
    limitInputPixels: 16_000_000,
    density: svg ? 144 : 72,
  }).metadata();
  if (
    !svg &&
    (Math.max(metadata.width ?? 0, metadata.height ?? 0) < 256 ||
      Math.min(metadata.width ?? 0, metadata.height ?? 0) < 32)
  )
    throw new Error('source_resolution_too_small');
  if (Math.max(metadata.width / metadata.height, metadata.height / metadata.width) > 24)
    throw new Error('source_is_strip');
  const raster = await sharp(input, { limitInputPixels: 16_000_000, density: svg ? 144 : 72 })
    .rotate()
    .resize({ width: 1000, height: 750, fit: 'inside', withoutEnlargement: !svg })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = raster;
  let visible = 0,
    dark = 0,
    light = 0,
    nearBg = 0,
    min = 255,
    max = 0,
    paperScore = 0,
    inkScore = 0,
    neutralScore = 0;
  const linear = Array.from({ length: 256 }, (_, n) => {
    const s = n / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    visible++;
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    min = Math.min(min, l);
    max = Math.max(max, l);
    if (l < 150) dark++;
    if (l > 210) light++;
    if (l > 240 || l < 15) nearBg++;
    const luminance =
        0.2126 * linear[data[i]] + 0.7152 * linear[data[i + 1]] + 0.0722 * linear[data[i + 2]],
      weight = data[i + 3] / 255;
    if (luminance <= 0.3) paperScore += weight;
    if (luminance >= 0.1) inkScore += weight;
    if (luminance <= 0.027 || luminance >= 0.643) neutralScore += weight;
  }
  if (
    !visible ||
    visible / (info.width * info.height) < 0.005 ||
    (visible / (info.width * info.height) > 0.99 && max - min < 3)
  )
    throw new Error('blank_mark');
  const onInk = inkScore > paperScore * 1.03;
  // Keep the official foreground intact; bake a readable ground for every entity type.
  const ground =
    options.background ??
    (neutralScore > Math.max(paperScore, inkScore) * 1.05 ? 'neutral' : onInk ? 'ink' : 'paper');
  const background = ground === 'ink' ? '#181818' : ground === 'neutral' ? '#767676' : '#ffffff';
  const width = Math.max(info.width, 48, Math.ceil(info.height / 12)),
    height = Math.max(info.height, 48, Math.ceil(info.width / 12));
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .flatten({ background })
    .extend({
      left: 0,
      top: 0,
      right: width - info.width,
      bottom: height - info.height,
      background,
    })
    .png({ compressionLevel: 6 })
    .toBuffer();
  const preview = await sharp(png)
    .resize(512, 512, { fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();
  const entropy = (await sharp(png).stats()).entropy;
  return {
    png,
    preview,
    width,
    height,
    onInk: ground === 'ink',
    originalWidth: metadata.width,
    originalHeight: metadata.height,
    originalHash: sourceHash,
    svg,
    background: ground,
    entropy,
    nearBackgroundFraction: nearBg / visible,
  };
}

export async function equivalentReviewedPixels(first, second) {
  const a = await sharp(first).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(second).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return a.info.width === b.info.width && a.info.height === b.info.height && a.data.equals(b.data);
}

/** Some exported SVGs merely wrap one full-frame native PNG/JPEG. Unwrap
 * those pixels rather than enlarging the tiny declared SVG display size. */
export function embeddedLogoRaster(svg) {
  try {
    const images = [...svg.matchAll(/<image\b[^>]*(?:\/>|>[\s\S]*?<\/image>)/gi)];
    if (images.length !== 1 || !safeReviewSvg(svg.replace(images[0][0], '<path/>'))) return null;
    const href = images[0][0].match(
      /\b(?:xlink:)?href\s*=\s*(["'])(data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=\r\n]+)\1/i,
    )?.[2];
    if (!href) return null;
    const dom = new JSDOM(svg, {
      contentType: 'image/svg+xml',
      virtualConsole: new VirtualConsole(),
    });
    try {
      const root = dom.window.document.documentElement;
      const rendered = [...root.children].filter(
        (el) => !['metadata', 'title', 'desc', 'defs'].includes(el.localName),
      );
      if (rendered.length !== 1 || rendered[0].localName !== 'image') return null;
      const image = rendered[0];
      if (
        [root, image].some((el) =>
          ['clip-path', 'mask', 'filter', 'opacity', 'style'].some((a) => el.hasAttribute(a)),
        )
      )
        return null;
      const view = root.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
      const w = Number(image.getAttribute('width')),
        h = Number(image.getAttribute('height'));
      if (
        !view ||
        view.length !== 4 ||
        view[0] !== 0 ||
        view[1] !== 0 ||
        !w ||
        !h ||
        Math.abs(view[2] / view[3] - w / h) > 0.02
      )
        return null;
      if (
        Number(image.getAttribute('x') ?? 0) !== 0 ||
        Number(image.getAttribute('y') ?? 0) !== 0 ||
        !/^(?:scale\([\d.]+\))?$/.test(image.getAttribute('transform') ?? '')
      )
        return null;
      const scale = Number(
        (image.getAttribute('transform') ?? '').match(/scale\(([\d.]+)\)/)?.[1] ?? 1,
      );
      if (
        Math.abs(w * scale - view[2]) > Math.max(2, view[2] * 0.02) ||
        Math.abs(h * scale - view[3]) > Math.max(2, view[3] * 0.02)
      )
        return null;
      const bytes = Buffer.from(href.split(',')[1], 'base64');
      return bytes.length >= 100 && bytes.length <= 5_000_000 ? bytes : null;
    } finally {
      dom.window.close();
    }
  } catch {
    return null;
  }
}

export function candidateState(target, page, candidate, ocr = '') {
  return {
    target: {
      name: target.entity_name,
      type: target.entity_table,
      locality: target.locality ?? '',
    },
    official_page: {
      url: page.url,
      title: page.title,
      site_names: page.metas,
      organization_names: page.ownerNames,
      heading: page.heading.slice(0, 800),
      identity_excerpt: page.identityExcerpt,
    },
    candidate: {
      source_url: candidate.sourceUrl,
      observed_source: candidate.source,
      explicit_logo_attribute: candidate.declared,
      dom_location: candidate.context,
      declared_label: candidate.label,
      organization_name: candidate.ownerName ?? null,
      linked_to_home: !!candidate.home,
      visible_text: ocr,
    },
  };
}

export function canonicalResearchUrl(job) {
  let site = job.discovered_website || job.expected_website;
  if (!site && job.brand_source) {
    const m = job.brand_source.match(/(?:logodev:|site:[^:]+:)([^/\s:]+\.[^/\s:]+)$/);
    if (m) site = 'https://' + m[1] + '/';
  }
  if (!site) return null;
  try {
    let u = new URL(/^https?:\/\//i.test(site) ? site : 'https://' + site);
    if (u.hostname === 'translate.google.com' && u.pathname === '/website')
      u = new URL(u.searchParams.get('u'));
    u.hash = '';
    return publicLogoUrl(u.href) ? u.href : null;
  } catch {
    return null;
  }
}
export { owned };
