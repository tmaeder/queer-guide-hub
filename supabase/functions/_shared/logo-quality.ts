import { imageSize, isAcceptableLogoType, pickSiteIcons, sameSiteOrCdn } from './site-icon.ts'
import { platformWebsiteClass, type PlatformRule } from './platform-domain.ts'
import { pngInk, needsInkPlate } from './png-luminance.ts'

export const LOGO_QUALITY_VERSION = 1
export interface LogoBytes { bytes: Uint8Array; contentType: string }
export interface LogoCandidate extends LogoBytes {
  source: string; sourceUrl: string; width: number | null; height: number | null
  onInk: boolean; automatic: boolean
}
export interface LogoResolution {
  candidate: LogoCandidate | null
  reason: string
  website: string | null
  retry?: boolean
}

/** Unwrap only documented URL wrappers, with a depth bound and no network guesses. */
export function canonicalLogoWebsite(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  let raw = value.trim()
  for (let i = 0; i < 4; i++) {
    let u: URL
    try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) } catch { return null }
    if (!publicLogoUrl(u.href)) return null
    if (u.hostname === 'translate.google.com' && u.pathname === '/website') {
      const target = u.searchParams.get('u')
      if (!target) return null
      raw = target
      continue
    }
    u.hash = ''
    return u.href
  }
  return null
}

export function publicLogoUrl(value: string): boolean {
  try {
    const u = new URL(value)
    const h = u.hostname.toLowerCase().replace(/\.$/, '')
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password &&
      (!u.port || ['80', '443'].includes(u.port)) && h.includes('.') &&
      !h.includes(':') && !/^[\d.]+$/.test(h) &&
      !/(^|\.)(localhost|local|internal|test|invalid)$/.test(h)
  } catch { return false }
}

function ownWebsite(url: string, site: string): boolean {
  try {
    const a = new URL(url).hostname.replace(/^www\./, '')
    const b = new URL(site).hostname.replace(/^www\./, '')
    return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
  } catch { return false }
}

/** Bound redirects, time, and streamed bytes; validate each redirect destination. */
export async function fetchLogoResource(url: string, maxBytes: number, accept: string): Promise<{
  bytes: Uint8Array; contentType: string; url: string
} | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 7000)
  try {
    for (let hop = 0; hop < 5; hop++) {
      if (!publicLogoUrl(url)) return null
      const res = await fetch(url, {
        redirect: 'manual', signal: controller.signal,
        headers: { Accept: accept, 'User-Agent': 'QueerGuideBot/1.0 (+https://queer.guide/about)' },
      })
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location')
        await res.body?.cancel()
        if (!location) return null
        url = new URL(location, url).href
        continue
      }
      if (!res.ok || !res.body) { await res.body?.cancel(); return null }
      const htmlPrefix = accept === 'text/html'
      if (!htmlPrefix && Number(res.headers.get('content-length')) > maxBytes) { await res.body.cancel(); return null }
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        if (size + part.value.length > maxBytes) {
          await reader.cancel()
          if (!htmlPrefix) return null
          chunks.push(part.value.subarray(0, maxBytes - size))
          size = maxBytes
          break
        }
        size += part.value.length
        chunks.push(part.value)
      }
      const bytes = new Uint8Array(size)
      let at = 0
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length }
      return { bytes, contentType: (res.headers.get('content-type') ?? '').split(';')[0].toLowerCase(), url }
    }
  } catch { /* temporary/unreachable upstream is handled by the caller */ }
  finally { clearTimeout(timer) }
  return null
}

function normalized(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
export function logoIdentityMatches(name: string, text: string): boolean {
  const n = normalized(name), t = normalized(text)
  if (n.length >= 4 && (` ${t} `).includes(` ${n} `)) return true
  const tokens = n.split(' ').filter(w => w.length >= 4 && !['the', 'club', 'hotel', 'restaurant', 'association', 'center', 'centre', 'bar', 'cafe', 'event', 'pride'].includes(w))
  return tokens.length > 0 && tokens.every(w => (` ${t} `).includes(` ${w} `))
}

/** Never interpret "served by Wix/WordPress" as "depicts Wix/WordPress". */
export function genericLogoAsset(url: string): boolean {
  let path = url.toLowerCase()
  try { path = decodeURIComponent(new URL(url).pathname).toLowerCase() } catch { /* invalid rejected elsewhere */ }
  return /(?:^|[/_.-])(wordpress-logo|w-logo-blue|wmark|wix-logo|facebook-logo|instagram-logo|godaddy-logo|squarespace-logo|placeholder|spacer|tracking|sprite|default_thumb|og-image|opengraph|social-share|share-image)(?:[/_.-]|$)/i.test(path) ||
    /\/wp-includes\/images\/(?:w-logo|wordpress)/i.test(path)
}

export function safeLogoSvg(bytes: Uint8Array): boolean {
  const svg = new TextDecoder().decode(bytes).replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
    const n = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code)
    return n <= 0x10ffff ? String.fromCodePoint(n) : ''
  })
  const internalPaintOnly = [...svg.matchAll(/url\s*\(([^)]*)\)/gi)]
    .every(m => /^#[\w.:-]+$/.test(m[1].trim().replace(/^['"]|['"]$/g, '')))
  return /<svg\b/i.test(svg) && /<\/(?:svg)>/i.test(svg) &&
    internalPaintOnly && !svg.includes('\\') &&
    !/<(?:[\w.-]+:)?(?:script|foreignObject|iframe|image|feImage|use|animate(?:Motion|Transform)?|set|discard)\b|<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|\son[\w:-]+\s*=|\b(?:href|src)\s*=|@import|javascript:/i.test(svg)
}

export async function inspectLogoBytes(logo: LogoBytes): Promise<{
  valid: boolean; reason: string; width: number | null; height: number | null; onInk: boolean
}> {
  const no = (reason: string) => ({ valid: false, reason, width: null, height: null, onInk: false })
  if (logo.bytes.length < 100 || logo.bytes.length > 2 * 1024 * 1024) return no('invalid_byte_size')
  if (!isAcceptableLogoType(logo.contentType)) return no('unsupported_format')
  if (logo.contentType === 'image/svg+xml') {
    const svg = new TextDecoder().decode(logo.bytes)
    const colors = [...svg.matchAll(/(?:fill|stroke|stop-color)\s*[:=]\s*["']?\s*(#[0-9a-f]{3,8}|white|black|rgb\([^)]*\))/gi)].map(m => m[1].toLowerCase())
    const whiteOnly = colors.length > 0 && colors.every(c => /^(#fff|#ffffff|#ffffffff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))$/.test(c))
    return safeLogoSvg(logo.bytes)
      ? { valid: true, reason: 'vector', width: null, height: null, onInk: whiteOnly }
      : no('unsafe_or_invalid_svg')
  }
  let size
  try { size = imageSize(logo.bytes) } catch { return no('invalid_image_header') }
  if (!size) return no('unmeasurable_image')
  if (Math.max(size.width, size.height) < 256 || Math.min(size.width, size.height) < 48) return { ...no('low_resolution'), ...size }
  if (size.width * size.height > 8_000_000 || Math.max(size.width / size.height, size.height / size.width) > 12) return no('invalid_dimensions')
  const ink = logo.contentType === 'image/png' && size.width * size.height <= 1_000_000 ? await pngInk(logo.bytes) : null
  if (logo.contentType === 'image/png' && size.width * size.height <= 1_000_000 && !ink) return { ...no('unreadable_or_transparent_png'), ...size }
  if (ink && ((ink.coverage > 0.99 && ink.colorRange < 4) || ink.coverage < 0.01)) return no('blank_or_tiny_mark')
  return { valid: true, reason: logo.contentType === 'image/png' && !ink ? 'pixel_quality_requires_review' : 'measured', ...size, onInk: needsInkPlate(ink) }
}

function jsonLdLogos(html: string, name: string, site: string): string[] {
  const out: string[] = []
  const walk = (node: unknown, depth = 0) => {
    if (!node || depth > 8) return
    if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return }
    if (typeof node !== 'object') return
    const o = node as Record<string, unknown>
    const types = [o['@type']].flat().join(' ')
    if (/Organization|LocalBusiness|Restaurant|BarOrPub|Hotel|Store|Place|NightClub|PerformingGroup|NGO/i.test(types) &&
        typeof o.name === 'string' && logoIdentityMatches(name, o.name) &&
        (typeof o.url !== 'string' || sameSiteOrCdn(o.url, site))) {
      const logos = [o.logo].flat()
      for (const l of logos) {
        const raw = typeof l === 'string' ? l : (l as { url?: string; contentUrl?: string } | null)?.url ?? (l as {contentUrl?: string} | null)?.contentUrl
        if (raw) { try { out.push(new URL(raw, site).href) } catch { /* ignore */ } }
      }
    }
    // Publisher/provider/author are deliberately not evidence of this entity.
    for (const key of ['@graph', 'mainEntity']) walk(o[key], depth + 1)
  }
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1])) } catch { /* malformed JSON-LD is not evidence */ }
  }
  return out
}

export function officialLogoCandidates(html: string, name: string, pageUrl: string, website: string) {
  const direct = jsonLdLogos(html, name, website).filter(url => sameSiteOrCdn(url, website))
    .map(url => ({ url, source: 'official_jsonld', automatic: true }))
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  const header = html.match(/<header\b[^>]*>[\s\S]*?<\/header>/i)?.[0]
  const picks = pickSiteIcons(html, pageUrl, website)
  const headerPicks = header ? pickSiteIcons(header, pageUrl, website) : []
  const compactName = normalized(name).replace(/ /g, '')
  const brandedHost = compactName.length >= 5 && new URL(website).hostname.replace(/[^a-z0-9]/gi, '').includes(compactName)
  for (const pick of picks) {
    // A directory's page title names the listed venue/event, but its masthead
    // still belongs to the directory. Require the mark's own identity or an
    // entity-specific hostname as independent corroboration.
    const altMatches = [...(header ?? '').matchAll(/<img\b[^>]*>/gi)].some(m => {
      const alt = m[0].match(/\balt\s*=\s*["']([^"']+)["']/i)?.[1] ?? ''
      return logoIdentityMatches(name, alt) && pickSiteIcons(m[0], pageUrl, website).some(p => p.url === pick.url)
    })
    const strong = (altMatches || brandedHost) && headerPicks.some(p => p.url === pick.url) && logoIdentityMatches(name, title) && pick.kind === 'header-img' && pick.score >= 300
    direct.push({ url: pick.url, source: `site_${pick.kind}`, automatic: strong })
  }
  const seen = new Set<string>()
  return direct.filter(c => !genericLogoAsset(c.url) && !seen.has(c.url) && seen.add(c.url))
    .sort((a,b) => Number(b.automatic) - Number(a.automatic))
}

export async function resolveQualityLogo(
  name: string, website: string | null, rules: readonly PlatformRule[], denied: ReadonlySet<string>,
  provider: (website: string) => Promise<{ outcome: string; logo: LogoBytes | null }>,
): Promise<LogoResolution> {
  const site = canonicalLogoWebsite(website)
  if (!site) return { candidate: null, reason: 'missing_or_invalid_website', website: site }
  const platform = platformWebsiteClass(site, rules)
  // Hosted builder sites can declare their CUSTOMER's real logo, but must never
  // use a domain-provider result, which would identify the builder.
  if (platform && platform !== 'builder') return { candidate: null, reason: `platform_${platform}`, website: site }
  const page = await fetchLogoResource(site, 700_000, 'text/html')
  const redirectedClass = page ? platformWebsiteClass(page.url, rules) : null
  const pageOwned = page && (!redirectedClass || redirectedClass === 'builder') && ownWebsite(page.url, site)
  let uncertain: LogoCandidate | null = null
  if (page && pageOwned && page.contentType === 'text/html') {
    const html = new TextDecoder().decode(page.bytes)
    for (const pick of officialLogoCandidates(html, name, page.url, site).slice(0, 5)) {
      const img = await fetchLogoResource(pick.url, 2 * 1024 * 1024, 'image/*')
      if (!img || genericLogoAsset(img.url) || !sameSiteOrCdn(img.url, site)) continue
      const inspected = await inspectLogoBytes(img)
      if (!inspected.valid || denied.has(await logoBytesHash(img.bytes))) continue
      const candidate = { ...img, ...inspected, source: pick.source, sourceUrl: pick.url, automatic: pick.automatic && inspected.reason !== 'pixel_quality_requires_review' }
      if (candidate.automatic) return { candidate, reason: 'verified_official_logo', website: site }
      uncertain ??= candidate
    }
  }
  if (uncertain) return { candidate: uncertain, reason: 'unverified_site_icon_or_identity', website: site }
  if (platform || (page && !pageOwned)) return { candidate: null, reason: 'platform_or_cross_site_redirect', website: site }
  const probe = await provider(site)
  if (['unauthorized', 'rate_limited', 'error', 'unconfigured'].includes(probe.outcome)) {
    return { candidate: null, reason: `provider_${probe.outcome}`, website: site, retry: true }
  }
  if (probe.logo) {
    const inspected = await inspectLogoBytes(probe.logo)
    if (inspected.valid && !denied.has(await logoBytesHash(probe.logo.bytes))) {
      return { candidate: { ...probe.logo, ...inspected, source: 'domain_provider', sourceUrl: site, automatic: false }, reason: 'provider_identity_requires_review', website: site }
    }
  }
  return { candidate: null, reason: page ? 'no_qualified_official_logo' : 'official_site_unreachable', website: site }
}

export async function logoBytesHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
