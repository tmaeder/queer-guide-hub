// Marketplace title translation — batch prompt.
//
// Translates German product titles (the ohmyfantasy catalog) to natural English
// for an English-language platform. Preserves brand names, model numbers, sizes,
// and measurements verbatim. Adult catalog — translate plainly, do not censor or
// editorialise. The original German is preserved by the caller in title_i18n.de.

export const MARKETPLACE_TRANSLATE_SYSTEM =
  `You are a German-to-English translator for an adult/sex-shop product catalog.

Translate EVERY German word in each title into natural English. This is mandatory.
Examples of words you MUST translate (never leave them in German):
  Slip→Briefs, Massagestab→Massage Wand, mit→with, ohne→without, und→and, für→for,
  Funktion→Function, Größe→Size, hohlem Tunnel→Hollow Tunnel, Penisring→Cock Ring,
  Handschellen→Handcuffs, Gleitgel→Lubricant, Strümpfe→Stockings, Kette→Chain,
  Liebeskugeln→Love Balls, Peitsche→Whip, Fessel→Restraint, Reizwäsche→Lingerie.

Keep UNCHANGED only: brand names (Oxballs, Calexotics, Durex, Mister B), model names
inside quotes (e.g. "Viper", "Chub 6"), numbers, and units (cm, mm, XXL).

Adult content — translate plainly and explicitly; never censor, soften, or comment.
If a title is already fully English, return it unchanged.

CRITICAL for valid JSON: the title string MUST NOT contain any double-quote (") char.
Replace every quotation mark (straight " or German „ “ ”) around model/product names
with a single quote ('). e.g. Ouvert-Set "Heavenly" -> Open Set 'Heavenly'.

Output JSON only — a JSON array, one object per item, same order:
[{"i": <index>, "t": "<fully English title, no double-quotes inside>"}]
No prose, no markdown.`

export interface TranslateItem {
  i: number
  title: string
}

export function buildMarketplaceTranslateUserPrompt(items: TranslateItem[]): string {
  const lines = items.map((it) => `#${it.i}: ${it.title}`)
  return `Translate these ${items.length} product titles to English. Return the JSON array only.\n\n${lines.join('\n')}`
}

/** Parse the model's JSON array defensively. Returns Map<index, englishTitle>. */
export function parseMarketplaceTranslate(content: string): Map<number, string> {
  const out = new Map<number, string>()
  let text = content.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return out
  let arr: unknown
  try {
    arr = JSON.parse(text.slice(start, end + 1))
  } catch {
    return out
  }
  if (!Array.isArray(arr)) return out
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue
    const i = Number((row as Record<string, unknown>).i)
    const t = String((row as Record<string, unknown>).t ?? '').trim()
    if (!Number.isFinite(i) || !t || t.length > 400) continue
    out.set(i, t)
  }
  return out
}
