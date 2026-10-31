/** Only explicit edition facts participate; absent facts never imply conflict. */
export interface BookIdentity {
  isbn: string | null
  volume: string | null
  format: string | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

/** Validate, then canonicalize ISBN-10 to ISBN-13. Ordinary product SKUs are ignored. */
export function canonicalIsbn(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const s = value.replace(/[\s-]/g, '').toUpperCase()
  if (/^97[89]\d{10}$/.test(s)) {
    const sum = [...s].reduce((n, x, i) => n + Number(x) * (i % 2 ? 3 : 1), 0)
    return sum % 10 === 0 ? s : null
  }
  if (!/^\d{9}[\dX]$/.test(s)) return null
  const sum = [...s].reduce((n, x, i) => n + (x === 'X' ? 10 : Number(x)) * (10 - i), 0)
  if (sum % 11 !== 0) return null
  const prefix = '978' + s.slice(0, 9)
  const check = (10 - [...prefix].reduce((n, x, i) => n + Number(x) * (i % 2 ? 3 : 1), 0) % 10) % 10
  return prefix + check
}

function volumeOf(title: string): string | null {
  const numbers: Record<string, string> = {
    one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
    seven: '7', eight: '8', nine: '9', ten: '10',
    i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
  }
  const token = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|viii|vii|iii|ii|iv|vi|ix|i|v|x)'
  const re = new RegExp('\\b(?:vol(?:ume)?s?\\.?|books?)\\s*' + token + '(?:\\s*(?:[-–—]|to)\\s*' + token + ')?\\b', 'gi')
  const volumes = new Set<string>()
  const number = (v: string) => numbers[v.toLowerCase()] ?? String(Number(v))
  for (const match of title.matchAll(re)) {
    volumes.add(number(match[1]) + (match[2] ? '-' + number(match[2]) : ''))
  }
  return volumes.size === 1 ? [...volumes][0] : null
}

/** Staging uses metadata; live listings use attributes. Force only for candidates
 * of an already-confirmed book, never for arbitrary marketplace products. */
export function bookIdentity(value: Record<string, unknown>, force = false): BookIdentity | null {
  const meta = { ...record(value.attributes), ...record(value.metadata) }
  const title = String(value.title ?? value.name ?? '')
  const isbn = [value.isbn, value.isbn13, meta.isbn, meta.isbn13, meta.isbn_13, meta.sku]
    .map(canonicalIsbn).find(Boolean) ?? null
  const category = String(meta.category ?? value.category ?? '').toLowerCase()
  if (!force && !isbn && !/\b(?:books?|paperback|hardback|hardcover|softcover|ebook|e-book)\b/.test(category)) return null
  const text = title + ' ' + category + ' ' + String(meta.binding ?? meta.format ?? '')
  const formats = new Set<string>()
  if (/\b(?:hardback|hardcover|hard cover)\b/i.test(text)) formats.add('hardcover')
  if (/\b(?:paperback|softback|softcover|soft cover)\b/i.test(text)) formats.add('paperback')
  if (/\b(?:ebook|e-book)\b/i.test(text)) formats.add('ebook')
  if (/\b(?:audiobook|audio book)\b/i.test(text)) formats.add('audiobook')
  return { isbn, volume: volumeOf(title), format: formats.size === 1 ? [...formats][0] : null }
}

export function conflictingBookEditions(a: BookIdentity, b: BookIdentity): boolean {
  return (['isbn', 'volume', 'format'] as const).some(key => !!a[key] && !!b[key] && a[key] !== b[key])
}
