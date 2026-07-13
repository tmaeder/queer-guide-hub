/**
 * Display-level normalization for personality professions.
 *
 * The Wikipedia import left ~1,300 personalities with raw German occupation
 * strings ("Politiker/in", "Schauspieler/in"). Normalizing the column would
 * fire the search_documents trigger per row (disk-constrained DB), so the
 * translation happens at render time instead. Unknown values pass through
 * unchanged — this is a fixed vocabulary map, not a translator.
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
