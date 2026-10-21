/** Read failure is not evidence that a settlement does not exist. */
export interface WikiSearchResponse { ok: boolean; data?: unknown }
export async function searchCityQid(
  query: string,
  country: string | null,
  request: (url: string) => Promise<WikiSearchResponse>,
): Promise<string | null> {
  const response = await request(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}` +
    '&language=en&uselang=en&type=item&limit=7&format=json',
  )
  if (!response.ok) throw new Error('wikidata_search_unavailable')
  const data = response.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('wikidata_search_invalid_response')
  const body = data as Record<string, unknown>
  if (body.error || !Array.isArray(body.search)) throw new Error('wikidata_search_invalid_response')
  let fallback: string | null = null
  for (const value of body.search) {
    if (!value || typeof value !== 'object') continue
    const hit = value as { id?: unknown; description?: unknown }
    if (typeof hit.id !== 'string' || !/^Q\d+$/.test(hit.id) || typeof hit.description !== 'string') continue
    if (!/(capital|city|town|municipality|commune|comune|village|settlement|prefecture|district|county|borough|locality|metropolis|urban)/i.test(hit.description)) continue
    if (country && hit.description.toLowerCase().includes(country.toLowerCase())) return hit.id
    fallback ??= hit.id
  }
  return fallback
}
