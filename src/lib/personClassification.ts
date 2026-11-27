/**
 * One classification per idea on a person page. Imports stamp the same fact
 * into `profession`, `roles` and `fields` ("Activist" / "activist" /
 * "activism"), and the page rendered all three as separate badges.
 */

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, ' ');
}

/** Same word family: equal, one contains the other, or a shared stem ("activis-"). */
export function sameClassification(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const shorter = Math.min(x.length, y.length);
  let i = 0;
  while (i < shorter && x[i] === y[i]) i++;
  return i >= 5 && i >= shorter - 2;
}

/** Drop values already said by an earlier value (profession first). */
export function dedupeClassifications(
  primary: string | null | undefined,
  values: readonly string[],
): string[] {
  const kept: string[] = primary ? [primary] : [];
  const out: string[] = [];
  for (const v of values) {
    if (!v?.trim() || kept.some((k) => sameClassification(k, v))) continue;
    kept.push(v);
    out.push(v);
  }
  return out;
}

/** First comma token of a multi-valued `profession` — the profession page key. */
export function primaryProfession(profession: string | null | undefined): string | null {
  const first = profession?.split(',')[0]?.trim();
  return first || null;
}

/** "1951–2002", "b. 1984", or null. Years only: the sidebar carries full dates. */
export function lifespanYears(
  birth: string | null | undefined,
  death: string | null | undefined,
): { birth: string | null; death: string | null } {
  const year = (d?: string | null) =>
    d && /^-?\d{1,4}/.test(d) ? d.match(/^-?\d{1,4}/)![0] : null;
  return { birth: year(birth), death: year(death) };
}
