import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

// Recover product description + images from a fetched marketplace product page.
// Pure + deterministic given (html, url). No network — the caller fetches.
//
// Precision-first (these merchants are Shopify/Magento stores):
//   description: JSON-LD Product.description ONLY. og/meta description on these
//     stores is the store-wide tagline ("Mister B is your one stop store…") or a
//     soft-404 message — filling it would clone identical junk across thousands
//     of rows, so it is deliberately NOT used as a fallback.
//   images:      JSON-LD Product.image[] → og:image → twitter:image → product <img>.
//     og:image IS per-product on these platforms, so it is a safe fallback —
//     but only when `hasProductSchema` proves the page is a live product page.
//
// `hasProductSchema` lets the caller distinguish a real product page from a
// soft-404 (HTTP 200 "page does not exist"). `notFound` flags explicit 404 copy.
// All image URLs are absolutized against the page URL and de-duplicated.

export interface ExtractedProduct {
  description: string | null
  images: string[]
  descMethod: 'jsonld' | 'none'
  imgMethod: 'jsonld' | 'og' | 'twitter' | 'dom' | 'none'
  hasProductSchema: boolean
  notFound: boolean
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const s = (v ?? '').toString().replace(/\s+/g, ' ').trim()
    if (s) return s
  }
  return null
}

function absolutize(src: string | null | undefined, baseUrl: string): string | null {
  const s = (src ?? '').toString().trim()
  if (!s) return null
  if (s.startsWith('data:')) return null
  try {
    return new URL(s, baseUrl).toString()
  } catch {
    return null
  }
}

// Collect every JSON-LD object (flattening @graph / arrays) into a flat list.
function collectJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).contents().text().trim()
    if (!raw) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const stack = [parsed]
    while (stack.length) {
      const node = stack.pop()
      if (Array.isArray(node)) {
        stack.push(...node)
        continue
      }
      if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>
        out.push(obj)
        if (Array.isArray(obj['@graph'])) stack.push(...(obj['@graph'] as unknown[]))
      }
    }
  })
  return out
}

const PRODUCT_TYPES = new Set(['Product', 'ProductGroup', 'IndividualProduct', 'Offer'])

function isProductNode(node: Record<string, unknown>): boolean {
  const t = node['@type']
  if (!t) return false
  if (typeof t === 'string') return PRODUCT_TYPES.has(t)
  if (Array.isArray(t)) return t.some((x) => PRODUCT_TYPES.has(String(x)))
  return false
}

// Flatten a JSON-LD `image` value (string | object | array) to absolute URLs.
function jsonLdImages(node: Record<string, unknown>, baseUrl: string): string[] {
  const img = node.image
  const out: string[] = []
  const push = (v: unknown) => {
    if (typeof v === 'string') {
      const a = absolutize(v, baseUrl)
      if (a) out.push(a)
    } else if (v && typeof v === 'object') {
      const a = absolutize((v as Record<string, unknown>).url as string, baseUrl)
      if (a) out.push(a)
    }
  }
  if (Array.isArray(img)) img.forEach(push)
  else push(img)
  return out
}

const NOT_FOUND_RE =
  /(page (you (tried to access|requested) )?(does not|doesn'?t) exist|404 not found|page not found|product (no longer|not) available)/i

/** Extract product description + images from raw HTML. Pure; never throws. */
export function extractProduct(html: string, url: string): ExtractedProduct {
  const empty: ExtractedProduct = {
    description: null,
    images: [],
    descMethod: 'none',
    imgMethod: 'none',
    hasProductSchema: false,
    notFound: false,
  }
  if (!html || html.length < 32) return empty

  let $: cheerio.CheerioAPI
  try {
    $ = cheerio.load(html)
  } catch {
    return empty
  }

  const meta = (sel: string) => $(sel).attr('content') ?? null

  // Soft-404 detection: many stores serve HTTP 200 with "page does not exist"
  // copy in <title> / og:description for removed products.
  const titleTxt = `${$('title').first().text()} ${meta('meta[property="og:description"]') ?? ''}`
  const notFound = NOT_FOUND_RE.test(titleTxt)

  // ---- JSON-LD Product ----
  const ld = collectJsonLd($)
  const product = ld.find(isProductNode)
  const hasProductSchema = !!product

  let description: string | null = null
  let descMethod: ExtractedProduct['descMethod'] = 'none'
  let images: string[] = []
  let imgMethod: ExtractedProduct['imgMethod'] = 'none'

  // Description ONLY from JSON-LD Product (see header) — store taglines excluded.
  if (product) {
    const d = firstNonEmpty(product.description as string)
    if (d) {
      description = d
      descMethod = 'jsonld'
    }
    const imgs = jsonLdImages(product, url)
    if (imgs.length) {
      images = imgs
      imgMethod = 'jsonld'
    }
  }

  // ---- image fallbacks ----
  if (!images.length) {
    const og = absolutize(
      firstNonEmpty(
        meta('meta[property="og:image:secure_url"]'),
        meta('meta[property="og:image"]'),
        meta('meta[name="og:image"]'),
      ),
      url,
    )
    if (og) {
      images = [og]
      imgMethod = 'og'
    }
  }
  if (!images.length) {
    const tw = absolutize(firstNonEmpty(meta('meta[name="twitter:image"]')), url)
    if (tw) {
      images = [tw]
      imgMethod = 'twitter'
    }
  }
  if (!images.length) {
    const scope = $('[class*="product" i] img, [id*="product" i] img, [itemprop="image"]')
    const pool = scope.length ? scope : $('img')
    const found: string[] = []
    pool.each((_i, el) => {
      const a = absolutize($(el).attr('src') ?? $(el).attr('data-src'), url)
      if (a && /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(a)) found.push(a)
    })
    if (found.length) {
      images = found.slice(0, 6)
      imgMethod = 'dom'
    }
  }

  // De-dupe images preserving order; clamp description length.
  const seen = new Set<string>()
  images = images.filter((u) => (seen.has(u) ? false : (seen.add(u), true))).slice(0, 6)
  if (description && description.length > 4000) description = description.slice(0, 4000).trim()

  return { description, images, descMethod, imgMethod, hasProductSchema, notFound }
}
