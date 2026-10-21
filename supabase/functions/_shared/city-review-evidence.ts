/** A local claim needs local source evidence, not a country's legal context. */
export interface CityReviewCitation { field?: unknown; url?: unknown; quote?: unknown }
export function hasCityReviewEvidence(field: string, citations: CityReviewCitation[]): boolean {
  return citations.some((citation) => {
    if (typeof citation.url !== 'string' || typeof citation.quote !== 'string' || citation.quote.trim().length < 12) return false
    let url: URL
    try { url = new URL(citation.url) } catch { return false }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false
    if (field === 'lgbt_friendly_rating') {
      // These pages describe national law. They cannot substantiate a city rating.
      if (/\/wiki\/LGBT_rights_in_/i.test(url.pathname)) return false
      if (/equality[_\s]*score/i.test(citation.quote)) return false
    }
    return true
  })
}
