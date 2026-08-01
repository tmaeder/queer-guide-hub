/**
 * Brand-ownership vocabulary and the sensitive-tag confirm contract, kept out of
 * BrandReviewQueue.tsx so that module exports components only (Fast Refresh).
 */

export interface BrandReviewRow {
  id: string;
  brand_key: string;
  display_name: string;
  suggested_tags: string[] | null;
  ownership_tags: string[] | null;
  confidence: number | null;
  evidence: string | null;
  detection_source: string | null;
  product_count: number | null;
  top_source: string | null;
  sample_url: string | null;
}

export const OWNERSHIP_VOCAB = [
  'queer_owned',
  'trans_owned',
  'bipoc_owned',
  'women_owned',
  'disabled_owned',
  'nonprofit',
] as const;

export const SENSITIVE_TAGS = ['queer_owned', 'trans_owned', 'bipoc_owned'] as const;

export function tagLabel(tag: string): string {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Which sensitive tags (if any) require the explicit confirm the RPC demands.
 * Exported for the unit test — this mirrors approve_marketplace_brand's
 * p_confirm contract exactly.
 */
export function sensitiveConfirmMessage(tags: string[], brandName: string): string | null {
  const sensitive = tags.filter((t) => (SENSITIVE_TAGS as readonly string[]).includes(t));
  if (sensitive.length === 0) return null;
  return `Publicly assert ${sensitive.map(tagLabel).join(' + ')} for "${brandName}"? This claim appears on brand pages and product badges — approve only with evidence.`;
}
