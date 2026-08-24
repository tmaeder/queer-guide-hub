/**
 * Bigger-variant candidates for a merchant product image URL.
 *
 * A scraper takes whatever `<img src>` a product page happened to render, and
 * for several storefront platforms that is a RESIZED DERIVATIVE sitting at a
 * predictable path next to the original: Magento serves `/cache/<hash>/…`,
 * OpenCart `/image/cache/…-840x840.jpg`, WordPress `…-300x300.jpg`. The full
 * image is one path rewrite away and nobody was asking for it — measured on
 * this corpus, mr-s-leather's stored covers are **135×135** because every one
 * of them is a Magento cache thumbnail.
 *
 * This module only PROPOSES. It cannot know whether a candidate exists or is
 * actually bigger, so every rule is a guess the caller must verify by fetching
 * the candidate and comparing pixel dimensions — `imageSize(bytes)`, never the
 * declared size in a URL. Shopify taught this lesson on the brand logos: a
 * `?width=32` on a Shopify CDN url is a RESIZE REQUEST, not a description of
 * the asset, and asking for 2048 gets 2048 only if the original is that big.
 * Ask for more, then measure the answer.
 *
 * ── Rules deliberately NOT here, because they were measured and rejected ────
 *
 * **Filename guessing.** `m022-tn-a.jpg` looks like it should have a sibling
 * `m022-a.jpg`, and it does — a 500×600 "no image available" placeholder that
 * mr-s-leather returns for every product, byte-identical (6,678 B) across
 * unrelated items. A rule that guesses filenames produces a URL that is bigger
 * than the thumbnail and shows the wrong thing, which is worse than the
 * thumbnail. Every rule below rewrites a path PREFIX or a size TOKEN; none
 * invents a name. `looksLikePlaceholder` exists as the second line of defence
 * for the derivative case (a real product's cache entry can still be a generic
 * asset), not as permission to guess.
 *
 * **PrestaShop image presets.** `/1731-large_default/city-boy.jpg` suggests a
 * `-original` or `-thickbox_default` sibling. On salzgeber.shop both 404 and
 * `large_default` (700×992) is already the largest preset the shop generates;
 * the others (`medium_default` 452, `home_default` 230, `cart_default` 125) are
 * all smaller. Presets are per-shop and unguessable, so this would be pure
 * request spend for nothing.
 */

/** A candidate bigger variant, with the rule that produced it (for auditing). */
export interface UpscaleCandidate {
  url: string
  rule: string
  /**
   * Whether the candidate is the SAME framing as the current image, only
   * larger. True for in-place resizers (a Shopify `width=` request, an imgix
   * `w=`): those re-render one asset, so a changed aspect ratio means the
   * rewrite landed on a different picture and must be rejected.
   *
   * False for the cache-strip rules, where a changed ratio is EXPECTED and is
   * itself part of the win: a Magento cache profile fits the product onto a
   * square canvas, so mr-s-leather's 135×135 derivative is a padded crop of a
   * 400×500 original. Enforcing aspect here would reject the largest
   * improvement in the corpus (3× on 983 listings) as if it were a mismatch.
   */
  preservesAspect: boolean
}

const MAX_WIDTH = 2048

function withQuery(u: URL, mutate: (p: URLSearchParams) => void): string {
  const next = new URL(u.href)
  mutate(next.searchParams)
  return next.href
}

/**
 * Magento: `/media/catalog/product/cache/<32-hex>/a/b/name.jpg`
 *       →  `/media/catalog/product/a/b/name.jpg`
 *
 * The cache segment is a per-store-view resize profile; the path underneath it
 * is the merchant's own upload. Measured: mr-s-leather 135×135 → 400×500,
 * misterb 480×320 → 900×600 (and unchanged where the derivative already WAS
 * the original, which is why the caller must compare and keep the larger).
 */
function magentoCacheStrip(u: URL): UpscaleCandidate[] {
  const m = u.pathname.match(/^(.*\/media\/catalog\/product)\/cache\/[0-9a-f]{16,}(\/.+)$/i)
  if (!m) return []
  const next = new URL(u.href)
  next.pathname = m[1] + m[2]
  return [{ url: next.href, rule: 'magento_cache_strip', preservesAspect: false }]
}

/**
 * OpenCart: `/image/cache/catalog/AUX076_a-840x840.jpg`
 *        →  `/image/catalog/AUX076_a.jpg`
 *
 * Measured on invinciblerubber.com: 840×840 → 1000×1000 across the catalogue.
 */
function openCartCacheStrip(u: URL): UpscaleCandidate[] {
  const m = u.pathname.match(/^(.*)\/image\/cache\/(.+?)-\d{2,4}x\d{2,4}(\.\w+)$/)
  if (!m) return []
  const next = new URL(u.href)
  next.pathname = `${m[1]}/image/${m[2]}${m[3]}`
  return [{ url: next.href, rule: 'opencart_cache_strip', preservesAspect: false }]
}

/**
 * Shopify CDN. Two independent shrinkers, so two candidates:
 *   - a `_512x512` / `_600x_crop_center` token before the extension names a
 *     generated derivative; without it the CDN serves the master.
 *   - `?width=533` is a live resize request; raising it costs nothing because
 *     Shopify never upscales past the original.
 *
 * The token must be matched with a LEADING UNDERSCORE. Merchants also put
 * literal dimensions in their own filenames — `300000091376-1280x1280.jpg` on
 * ohmyfantasy is the uploaded name, and stripping `-1280x1280` from it asks for
 * a file that does not exist.
 */
function shopifyOriginal(u: URL): UpscaleCandidate[] {
  const host = u.hostname.toLowerCase()
  const isShopify = host === 'cdn.shopify.com' || host.endsWith('.shopifycdn.com') || u.pathname.includes('/cdn/shop/')
  if (!isShopify) return []

  const out: UpscaleCandidate[] = []
  const stripped = u.pathname.replace(/_(\d{1,4})?x(\d{1,4})?(_crop_[a-z]+)?(?=\.\w+$)/i, '')
  if (stripped !== u.pathname) {
    const next = new URL(u.href)
    next.pathname = stripped
    next.searchParams.delete('width')
    next.searchParams.delete('height')
    // A Shopify size token can be a fitted crop (`_600x_crop_center`), so the
    // master is not necessarily the same framing.
    out.push({ url: next.href, rule: 'shopify_size_token_strip', preservesAspect: false })
  }
  if (u.searchParams.has('width') || u.searchParams.has('height')) {
    const next = new URL(u.href)
    next.pathname = stripped
    next.searchParams.set('width', String(MAX_WIDTH))
    next.searchParams.delete('height')
    out.push({ url: next.href, rule: 'shopify_width_raise', preservesAspect: true })
  }
  return out
}

/**
 * WordPress media library: `…/uploads/2016/12/LJ_006-300x200.jpg` → `…/LJ_006.jpg`.
 * The `-WxH` suffix is a registered image size; the un-suffixed file is the
 * upload. Scoped to `/wp-content/uploads/` so it cannot fire on a merchant
 * filename that merely ends in digits-x-digits.
 */
function wordpressSizeStrip(u: URL): UpscaleCandidate[] {
  const m = u.pathname.match(/^(.*\/wp-content\/uploads\/.+?)-\d{2,4}x\d{2,4}(\.\w+)$/)
  if (!m) return []
  const next = new URL(u.href)
  next.pathname = m[1] + m[2]
  // A registered WordPress size can be a hard crop, not just a scale.
  return [{ url: next.href, rule: 'wordpress_size_strip', preservesAspect: false }]
}

/**
 * Generic query-string resizers (BigCartel/imgix `w`+`h`, Squarespace
 * `format=1000w`, Shopify-alikes `imwidth`/`sw`). Measured: bigcartel
 * `?w=1000&h=1000` → 666×666 served, raised → 1365×1365.
 *
 * Only fires when a dimension parameter is already present — adding one to a
 * URL that never had one turns a plain image request into a resize request on
 * hosts that support it, which can make the result SMALLER.
 */
const WIDTH_KEYS = ['width', 'w', 'imwidth', 'sw', 'maxwidth']
const HEIGHT_KEYS = ['height', 'h', 'maxheight']

function queryDimensionBump(u: URL): UpscaleCandidate[] {
  if (u.hostname.toLowerCase() === 'cdn.shopify.com') return [] // owned by shopifyOriginal
  const keys = [...u.searchParams.keys()].map((k) => k.toLowerCase())
  const hasDim = [...WIDTH_KEYS, ...HEIGHT_KEYS].some((k) => keys.includes(k))
  const fmt = u.searchParams.get('format')
  const isSquarespaceFormat = !!fmt && /^\d{2,4}w$/.test(fmt)
  if (!hasDim && !isSquarespaceFormat) return []

  return [
    {
      url: withQuery(u, (p) => {
        for (const k of [...p.keys()]) {
          if (WIDTH_KEYS.includes(k.toLowerCase()) || HEIGHT_KEYS.includes(k.toLowerCase())) {
            p.set(k, String(MAX_WIDTH))
          }
        }
        if (isSquarespaceFormat) p.set('format', '2500w')
      }),
      rule: 'query_dimension_bump',
      preservesAspect: true,
    },
  ]
}

const RULES = [magentoCacheStrip, openCartCacheStrip, shopifyOriginal, wordpressSizeStrip, queryDimensionBump]

/**
 * Ordered, de-duplicated bigger-variant candidates for `url`. Never includes
 * `url` itself. An empty result means "this URL carries no evidence of being a
 * derivative" — the overwhelmingly common case, and not a failure.
 */
export function upscaleCandidates(url: string): UpscaleCandidate[] {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return []
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return []

  const seen = new Set<string>([url])
  const out: UpscaleCandidate[] = []
  for (const rule of RULES) {
    for (const c of rule(parsed)) {
      if (seen.has(c.url)) continue
      seen.add(c.url)
      out.push(c)
    }
  }
  return out
}

/**
 * Paths that storefronts use for "image not available". A cache derivative can
 * legitimately resolve to one of these, and publishing it would replace a small
 * real photo with a generic grey box.
 */
export function looksLikePlaceholder(url: string): boolean {
  return /\/placeholder[/_.-]|\/no[_-]?(image|photo|selection)\b|\/default\/(image|placeholder)/i.test(url)
}

/**
 * Is `candidate` a genuine improvement on `current`?
 *
 * The margin is deliberate: a rewrite that returns the same asset a few pixels
 * different is churn, and every accepted candidate costs a re-mirror. 15% sits
 * below the smallest real win measured (840 → 1000 is 1.19×; 135 → 400 is 3×)
 * and above the noise.
 *
 * The two rule families need different tests, and using one for both is wrong
 * in both directions:
 *
 * - `preservesAspect` (in-place resizers): width must grow, height must not
 *   shrink, and the ratio must hold to 2%. A candidate that is wider but
 *   SHORTER is a different crop, not a better copy — accepting it silently
 *   re-frames the photo, and on a 3:4 card that can cut the product out of shot.
 *
 * - cache-strip rules: width must grow, and area must not SHRINK. These
 *   derivatives are usually fitted onto a square canvas, so the original is
 *   often shorter once the padding is gone — a 600×600 padded thumbnail of an
 *   800×500 photo loses height by losing dead canvas, which a height floor
 *   would read as a regression. Area cannot be the primary test either: that
 *   same de-padding is only a 1.11× area gain while being a 1.33× gain in real
 *   pixels across the product, so anything above a break-even area floor
 *   rejects it. Width leads, area vetoes — a candidate that is wider only
 *   because it is a letterboxed banner loses area and is refused.
 */
export function isRealUpgrade(
  current: { w: number; h: number },
  candidate: { w: number; h: number },
  preservesAspect = true,
): boolean {
  if (!current.w || !current.h || !candidate.w || !candidate.h) return false
  if (candidate.w < current.w * 1.15) return false
  if (!preservesAspect) {
    return candidate.w * candidate.h >= current.w * current.h
  }
  if (candidate.h < current.h) return false
  const ratio = current.w / current.h
  const candidateRatio = candidate.w / candidate.h
  return Math.abs(candidateRatio - ratio) / ratio <= 0.02
}
