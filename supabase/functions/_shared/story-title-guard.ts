/**
 * Guards for the AI writers on the /admin/feedback Stories board
 * (`feedback-story-titler` → proposed_title, `story-narrate` → brief_title).
 *
 * Why this exists (2026-08-01): every open story on the board was titled from
 * an empty prompt. The titler built its corpus from `data->>'title'`, which is
 * NULL on every `github-actions` api_error row — the real text lives in
 * `data->>'message'`. So the model received a numbered list with nothing in it
 * and free-associated off the one thing left in its context: the system
 * prompt's "LGBTQ+ travel platform" framing. Four CI run-failure alerts became
 * a story called "LGBTQ Safety Concerns"; nine Dependabot alerts became
 * "Safety concerns abroad". On a platform where operators triage real safety
 * reports, an invented safety headline is not cosmetic — it buries genuine
 * reports under fake incidents.
 *
 * Three defences, in order of load-bearing-ness:
 *   1. `submissionText`     — never build a corpus from one field; fall back
 *                             through the fields these rows actually use.
 *   2. `hasEnoughSignal`    — never call the model with an empty/near-empty
 *                             corpus. This is what actually caused the bug.
 *   3. `ungroundedSensitiveConcepts` — reject a draft that introduces
 *                             safety/identity vocabulary the source material
 *                             never mentions. Prompt wording alone is not a
 *                             control; this one is deterministic.
 *
 * Pure functions, no Deno/network deps — unit-tested in
 * `supabase/functions/_tests/story-title-guard.test.ts`.
 */

/** Minimum characters of real source text before we let a model title a cluster. */
export const MIN_CORPUS_CHARS = 12;

/**
 * Machine-generated infrastructure alerts. These reach `community_submissions`
 * as `content_type='api_error'` via github-webhook / sync-supabase-advisors and
 * belong on the API Errors board, never on the human Stories board.
 */
const MACHINE_ALERT_PATTERNS: RegExp[] = [
  /^\s*(run|workflow|job|build|deploy)\s+failure\s*:/i,
  /^\s*advisor\s*:/i,
  /^\s*\[?dependabot\]?\b/i,
  /^\s*npm_and_yarn\b/i,
];

/**
 * Vocabulary that must never appear in a generated title unless the source
 * material actually contains it. Grouped by concept so a source saying "queer"
 * legitimately grounds a draft saying "LGBTQ+" — the grouping keeps the guard
 * from rejecting honest paraphrase while still catching invention.
 */
const SENSITIVE_CONCEPTS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  {
    id: 'safety',
    pattern: /\b(safe|safety|safer|safely|unsafe|danger|dangerous|risk|risks|risky|threat|threats|threatening)\b/i,
  },
  {
    id: 'violence',
    pattern: /\b(violence|violent|attack|attacks|attacked|assault|assaulted|abuse|abusive|harm|harmful|hate|hateful)\b/i,
  },
  {
    id: 'discrimination',
    pattern: /\b(discriminat\w*|harass\w*|homophob\w*|transphob\w*|biphob\w*|queerphob\w*|slur|slurs|prejudice)\b/i,
  },
  {
    id: 'identity',
    pattern: /\b(lgbt\w*|queer|gay|lesbian|bisexual|trans|transgender|nonbinary|non-binary|intersex|pride|outing|outed|closeted)\b/i,
  },
  {
    id: 'legal',
    pattern: /\b(illegal|criminal\w*|criminalis\w*|criminaliz\w*|arrest\w*|persecut\w*|deport\w*|asylum|prosecut\w*)\b/i,
  },
  {
    id: 'crisis',
    pattern: /\b(crisis|emergency|suicid\w*|self-harm|traumat\w*)\b/i,
  },
];

/** True when a submission's text reads as a machine alert rather than user feedback. */
export function isMachineAlertText(text: string | null | undefined): boolean {
  if (!text) return false;
  return MACHINE_ALERT_PATTERNS.some((re) => re.test(text));
}

/**
 * The human-readable text of a submission, whatever shape it arrived in.
 * Feedback rows carry `title`; api_error rows carry `message` (and their
 * `title` is NULL) — reading only `title` is what emptied the corpus.
 */
export function submissionText(data: Record<string, unknown> | null | undefined): string {
  const d = data ?? {};
  for (const key of ['title', 'message', 'description'] as const) {
    const v = d[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

/**
 * Whether a corpus carries enough real text to title. An empty or near-empty
 * list makes the model invent a theme from its system prompt — always refuse
 * rather than letting it guess.
 */
export function hasEnoughSignal(texts: string[]): boolean {
  const joined = texts.filter((t) => t.trim() !== '').join(' ').trim();
  return joined.length >= MIN_CORPUS_CHARS;
}

/**
 * Sensitive concepts the draft asserts that the source never mentions.
 * Non-empty means the draft is ungrounded and must be discarded.
 */
export function ungroundedSensitiveConcepts(draft: string, sourceTexts: string[]): string[] {
  const corpus = sourceTexts.join('\n');
  return SENSITIVE_CONCEPTS.filter((c) => c.pattern.test(draft) && !c.pattern.test(corpus)).map(
    (c) => c.id,
  );
}
