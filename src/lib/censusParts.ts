/**
 * The non-zero parts of a masthead count row. When every count is zero the
 * first part is kept, so the row still says something ("0 cities") and does
 * not collapse.
 */
export function censusParts(parts: ReadonlyArray<readonly [number, string]>): string[] {
  const nonZero = parts.filter(([n]) => n > 0).map(([, label]) => label);
  if (nonZero.length > 0) return nonZero;
  return parts.length > 0 ? [parts[0][1]] : [];
}

/** A count for the census row: a list that came back full is a floor ("12+"). */
export function censusCount(length: number, limit: number): number | string {
  return length >= limit ? `${limit}+` : length;
}
