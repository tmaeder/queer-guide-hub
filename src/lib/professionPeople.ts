/**
 * Local search and filters for a profession's people list. /professions/Drag%20queen
 * rendered 447 portrait cards in one unbounded grid; these narrow it client-side
 * over the rows the page already fetched (no new query).
 */
export interface ProfessionPerson {
  id: string;
  name?: string | null;
  nationality?: string | null;
  birth_date?: string | null;
}

export type BirthEra = 'pre1900' | '1900s' | '1950s' | '1980s';

/** Coarse birth eras; boundaries are inclusive lower bounds. */
export const BIRTH_ERAS: ReadonlyArray<{ id: BirthEra; from: number; to: number }> = [
  { id: 'pre1900', from: -Infinity, to: 1899 },
  { id: '1900s', from: 1900, to: 1949 },
  { id: '1950s', from: 1950, to: 1979 },
  { id: '1980s', from: 1980, to: Infinity },
];

export function birthEra(birthDate: string | null | undefined): BirthEra | null {
  const m = birthDate?.match(/^(-?\d{1,4})/);
  if (!m) return null;
  const y = Number(m[1]);
  return BIRTH_ERAS.find((e) => y >= e.from && y <= e.to)?.id ?? null;
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export interface ProfessionFilters {
  query?: string;
  nationality?: string | null;
  era?: BirthEra | null;
}

export function filterProfessionPeople<T extends ProfessionPerson>(
  people: readonly T[],
  { query, nationality, era }: ProfessionFilters,
): T[] {
  const q = query?.trim() ? fold(query.trim()) : null;
  return people.filter(
    (p) =>
      (!q || fold(p.name ?? '').includes(q)) &&
      (!nationality || p.nationality === nationality) &&
      (!era || birthEra(p.birth_date) === era),
  );
}

/** Filter options that actually occur, most common first; empty when not worth a control. */
export function nationalityOptions(people: readonly ProfessionPerson[]): string[] {
  const counts = new Map<string, number>();
  for (const p of people) {
    if (p.nationality) counts.set(p.nationality, (counts.get(p.nationality) ?? 0) + 1);
  }
  if (counts.size < 2) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([n]) => n);
}

export function eraOptions(people: readonly ProfessionPerson[]): BirthEra[] {
  const seen = new Set(people.map((p) => birthEra(p.birth_date)).filter(Boolean) as BirthEra[]);
  if (seen.size < 2) return [];
  return BIRTH_ERAS.map((e) => e.id).filter((id) => seen.has(id));
}
