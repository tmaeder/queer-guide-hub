// ============================================================================
// Marketplace Pipeline Utils — validation + normalization helpers
// Used by pipeline-validate, pipeline-deduplicate, pipeline-commit,
// source-awin, source-shopify, source-etsy, source-csv-upload (marketplace).
// ============================================================================

export interface MarketplaceValidationResult {
  errors: string[]
  warnings: string[]
  quality: number
}

const SAFE_CURRENCIES = new Set([
  'USD','EUR','GBP','CAD','AUD','CHF','JPY','CNY','SEK','NOK','DKK','NZD','BRL','MXN','ZAR','INR','SGD','HKD','KRW','TRY','PLN','CZK','HUF',
])

const KNOWN_AVAILABILITY = new Set(['unknown','in_stock','out_of_stock','discontinued','preorder'])

export function extractMerchantDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

export function normalizeCurrency(raw: unknown): string {
  const s = String(raw ?? '').trim().toUpperCase()
  return SAFE_CURRENCIES.has(s) ? s : 'USD'
}

/**
 * A brand name, or the merchant's own name when the feed's vendor field is not one.
 *
 * Shopify's `vendor` is free text the merchant fills in, and it is taken verbatim
 * as `brand` — which is then `marketplace_normalize_brand()`d into `brand_key`,
 * the identity every brand row, maker page and directory tile hangs off. So a
 * merchant who uses that field for something else does not merely mislabel a
 * product: they mint a brand.
 *
 * Garçon Model put purchase-order numbers there. Measured on prod 2026-09-16:
 * their 198 listings were split across 20 brand_keys — `12807-204144345`,
 * `19868-001638740`, `‭1280-7204244927‬` — against 9 on the real `GARÇON` row,
 * and all 20 artifacts published a maker page naming a PO number. Queer Lit had
 * one book carrying its ISBN (`9781728209982`) where that feed puts the author.
 *
 * THE TEST IS "CONTAINS NO LETTER IN ANY SCRIPT", not a digit or punctuation
 * pattern, because the failure is not that these strings have digits — plenty of
 * real brands do (`2(X)IST`, `1979 SAS (Teil der Marc Dorcel Group)`, `b-Vibe`).
 * It is that they have no word in them at all. Measured across all 70,585 live
 * listings that predicate matches 190 rows on 2 merchants and nothing else, so
 * every other shop is byte-identical and no re-commit is forced.
 *
 * `\p{L}` and not `[a-z]`: `東京`, `Åberg` and `Garçon` are brand names.
 *
 * Deliberately NOT a place to catch a vendor that is merely WRONG — "Shipping
 * Protection" is a line item rather than a brand and sails through, because
 * distinguishing that from a real brand needs judgement this cannot have.
 */
export function brandFromVendor(
  vendor: string | null | undefined,
  fallback: string | null | undefined,
): string {
  const v = String(vendor ?? '').trim()
  if (/\p{L}/u.test(v)) return v
  // The fallback is the merchant, never `vendor` again — that is the value just
  // rejected, and a chain that falls back onto it reinstates the defect.
  return String(fallback ?? '').trim() || v
}

export function validateMarketplaceNormalized(n: Record<string, unknown>): MarketplaceValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const meta = (n.metadata ?? {}) as Record<string, unknown>
  const contacts = (n.contacts ?? {}) as Record<string, unknown>

  const title = String(n.name ?? n.title ?? meta.product_name ?? meta.title ?? '').trim()
  if (title.length < 2) errors.push('E_MISSING_TITLE')
  if (title.length > 300) warnings.push('W_TITLE_VERY_LONG')

  const business = String(n.business_name ?? meta.merchant_name ?? meta.business_name ?? meta.brand_name ?? '').trim()
  if (!business) warnings.push('W_MISSING_BUSINESS_NAME')

  const priceType = String(n.price_type ?? meta.price_type ?? '').trim().toLowerCase()
  const priceRaw = meta.price ?? n.price ?? meta.search_price
  if (priceRaw != null && String(priceRaw).trim() !== '') {
    const price = Number(priceRaw)
    if (!Number.isFinite(price)) errors.push('E_INVALID_PRICE')
    else if (price < 0) errors.push('E_NEGATIVE_PRICE')
    else if (price > 1_000_000) warnings.push('W_PRICE_SUSPICIOUS')
    // L-1 (audit 2026-06-05): a price <= 0 is only valid for a free listing.
    // Otherwise it is a feed glitch (e.g. 0.00 placeholders) — reject so it
    // can't surface a "€0" product.
    else if (price <= 0 && priceType !== 'free') errors.push('E_ZERO_PRICE_NOT_FREE')
  } else {
    warnings.push('W_MISSING_PRICE')
  }

  const currency = String(n.currency ?? meta.currency ?? '').trim().toUpperCase()
  if (currency && !SAFE_CURRENCIES.has(currency)) warnings.push('W_UNKNOWN_CURRENCY')

  const urls: string[] = [
    ...((n.urls as string[]) ?? []),
    meta.merchant_deep_link as string,
    meta.aw_deep_link as string,
    meta.product_url as string,
    meta.website as string,
    contacts.website as string,
  ].filter((u): u is string => !!u)

  if (urls.length === 0) errors.push('E_NO_URL')
  else {
    for (const u of urls) {
      try {
        const parsed = new URL(u)
        if (!['http:', 'https:'].includes(parsed.protocol)) errors.push('E_INVALID_URL_SCHEME')
      } catch {
        warnings.push('W_INVALID_URL')
      }
    }
  }

  const images = (n.images ?? []) as string[]
  if (!Array.isArray(images) || images.length === 0) warnings.push('W_NO_IMAGES')
  else {
    for (const img of images.slice(0, 5)) {
      try {
        const u = new URL(String(img))
        if (!['http:', 'https:'].includes(u.protocol)) warnings.push('W_INVALID_IMAGE_URL')
      } catch {
        warnings.push('W_INVALID_IMAGE_URL')
      }
    }
  }

  const category = String(n.category ?? meta.category ?? meta.category_name ?? '').trim()
  if (!category) warnings.push('W_MISSING_CATEGORY')

  const availability = String(n.availability ?? 'unknown').trim().toLowerCase()
  if (!KNOWN_AVAILABILITY.has(availability)) warnings.push('W_UNKNOWN_AVAILABILITY')

  const description = String(n.description ?? meta.description ?? '').trim()
  if (!description) warnings.push('W_NO_DESCRIPTION')
  else if (description.length < 40) warnings.push('W_DESCRIPTION_THIN')

  const quality = Math.max(0, 100 - warnings.length * 5 - errors.length * 40)
  return { errors, warnings, quality }
}

export function scoreMarketplaceQuality(n: Record<string, unknown>): number {
  const { quality } = validateMarketplaceNormalized(n)
  const meta = (n.metadata ?? {}) as Record<string, unknown>
  let bonus = 0
  if (Array.isArray(n.images) && (n.images as unknown[]).length >= 2) bonus += 5
  if (meta.brand || n.brand) bonus += 3
  if (n.affiliate_url) bonus += 3
  if (n.description && String(n.description).length > 200) bonus += 4
  return Math.min(100, quality + bonus)
}
