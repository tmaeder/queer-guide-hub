/**
 * Affiliate URL utilities.
 *
 * Cleans tracking parameters from URLs while preserving affiliate tags,
 * and applies affiliate partner parameters for known domains.
 */

export interface AffiliatePartner {
  id: string;
  partner_name: string;
  domains: string[];
  url_patterns: string[] | null;
  parameters: Record<string, string>;
  redirect_template: string | null;
  enabled: boolean;
}

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'msclkid', 'twclid',
  '_ga', '_gl', 'dclid', 'srsltid',
]);

/**
 * Check if a URL matches a partner by domain.
 */
export function matchPartner(
  url: string,
  partners: AffiliatePartner[],
): AffiliatePartner | null {
  try {
    const { hostname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    return partners.find(p =>
      p.enabled && p.domains.some(d => host === d || host.endsWith(`.${d}`)),
    ) ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove common tracking parameters from a URL while preserving affiliate params.
 */
export function cleanTrackingParams(
  url: string,
  preserveKeys: Set<string> = new Set(),
): string {
  try {
    const parsed = new URL(url);
    const toDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase()) && !preserveKeys.has(key)) {
        toDelete.push(key);
      }
    });
    toDelete.forEach(k => parsed.searchParams.delete(k));
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Rewrite a URL with affiliate parameters. Prevents double-tagging by
 * checking if the param already exists with the correct value.
 */
export function rewriteAffiliateUrl(
  url: string,
  partners: AffiliatePartner[],
): string {
  const partner = matchPartner(url, partners);
  if (!partner || !partner.parameters) return url;

  try {
    // Collect affiliate param keys to preserve during cleaning
    const affiliateKeys = new Set(Object.keys(partner.parameters));
    const cleaned = cleanTrackingParams(url, affiliateKeys);
    const parsed = new URL(cleaned);

    // Apply partner params, skip if already correct (prevent double-tagging)
    for (const [key, value] of Object.entries(partner.parameters)) {
      const existing = parsed.searchParams.get(key);
      if (existing !== String(value)) {
        parsed.searchParams.set(key, String(value));
      }
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Check whether a URL belongs to any known affiliate partner.
 */
export function isAffiliateDomain(
  url: string,
  partners: AffiliatePartner[],
): boolean {
  return matchPartner(url, partners) !== null;
}
