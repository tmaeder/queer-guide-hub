import { cityClassVerdict, cityCoordVerdict } from './city-class-guard.ts'
import { bestStatement, currentStatements, parseCityNames, CITY_NAME_LANGS, CITY_NAME_SITES, type Claims, type CityNameAlias, type WdLabels, type WdAliases, type WdSitelinks } from './wikidata-city.ts'
import { countryCorrectionTarget, correctedCountryCode } from './city-country-correction.ts'
import type { WikiSearchResponse } from './city-wikidata-search.ts'

type Request = (url: string) => Promise<WikiSearchResponse>
type Entity = { claims?: Claims; labels?: WdLabels; aliases?: WdAliases; sitelinks?: WdSitelinks; missing?: unknown }
export interface CityCandidateEntity { claims: Claims; enwikiTitle?: string; names: CityNameAlias[]; labels?: WdLabels }
export interface CitySearchInput {
  queries: string[]; base: string; originalName?: string; languages?: string[]; countryCode: string | null; latitude: number | null; longitude: number | null
}
export interface CandidateProbe {
  qid: string; class: string; country: 'agree' | 'disagree' | 'unknown'; coordinates: string; distanceKm: number | null
  /** The search hit's own label is the name, not merely an alias. */
  countryCorrections?: { countryQid: string; intendedSubjectQid: string; code: string }[]
  exactLabel: boolean
}
export interface CitySearchMatch {
  kind: 'selected' | 'locality' | 'ambiguous' | 'unresolved' | 'no_match'
  qid: string | null; probes: CandidateProbe[]; entity?: CityCandidateEntity
  /** Why an `unresolved` outcome was refused; stored on the row for diagnosis. */
  blockedBy?: 'incomplete' | 'scope'
}
const key = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const ids = (claims: Claims, property: string) => [...new Set(currentStatements(claims[property]).map(s =>
  (s.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id,
).filter((s): s is string => typeof s === 'string' && /^Q[1-9]\d*$/.test(s)))]

/** One candidate read per query, shared class/country caches across a city batch.
 * Search rank and a description mentioning a city never establish identity.
 */
export function createCitySearchResolver(request: Request, parents: ReadonlyArray<{ child_code: string; parent_code: string }>, classes = new Map<string, string>()) {
  const countries = new Map<string, string>()
  const countryEntities = new Map<string, Entity>()
  const correctionEntities = new Map<string, Entity>()
  const corrections = new Map<string, { countryQid: string; intendedSubjectQid: string; code: string }>()
  async function read(url: string): Promise<Record<string, unknown>> {
    const r = await request(url)
    if (!r.ok) throw new Error('wikidata_candidate_unavailable')
    if (!r.data || typeof r.data !== 'object' || Array.isArray(r.data) || 'error' in r.data) throw new Error('wikidata_candidate_response_invalid')
    return r.data as Record<string, unknown>
  }
  async function entities(qids: string[], props: string, languages = 'en', sites = ''): Promise<Record<string, Entity>> {
    if (!qids.length) return {}
    const d = await read(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.join('|')}&props=${props}&languages=${languages}${sites ? `&sitefilter=${sites}` : ''}&format=json`)
    if (!d.entities || typeof d.entities !== 'object' || Array.isArray(d.entities)) throw new Error('wikidata_candidate_response_invalid')
    const result = d.entities as Record<string, Entity>
    if (qids.some(q => !result[q] || typeof result[q] !== 'object')) throw new Error('wikidata_candidate_response_invalid')
    return result
  }
  async function warm(qids: string[], cache: Map<string, string>, props: string, extract: (e: Entity, qid: string) => string) {
    const missing = [...new Set(qids)].filter(q => !cache.has(q))
    // MediaWiki accepts at most 50 anonymous entity IDs in a request.
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50)
      const loaded = await entities(chunk, props)
      for (const q of chunk) cache.set(q, extract(loaded[q], q))
    }
  }
  const equivalent = (a: string, b: string) => a === b || parents.some(p =>
    p.child_code.toUpperCase() === a && p.parent_code.toUpperCase() === b ||
    p.child_code.toUpperCase() === b && p.parent_code.toUpperCase() === a,
  )
  return async (input: CitySearchInput): Promise<CitySearchMatch> => {
    const seen = new Set<string>()
    const literal = new Set<string>()
    const exactLabels = new Set<string>()
    const probes: CandidateProbe[] = []
    let incomplete = false
    let geographicScopeConflict = false
    const original = input.originalName ? key(input.originalName) : key(input.base)
    // Collect the complete bounded search ladder before adoption. A literal
    // "Washington, D.C." result must outrank an unrelated nearby "Washington".
    for (const query of [...new Set(input.queries)]) {
      const d = await read(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&uselang=en&type=item&limit=20&format=json`)
      if (!Array.isArray(d.search)) throw new Error('wikidata_candidate_response_invalid')
      for (const value of d.search) {
        if (!value || typeof value !== 'object') throw new Error('wikidata_candidate_response_invalid')
        const h = value as { id?: unknown; label?: unknown; match?: { text?: unknown } }
        if (typeof h.id !== 'string' || !/^Q[1-9]\d*$/.test(h.id)) throw new Error('wikidata_candidate_response_invalid')
        const names = [h.label, h.match?.text].filter((x): x is string => typeof x === 'string').map(key)
        if (!names.length) throw new Error('wikidata_candidate_response_invalid')
        if (typeof h.label === 'string' && [original, key(input.base)].includes(key(h.label))) exactLabels.add(h.id)
        if (names.includes(original) && original !== key(input.base)) literal.add(h.id)
        // "Genova, Italy" is how Wikidata spells the endonym of Genoa. The head
        // before the comma only admits the candidate; class, country and
        // coordinates still decide.
        const heads = [h.label, h.match?.text].filter((x): x is string => typeof x === 'string' && x.includes(',')).map(x => key(x.split(',')[0]))
        if ([...names, ...heads].some(n => n === key(input.base) || n === original)) seen.add(h.id)
      }
    }
    const qids = [...seen].filter(q => !literal.size || literal.has(q))
    const languages = [...new Set([...CITY_NAME_LANGS, ...(input.languages ?? [])])].join('|')
    const loaded: Record<string, Entity> = {}
    for (let i = 0; i < qids.length; i += 50) Object.assign(loaded, await entities(qids.slice(i, i + 50), 'claims|sitelinks|labels|aliases', languages, ['enwiki', ...CITY_NAME_SITES].join('|')))
    await warm(qids.flatMap(q => ids(loaded[q].claims ?? {}, 'P31')), classes, 'labels', e => e.labels?.en?.value ?? '')
    await warm(qids.flatMap(q => ids(loaded[q].claims ?? {}, 'P17')), countries, 'claims', (e, qid) => {
      countryEntities.set(qid, e)
      const value = bestStatement(currentStatements(e.claims?.P297))?.mainsnak?.datavalue?.value
      return typeof value === 'string' && /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : ''
    })
    const declarations = [...countryEntities].flatMap(([countryQid, entity]) => {
      if (countries.get(countryQid)) return []
      const target = countryCorrectionTarget(entity.claims ?? {})
      return target && target.qid !== countryQid ? [{ countryQid, ...target }] : []
    })
    const missingTargets = [...new Set(declarations.map(d => d.qid))].filter(q => !correctionEntities.has(q))
    for (let i = 0; i < missingTargets.length; i += 50) {
      const chunk = missingTargets.slice(i, i + 50)
      const fetched = await entities(chunk, 'claims')
      for (const q of chunk) correctionEntities.set(q, fetched[q])
    }
    for (const d of declarations) {
      const code = correctedCountryCode(correctionEntities.get(d.qid)?.claims ?? {})
      if (code !== d.code) continue
      countries.set(d.countryQid, code)
      corrections.set(d.countryQid, { countryQid: d.countryQid, intendedSubjectQid: d.qid, code })
    }
    for (const qid of qids) {
      const ent = loaded[qid]
      if ('missing' in ent) continue
      const claims = ent.claims ?? {}
      const p31 = ids(claims, 'P31')
      const cls = cityClassVerdict(p31.map(q => classes.get(q) || '(class has no English label)'))
      const point = bestStatement(claims.P625)?.mainsnak?.datavalue?.value as { latitude?: number; longitude?: number; globe?: string } | undefined
      const valid = (lat: unknown, lon: unknown) => typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=90 && Math.abs(lon)<=180 && !(lat===0 && lon===0)
      const rowValid = valid(input.latitude, input.longitude)
      const pointValid = valid(point?.latitude, point?.longitude) && (!point?.globe || point.globe.endsWith('/Q2'))
      const geo = cityCoordVerdict(rowValid ? input.latitude : null, rowValid ? input.longitude : null, pointValid ? point!.latitude : null, pointValid ? point!.longitude : null)
      const countryIds = ids(claims, 'P17')
      const countryCorrections = countryIds.flatMap(q => corrections.has(q) ? [corrections.get(q)!] : [])
      const codes = countryIds.map(q => countries.get(q)).filter((x): x is string => !!x)
      const expected = input.countryCode?.toUpperCase()
      const country = countryCorrections.length && expected
        ? codes.some(code => !equivalent(expected, code)) ? 'disagree' : codes.length !== countryIds.length ? 'unknown' : 'agree'
        : !expected || !codes.length ? 'unknown' : codes.some(code => equivalent(expected, code)) ? 'agree' : 'disagree'
      probes.push({ ...(countryCorrections.length ? { countryCorrections } : {}), qid, class: cls.verdict, country, coordinates: geo.verdict, distanceKm: geo.distanceKm, exactLabel: exactLabels.has(qid) })
      // A nearby island/country/region with the literal name can also be an
      // alias of a city inside it. Proximity does not establish equal scope.
      if (exactLabels.has(qid) && cls.verdict === 'refused' && country !== 'disagree' && geo.verdict === 'agree' &&
        p31.some(q => /\b(island|archipelago|sovereign state|country|region|province|state of the united states)\b/i.test(classes.get(q) ?? ''))) geographicScopeConflict = true
      if ((cls.verdict === 'settlement' || cls.verdict === 'locality') && country !== 'disagree' && geo.verdict !== 'disagree' && (country === 'unknown' || geo.verdict === 'unchecked')) incomplete = true
    }
    const adopt = (kind: 'selected' | 'locality', qid: string): CitySearchMatch => {
      const ent = loaded[qid]
      const claims = ent.claims ?? {}
      return { kind, qid, probes, entity: { claims, enwikiTitle: ent.sitelinks?.enwiki?.title, names: parseCityNames(claims, ent.labels, ent.aliases, ent.sitelinks), labels: ent.labels } }
    }
    const viable = probes.filter(p => p.class === 'settlement' && p.country === 'agree' && p.coordinates === 'agree')
    if (viable.length > 1) return { kind: 'ambiguous', qid: null, probes }
    // Missing corroboration on another exact namesake cannot silently favor
    // whichever candidate happened to have complete metadata.
    // The scope guard stops a city that merely carries the wider place's name as
    // an alias. A city whose own label is the name (London beside the London
    // region) is not that case.
    if (incomplete) return { kind: 'unresolved', qid: null, probes, blockedBy: 'incomplete' }
    if (geographicScopeConflict && viable.some(p => !exactLabels.has(p.qid))) return { kind: 'unresolved', qid: null, probes, blockedBy: 'scope' }
    if (viable.length === 1) return adopt('selected', viable[0].qid)
    const localities = probes.filter(p => p.class === 'locality' && p.country === 'agree' && p.coordinates === 'agree')
    if (localities.length === 1) return adopt('locality', localities[0].qid)
    return { kind: localities.length > 1 ? 'ambiguous' : 'no_match', qid: null, probes }
  }
}
