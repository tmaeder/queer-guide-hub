/** Shared with SQL merge_gap_fill: populated values win; objects fill per key.
 * Arrays are atomic, because combining assertions can introduce contradictions.
 */
export function isDataGap(value: unknown): boolean {
  return value === null || value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (typeof value === 'number' && !Number.isFinite(value)) ||
    (Array.isArray(value) && value.length === 0) ||
    (isObject(value) && Object.keys(value).length === 0)
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
const unsafe = new Set(['__proto__', 'constructor', 'prototype'])
export function fillDataGaps(existing: unknown, incoming: unknown): unknown {
  if (isObject(incoming) && (isObject(existing) || isDataGap(existing))) {
    const result = { ...(isObject(existing) ? existing : {}) }
    for (const [key, value] of Object.entries(incoming)) {
      if (unsafe.has(key)) continue
      const filled = fillDataGaps(result[key], value)
      if (!isDataGap(filled) || Object.hasOwn(result, key)) result[key] = filled
    }
    return isDataGap(result) ? existing : result
  }
  return isDataGap(existing) && !isDataGap(incoming) ? incoming : existing
}
