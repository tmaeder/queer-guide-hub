export function startOfLocalDayISO(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  return copy.toISOString();
}

export function endOfLocalDayISO(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return copy.toISOString();
}

export function normalizeCityLabel(city: string): string {
  return city
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function dedupeCitiesByNormalized(cities: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of cities) {
    if (!raw) continue;
    const key = normalizeCityLabel(raw);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, raw);
      continue;
    }
    const existingHasDiacritics = existing !== existing.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const rawHasDiacritics = raw !== raw.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    if (rawHasDiacritics && !existingHasDiacritics) {
      byKey.set(key, raw);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}
