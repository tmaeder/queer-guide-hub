/**
 * TRANSITIONAL display-level fallback for personality professions.
 *
 * DO NOT ADD ENTRIES HERE. Add German aliases to `professions.aliases` instead
 * (admin-editable in the CMS, or a migration in the shape of
 * 20260916100100_profession_vocabulary_german.sql). That one place also fixes
 * search, the People-page facet matview and the write gate; this file fixes only
 * what a component happens to render.
 *
 * History: the Wikipedia import left ~1,300 personalities with raw German
 * occupation strings, and this map translated them at render time because
 * "normalizing the column would fire the search_documents trigger per row". That
 * rationale expired when 20260816090100 cut the search sync over to ENQUEUEING
 * rather than indexing inline, and the column was normalized in 2026-09
 * (20260916100000..100300). Left in place as a safety net for two cases the DB
 * cannot cover: the batched backfill window, where both spellings coexist, and
 * the deliberate `fallback` tier, which passes an unmatched value through as-is.
 *
 * DELETE THIS FILE when `select count(*) from profession_review_queue` is 0 and
 * trg_personalities_aa_profession_gate is live.
 */
const GERMAN_PROFESSIONS: Record<string, string> = {
  politiker: 'Politician',
  schauspieler: 'Actor',
  schriftsteller: 'Writer',
  aktivist: 'Activist',
  sportler: 'Athlete',
  sänger: 'Singer',
  autor: 'Author',
  modedesigner: 'Fashion designer',
  regisseur: 'Director',
  darsteller: 'Performer',
  maler: 'Painter',
  komiker: 'Comedian',
  musiker: 'Musician',
  dragqueen: 'Drag queen',
  moderator: 'TV host',
  journalist: 'Journalist',
  tänzer: 'Dancer',
  fotograf: 'Photographer',
  künstler: 'Artist',
  unternehmer: 'Entrepreneur',
  anwalt: 'Lawyer',
  komponist: 'Composer',
  dichter: 'Poet',
};

export function formatProfession(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Strip the German gender suffix ("Politiker/in", "Politiker/-in", "Politikerin")
  const base = trimmed
    .toLowerCase()
    .replace(/\/-?in(nen)?$/u, '')
    .replace(/\*in(nen)?$/u, '');
  const direct = GERMAN_PROFESSIONS[base];
  if (direct) return direct;
  // Fused feminine form ("Politikerin" → "politiker"); only when the stem is known.
  if (base.endsWith('in')) {
    const stem = GERMAN_PROFESSIONS[base.slice(0, -2)];
    if (stem) return stem;
  }
  return trimmed;
}
