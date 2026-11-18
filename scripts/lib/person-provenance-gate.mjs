/** The deployed release gate owns provenance policy; the legacy metric predates source links. */
export function applyCanonicalPersonGate(legacy, canonical) {
  if (!Array.isArray(legacy) || !Array.isArray(canonical)) throw new Error('Gate report is not an array')
  const oldRows = legacy.filter(row => row.gate === 'person_outing_guard')
  const currentRows = canonical.filter(row => row.gate === 'person_outing_guard')
  if (oldRows.length !== 1 || currentRows.length !== 1) throw new Error('Person provenance gate is missing or duplicated')
  const current = currentRows[0]
  if (oldRows[0].severity !== 'critical' || current.severity !== 'critical' ||
      !Number.isSafeInteger(current.failures) || current.failures < 0) {
    throw new Error('Person provenance gate did not return a valid critical count')
  }
  return legacy.map(row => row.gate === 'person_outing_guard'
    ? { ...row, failing: current.failures } : row)
}
