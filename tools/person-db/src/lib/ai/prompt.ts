import type { AiFinding, Severity } from './types'

// Shared, provider-neutral instructions. Both Claude and OpenAI get the same
// system prompt + the same person JSON, so results are comparable across tools.

export const SYSTEM_PROMPT = [
  'Du bist Faktenprüfer für eine öffentliche LGBTQ+ Personendatenbank (queer.guide).',
  'Prüfe die Angaben einer Person auf: sachliche Fehler, innere Widersprüche',
  '(z. B. Todesdatum vor Geburtsdatum, „lebt" trotz Todesdatum), unklaren oder',
  'fehlenden LGBTQ+-Bezug, Lücken bei Pflichtangaben und mögliche Verwechslungen.',
  'Erfinde keine Fakten. Wenn du etwas nicht sicher weißt, kennzeichne es als Unsicherheit,',
  'statt zu raten. Antworte AUSSCHLIESSLICH mit JSON in genau diesem Schema:',
  '{"summary": string, "findings": [{"severity": "error"|"warn"|"info", "field": string|null, "message": string}]}',
  'severity: "error" = klarer Fehler/Widerspruch, "warn" = fragwürdig/zu prüfen, "info" = Hinweis/Lücke.',
  '"message" ist ein deutscher Satz. "field" nennt das betroffene Feld (z. B. "death_date") oder null.',
  'Wenn alles plausibel ist: leeres findings-Array und ein kurzes summary.',
].join(' ')

export function buildUserPrompt(person: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(person)) {
    if (v === '' || v == null) continue
    clean[k] = v
  }
  return (
    'Prüfe diese Person und liefere das JSON:\n\n' +
    JSON.stringify(clean, null, 2)
  )
}

// Providers return free-ish text; pull the JSON object out of it defensively
// (models sometimes wrap it in ```json fences or a sentence).
export function parseFindings(
  text: string,
  model: string
): { findings: AiFinding[]; summary?: string; raw: string } {
  const raw = text
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fence ? fence[1] : text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Antwort von ${model} war kein JSON: ${text.slice(0, 160)}`)
  }
  let obj: unknown
  try {
    obj = JSON.parse(candidate.slice(start, end + 1))
  } catch {
    throw new Error(`JSON von ${model} nicht lesbar: ${candidate.slice(0, 160)}`)
  }
  const o = obj as { summary?: unknown; findings?: unknown }
  const rawList = Array.isArray(o.findings) ? o.findings : []
  const findings: AiFinding[] = rawList.map((f) => {
    const r = f as { severity?: unknown; field?: unknown; message?: unknown }
    const sev = (['error', 'warn', 'info'] as Severity[]).includes(r.severity as Severity)
      ? (r.severity as Severity)
      : 'info'
    return {
      severity: sev,
      field: r.field ? String(r.field) : undefined,
      message: String(r.message ?? '').trim() || '(leerer Hinweis)',
    }
  })
  return {
    findings,
    summary: o.summary ? String(o.summary) : undefined,
    raw,
  }
}
