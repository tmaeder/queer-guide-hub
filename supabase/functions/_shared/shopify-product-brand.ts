import { brandFromVendor } from './marketplace-pipeline-utils.ts'

export interface ShopifyBrandRules {
  vendorAliases?: Record<string, unknown> | null
  excludedVendors?: readonly string[] | null
  productBrandOverrides?: Record<string, unknown> | null
}

/** A vendor can name the right maker for most of a shop and the wrong one for
 * one product. Require both the exact handle and the observed vendor before
 * applying a researched correction; never rewrite that vendor shop-wide. */
export function brandFromShopifyProduct(
  product: { handle: string; vendor?: string | null },
  fallback: string | null | undefined,
  rules: ShopifyBrandRules = {},
): string | null {
  const overrides = rules.productBrandOverrides
  const entry = overrides && Object.hasOwn(overrides, product.handle)
    ? overrides[product.handle] : undefined
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const correction = entry as Record<string, unknown>
    if (Object.hasOwn(correction, 'vendor') && Object.hasOwn(correction, 'brand')
      && typeof correction.vendor === 'string' && correction.vendor.trim()
      && correction.vendor.trim() === String(product.vendor ?? '').trim()) {
      if (correction.brand === null) return null
      if (typeof correction.brand === 'string' && correction.brand.trim()) return correction.brand.trim()
    }
  }
  return brandFromVendor(product.vendor, fallback, rules.vendorAliases, rules.excludedVendors)
}
