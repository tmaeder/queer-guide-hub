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

  const priceRaw = meta.price ?? n.price ?? meta.search_price
  if (priceRaw != null && String(priceRaw).trim() !== '') {
    const price = Number(priceRaw)
    if (!Number.isFinite(price)) errors.push('E_INVALID_PRICE')
    else if (price < 0) errors.push('E_NEGATIVE_PRICE')
    else if (price > 1_000_000) warnings.push('W_PRICE_SUSPICIOUS')
    else if (price === 0) warnings.push('W_ZERO_PRICE')
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
