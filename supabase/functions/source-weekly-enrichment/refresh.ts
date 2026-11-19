import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { insertSuggestion } from '../_shared/ai-suggestions.ts'
import { scoreImage, isAcceptable } from '../_shared/scoreImage.ts'
import { MissingCredentialsError, InvalidCredentialsError } from '../_shared/source-adapter.ts'

type Row = Record<string, unknown>
interface Source extends Row { id: string; slug: string; config: Row; updated_at: string }
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const UA = 'QueerGuide/1.0 (+https://queer.guide; contact@queer.guide)'
export class ImageProviderRateLimitError extends Error {
  constructor(provider: string) { super(`${provider} image quota is exhausted (HTTP 429); wait for its quota reset or increase the account limit`); this.name = 'ImageProviderRateLimitError' }
}

async function json(url: string, headers: Record<string, string>, fetcher: typeof fetch): Promise<Row> {
  const response = await fetcher(url, { headers, redirect: 'error', signal: AbortSignal.timeout(8000) })
  const host = new URL(url).hostname
  if (response.status === 429 && ['api.pexels.com', 'api.unsplash.com'].includes(host)) {
    await response.body?.cancel(); throw new ImageProviderRateLimitError(host === 'api.pexels.com' ? 'Pexels' : 'Unsplash')
  }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel()
    if (host === 'api.pexels.com') throw new InvalidCredentialsError('PEXELS_API_KEY', response.status)
    if (host === 'api.unsplash.com') throw new InvalidCredentialsError('UNSPLASH_ACCESS_KEY', response.status)
    throw Error(`Wikipedia provider HTTP ${response.status}`)
  }
  if (!response.ok) { await response.body?.cancel(); throw Error(`Refresh provider HTTP ${response.status}`) }
  if (!response.body) throw Error('Empty refresh response')
  const reader = response.body.getReader(), parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break
      size += value.byteLength; if (size > 2_000_000) throw Error('Refresh response exceeds the byte limit'); parts.push(value) }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  const result = JSON.parse(new TextDecoder().decode(bytes))
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('Invalid refresh response')
  return result
}

/** Exact existing identifier + human class + matching Wikipedia identifier. No name search. */
export async function wikipediaProposal(target: Row, fetcher: typeof fetch): Promise<Row | null> {
  const qid = String(target.wikidata_qid ?? '')
  if (!/^Q[1-9]\d*$/.test(qid)) return null
  const data = await json(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, { 'User-Agent': UA }, fetcher)
  const entity = (data.entities as Record<string, Row> | undefined)?.[qid]
  const humans = ((entity?.claims as Record<string, Row[]> | undefined)?.P31 ?? [])
  if (!humans.some(claim => claim.rank !== 'deprecated' &&
    ((claim.mainsnak as Row)?.datavalue as { value?: { id?: string } })?.value?.id === 'Q5')) return null
  const title = ((entity?.sitelinks as Record<string, Row> | undefined)?.enwiki?.title)
  if (typeof title !== 'string' || !title || title.length > 300 || /[:#|]/u.test(title)) return null
  const wiki = await json(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { 'User-Agent': UA }, fetcher)
  if (wiki.type !== 'standard' || wiki.wikibase_item !== qid || typeof wiki.extract !== 'string' || !wiki.extract.trim()) return null
  const url = (((wiki.content_urls as Row)?.desktop as Row)?.page)
  if (typeof url !== 'string') return null
  const page = new URL(url)
  if (page.origin !== 'https://en.wikipedia.org' || page.username || page.password || page.search || page.hash ||
    decodeURIComponent(page.pathname.slice(6)).replaceAll('_', ' ') !== title.replaceAll('_', ' ') || !page.pathname.startsWith('/wiki/')) return null
  const description = wiki.extract.trim().slice(0, 4000)
  if (description === String(target.bio ?? '').trim()) return null
  return { field: 'bio', value: description, source_url: page.toString(), wikidata_qid: qid }
}

export async function pexelsProposal(target: Row, key: string, fetcher: typeof fetch): Promise<Row | null> {
  const country = Array.isArray(target.countries) ? target.countries[0]?.name : (target.countries as Row | null)?.name
  if (typeof target.name !== 'string' || typeof country !== 'string' || !country) return null
  const query = `${target.name} ${country} city architecture`
  const data = await json(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`, { Authorization: key }, fetcher)
  if (!Array.isArray(data.photos)) throw Error('Pexels returned no photos array')
  const photos = (data.photos as Row[]).filter(photo => {
    const src = (photo.src as Row)?.large2x || (photo.src as Row)?.large
    try { const u = new URL(String(src)); return u.protocol === 'https:' && u.hostname === 'images.pexels.com' && !u.username && !u.password } catch { return false }
  }).map(photo => ({ photo, score: scoreImage({ alt: String(photo.alt ?? ''), width: Number(photo.width), height: Number(photo.height),
    source: 'pexels', subject: { name: String(target.name), country }, subjectType: 'city' }) }))
    .filter(item => isAcceptable(item.score, 'cover')).sort((a, b) => b.score - a.score)
  if (!photos.length) return null
  const { photo, score } = photos[0]
  return { image_url: (photo.src as Row).large2x || (photo.src as Row).large, image_alt: photo.alt,
    image_source: 'pexels', image_attribution: photo.photographer, photographer_url: photo.photographer_url,
    source_url: photo.url, source_id: String(photo.id), width: photo.width, height: photo.height,
    image_license: 'Pexels License', license_url: 'https://www.pexels.com/license/', score }
}

/** Preserve the existing interactive image tool's configured Unsplash fallback. */
export async function imageProposal(target: Row, getEnv: (name: string) => string | undefined, fetcher: typeof fetch): Promise<{ proposed: Row | null; fallback: boolean }> {
  const pexels = getEnv('PEXELS_API_KEY'), unsplash = getEnv('UNSPLASH_ACCESS_KEY')
  if (!pexels && !unsplash) throw new MissingCredentialsError(['PEXELS_API_KEY', 'UNSPLASH_ACCESS_KEY'])
  if (pexels) {
    try { return { proposed: await pexelsProposal(target, pexels, fetcher), fallback: false } }
    catch (error) { if (!unsplash || !(error instanceof ImageProviderRateLimitError || error instanceof InvalidCredentialsError)) throw error }
  }
  const country = Array.isArray(target.countries) ? target.countries[0]?.name : (target.countries as Row | null)?.name
  if (typeof target.name !== 'string' || typeof country !== 'string' || !country) return { proposed: null, fallback: true }
  const query = `${target.name} ${country} city architecture`
  const data = await json(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`, { Authorization: `Client-ID ${unsplash}` }, fetcher)
  if (!Array.isArray(data.results)) throw Error('Unsplash returned no results array')
  const photos = (data.results as Row[]).map(photo => ({ photo, score: scoreImage({ alt: String(photo.alt_description || photo.description || ''),
    width: Number(photo.width), height: Number(photo.height), source: 'unsplash', subject: { name: String(target.name), country }, subjectType: 'city' }) }))
    .filter(item => {
      try { const url = new URL(String((item.photo.urls as Row)?.regular)); return url.protocol === 'https:' && url.hostname === 'images.unsplash.com' && !url.username && !url.password && isAcceptable(item.score, 'cover') } catch { return false }
    }).sort((a, b) => b.score - a.score)
  if (!photos.length) return { proposed: null, fallback: true }
  const { photo, score } = photos[0], user = photo.user as Row
  return { fallback: true, proposed: { image_url: (photo.urls as Row).regular, image_alt: photo.alt_description || photo.description,
    image_source: 'unsplash', image_attribution: user?.name, photographer_url: (user?.links as Row)?.html,
    source_url: (photo.links as Row)?.html, source_id: String(photo.id), width: photo.width, height: photo.height,
    image_license: 'Unsplash License', license_url: 'https://unsplash.com/license', score } }
}

/** A rotating weekly batch produces review suggestions; it never writes live entities. */
export async function refreshSource(
  db: SupabaseClient, source: Source, body: Row, getEnv: (name: string) => string | undefined, fetcher: typeof fetch = fetch,
): Promise<Row> {
  const wikipedia = source.slug === 'wikipedia'
  if (!wikipedia && source.slug !== 'pexels') throw Error('Unsupported weekly enrichment registration')
  if (!wikipedia && !getEnv('PEXELS_API_KEY') && !getEnv('UNSPLASH_ACCESS_KEY')) throw new MissingCredentialsError(['PEXELS_API_KEY', 'UNSPLASH_ACCESS_KEY'])
  const table = wikipedia ? 'personalities' : 'cities'
  const config = source.config && typeof source.config === 'object' && !Array.isArray(source.config) ? source.config : {}
  const cursor = typeof config.weekly_refresh_cursor === 'string' && UUID.test(config.weekly_refresh_cursor) ? config.weekly_refresh_cursor : null
  const limit = Math.max(1, Math.min(10, Math.floor(Number(body.batch_size) || 10)))
  async function scan(after: string | null) {
    let query = db.from(table).select(wikipedia ? 'id,wikidata_qid,bio' : 'id,name,countries(name)')
      .order('id').limit(limit)
    query = wikipedia ? query.not('wikidata_qid', 'is', null) : query.or('image_url.is.null,image_url.eq.')
    if (after) query = query.gt('id', after)
    const { data, error } = await query
    if (error) throw Error('Could not scan weekly refresh targets')
    return data as unknown as Row[]
  }
  let targets = await scan(cursor)
  if (!targets.length && cursor) targets = await scan(null)
  const dry = body.dry_run === true, deadline = Date.now() + 75_000
  let fetched = 0, staged = 0, skipped = 0, fallback = false, next: string | null = null
  for (const target of targets) {
    if (Date.now() >= deadline) break
    const image = wikipedia ? null : await imageProposal(target, name => name === 'PEXELS_API_KEY' && fallback ? undefined : getEnv(name), fetcher)
    const proposed = wikipedia ? await wikipediaProposal(target, fetcher) : image?.proposed
    fallback ||= image?.fallback === true
    fetched++; next = String(target.id)
    if (!proposed) { skipped++; continue }
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(proposed))))].map(v => v.toString(16).padStart(2, '0')).join('')
    const { data: prior, error } = await db.from('ai_suggestions').select('id').eq('entity_type', table)
      .eq('entity_id', target.id).eq('prompt_hash', hash).limit(1)
    if (error) throw Error('Could not verify existing refresh suggestions')
    if (prior?.length) { skipped++; continue }
    if (!dry) {
      await insertSuggestion(db, { suggestion_type: wikipedia ? 'other' : 'image_replacement', entity_type: table,
        entity_id: String(target.id), proposed_value: proposed, current_value: wikipedia ? { bio: target.bio } : { image_url: null },
        source: 'external', source_model: `weekly-${source.slug}`, source_run_id: String(body.pipeline_run_id ?? `refresh:${source.id}`),
        prompt_hash: hash, status: 'pending' })
      staged++
    }
  }
  if (!dry && next) {
    const { data, error } = await db.from('ingestion_sources').update({ config: { ...config, weekly_refresh_cursor: next } })
      .eq('id', source.id).eq('updated_at', source.updated_at).select('id')
    if (error || !data?.length) throw Error('Refresh settings changed; the next attempt will safely deduplicate suggestions')
  }
  return { success: true, dry_run: dry, items_total: fetched, items_processed: staged, items_succeeded: staged,
    items_skipped: skipped, items_failed: 0,
    ...(fallback ? { reason: 'Used the existing Unsplash fallback because Pexels was unavailable or unconfigured' } : {}),
    summary: { target_table: table, review_required: true, weekly_batch_limit: limit, used_unsplash_fallback: fallback } }
}
