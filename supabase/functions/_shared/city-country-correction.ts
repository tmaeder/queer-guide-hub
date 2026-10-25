import { currentStatements, type Claims, type Statement } from './wikidata-city.ts'

const qidOf = (v: unknown): string | null => {
  const id = (v as { id?: unknown } | undefined)?.id
  return typeof id === 'string' && /^Q[1-9]\d*$/.test(id) ? id : null
}
const codeOf = (s: Statement): string | null => {
  const v = s.mainsnak?.datavalue?.value
  return s.mainsnak?.snaktype === 'value' && typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null
}
function started(s: Statement): boolean {
  return (s.qualifiers?.P580 ?? []).every(snak => {
    const t = (snak.datavalue?.value as { time?: string } | undefined)?.time
    const date = typeof t === 'string' ? Date.parse(t.replace(/^\+/, '')) : NaN
    return snak.snaktype === 'value' && Number.isFinite(date) && date <= Date.now()
  })
}
/** Follow only an explicit wrong-subject correction, never arbitrary ancestors.
 * P8327 documents the intended subject of a deprecated statement. The old ISO
 * literal is corroboration only; the target must independently carry it today.
 */
export function countryCorrectionTarget(claims: Claims): { qid: string; code: string } | null {
  if (currentStatements(claims.P297).length) return null
  const deprecated = (claims.P297 ?? []).filter(s => s.rank === 'deprecated')
  if (!deprecated.length) return null
  const declarations = deprecated.map(s => {
    const targets = s.qualifiers?.P8327 ?? []
    const qid = targets.length === 1 && targets[0].snaktype === 'value' ? qidOf(targets[0].datavalue?.value) : null
    const code = codeOf(s)
    return qid && code ? { qid, code } : null
  })
  if (declarations.some(d => !d)) return null
  const unique = new Map(declarations.map(d => [JSON.stringify(d), d!]))
  if (unique.size !== 1) return null
  const target = [...unique.values()][0]
  const memberships = [...currentStatements(claims.P17), ...currentStatements(claims.P131)].filter(started)
  const parents = new Set(memberships.map(s => qidOf(s.mainsnak?.datavalue?.value)).filter(Boolean))
  return parents.size === 1 && parents.has(target.qid) ? target : null
}
export function correctedCountryCode(claims: Claims): string | null {
  const statements = currentStatements(claims.P297)
  if (!statements.length || statements.some(s => !started(s) || Object.keys(s.qualifiers ?? {}).some(p => !['P580', 'P582'].includes(p)))) return null
  const codes = statements.map(codeOf)
  return codes.every(Boolean) && new Set(codes).size === 1 ? codes[0] : null
}
