import * as cheerio from 'npm:cheerio@1.0.0-rc.12'

/** Wix appends display transformations to a public media-file URL. Opt in only
 * for merchants whose JSON-LD supplies thumbnails instead of native covers.
 * https://dev.wix.com/docs/overview/site-features-tools/media-manager */
export function readCrawlImageUrl(raw: string, mode?: string): string {
  if (mode !== 'wix_original') return raw
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'static.wixstatic.com' ||
        url.port || url.username || url.password || url.search || url.hash) return raw
    const match = url.pathname.match(/^(\/media\/[^/]+\.(?:jpe?g|png|webp|gif|avif))\/v1\/(?:fit|fill|crop)\//i)
    if (match) return `${url.origin}${match[1]}`
  } catch { /* Leave malformed or unrelated media URLs untouched. */ }
  return raw
}

/** Mixed merchant catalogs must not inherit the crawler's original book labels. */
export function readCrawlCategoryLabels(category?: string, subcategory?: string) {
  return {
    category: category?.trim() || 'Other',
    subcategory: subcategory?.trim() || 'Other',
  }
}

/** Read URL locations from sitemap entries, including XML CDATA text. */
export function readSitemapLocations(xml: string, requireProductImages = false): string[] {
  const $ = cheerio.load(xml, { xmlMode: true })
  if (requireProductImages) {
    return $('url').filter((_i, node) => $(node).children().toArray().some(child =>
      child.type === 'tag' && /(^|:)image$/.test(child.name) &&
      $(child).children().toArray().some(field => field.type === 'tag' && /(^|:)loc$/.test(field.name) && Boolean($(field).text().trim()))
    )).children('loc').map((_i, node) => $(node).text().trim()).get().filter(Boolean)
  }
  return $('loc').map((_i, node) => $(node).text().trim()).get().filter(Boolean)
}

/** Explicitly selected product links from a merchant's public HTML catalog.
 * Ignore document <base> tags and keep discovery on the same HTTPS host. */
export function readCatalogProductLinks(html: string, pageUrl: string, selector: string): string[] {
  if (!selector.trim()) throw new Error('HTML catalog requires a product link selector')
  const page = new URL(pageUrl)
  const host = page.hostname.replace(/^www\./, '')
  const $ = cheerio.load(html)
  const links = new Set<string>()
  $(selector).each((_i, node) => {
    const raw = $(node).attr('href')?.trim()
    if (!raw || raw.startsWith('#')) return
    try {
      const url = new URL(raw, page)
      if (url.hostname.replace(/^www\./, '') !== host) return
      // Reuse the registry's HTTPS, credentials and port checks for every link.
      if (!allowedSitemap(url.href, page.hostname)) return
      url.hash = ''
      links.add(url.href)
    } catch { /* Malformed links are not products. */ }
  })
  return [...links].sort()
}

/** Some storefronts serve .xml.gz files without a Content-Encoding header. */
export async function decodeSitemapBytes(bytes: Uint8Array, maxBytes = 50 * 1024 * 1024): Promise<string> {
  if (bytes.byteLength > maxBytes) throw new Error('Sitemap exceeds size limit')
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes)
  const reader = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new Error('Expanded sitemap exceeds size limit')
      parts.push(decoder.decode(value, { stream: true }))
    }
    parts.push(decoder.decode())
    return parts.join('')
  } finally {
    await reader.cancel()
  }
}

// These are first-party, operator-maintained snapshots already registered on the
// three Salzgeber merchants. Product URLs are still restricted to shop_domain.
const OWNED_SITEMAPS = new Set([
  'https://img.queer.guide/imports/salzgeber-buch-sitemap.xml',
  'https://img.queer.guide/imports/salzgeber-film-sitemap.xml',
  'https://img.queer.guide/imports/salzgeber-other-sitemap.xml',
])

export function allowedSitemap(raw: string, shopDomain: string): boolean {
  try {
    const url = new URL(raw)
    const hasCredentials = Boolean(url.username) || Boolean(url.password)
    if (hasCredentials || url.protocol !== 'https:' || url.port) return false
    const host = shopDomain.replace(/^www\./, '').toLowerCase()
    if (url.hostname.replace(/^www\./, '') === host) return true
    return host === 'salzgeber.shop' && OWNED_SITEMAPS.has(url.href)
  } catch { return false }
}

/** Exact canonical destination used by configured storefronts for removed items. */
export function readCanonicalPageUrl(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html)
  const href = $('link[rel~="canonical" i]').first().attr('href')
  if (!href) return null
  try {
    const url = new URL(href, pageUrl)
    return url.protocol === 'https:' ? url.href : null
  } catch { return null }
}

export interface Selectors {
  name?: string
  description?: string
  image?: string
  price?: string
  sku_regex?: string
}

export function readSelectedProduct(html: string, pageUrl: string, selectors: Selectors, currency?: string) {
  const $ = cheerio.load(html)
  const text = (selector?: string) => {
    if (!selector) return ''
    const node = $(selector).first()
    return (node.attr('content') ?? node.text()).replace(/\s+/g, ' ').trim()
  }
  const name = text(selectors.name)
  if (!name) return null
  const rawPrice = text(selectors.price).replace(/[^\d.,-]/g, '')
  // Shops configured here use either 1.234,56 or 1,234.56. The final separator
  // is decimal only when followed by two digits; grouping is removed first.
  const decimal = rawPrice.match(/[.,](\d{2})$/)
  const normalized = decimal
    ? rawPrice.slice(0, decimal.index).replace(/[.,]/g, '') + '.' + decimal[1]
    : rawPrice.replace(/[.,]/g, '')
  const value = normalized ? Number(normalized) : NaN
  const imageNode = selectors.image ? $(selectors.image).first() : null
  const image = imageNode?.attr('src') ?? imageNode?.attr('content')
  let images: string[] = []
  if (image) {
    try {
      const url = new URL(image, pageUrl)
      if (url.protocol === 'https:' || url.protocol === 'http:') images = [url.href]
    } catch { /* missing image remains missing */ }
  }
  const sku = selectors.sku_regex ? new RegExp(selectors.sku_regex).exec($.root().text())?.[1] ?? null : null
  return {
    name, description: text(selectors.description), images,
    price: Number.isFinite(value) && value > 0 ? value : null,
    currency: currency ?? null, inStock: null, sku, author: null,
  }
}

/** Deterministic storefront schema does not require the shared extract worker.
 * Keep the same nested microdata shape as workers/extract/src/clean.ts. */
export function readStaticSchema(html: string) {
  const $ = cheerio.load(html)
  const jsonLd: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_i, element) => {
    let parsed: unknown
    try { parsed = JSON.parse($(element).contents().text()) } catch { return }
    const pending = [parsed]
    while (pending.length && jsonLd.length < 100) {
      const item = pending.pop()
      if (Array.isArray(item)) pending.push(...item)
      else if (item && typeof item === 'object') {
        const object = item as Record<string, unknown>
        jsonLd.push(object)
        if (Array.isArray(object['@graph'])) pending.push(...object['@graph'])
      }
    }
  })
  const scope = $('[itemtype*="schema.org/Product" i]').first()
  const microdata: Record<string, unknown> = {}
  let props = 0
  let bytes = 0
  scope.find('[itemprop]').each((_i, element) => {
    if (props >= 30 || bytes >= 4000) return false
    const node = $(element)
    const name = (node.attr('itemprop') ?? '').trim()
    if (!name || node.is('[itemscope]')) return
    const owner = node.parents('[itemscope]').first()
    let nestedName: string | null = null
    if (!owner.is(scope)) {
      nestedName = owner.attr('itemprop')?.trim() || null
      if (!nestedName) return
    }
    const tag = element.tagName?.toLowerCase()
    const urlAttribute = tag === 'link' || tag === 'a' ? 'href'
      : tag === 'img' || tag === 'source' ? 'src' : tag === 'time' ? 'datetime' : null
    const value = (node.attr('content') || (urlAttribute ? node.attr(urlAttribute) : '') || node.text()).replace(/\s+/g, ' ').trim()
    if (!value) return
    props++
    bytes += name.length + value.length
    const target = nestedName ? (microdata[nestedName] ??= {}) as Record<string, unknown> : microdata
    if (target[name] === undefined) target[name] = value
  })
  const metaValue = (name: string) => $(`meta[property="${name}"],meta[name="${name}"]`).first().attr('content')
  return {
    jsonLd,
    microdata: props ? microdata : undefined,
    meta: {
      title: metaValue('og:title') ?? $('title').first().text(),
      description: metaValue('description') ?? metaValue('og:description'),
      image: metaValue('og:image'),
    },
  }
}
