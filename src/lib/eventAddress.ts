/**
 * One readable address line for an event's venue.
 *
 * Imported addresses already carry the venue name and the city
 * ("KitKatClub, Köpenicker Str. 76, 10179 Berlin"), and the page then appended
 * the venue name and the city again, so PiepShow read "Berlin" three times.
 * Each part is kept once, in order; a later part already contained in what is
 * written is dropped.
 */
const norm = (v: string) =>
  v
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function containsWords(haystack: string, needle: string): boolean {
  const h = ` ${norm(haystack)} `;
  const n = norm(needle);
  return n.length > 0 && h.includes(` ${n} `);
}

export function eventAddressLine(parts: {
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string | null {
  let address = parts.address?.trim() ?? '';
  const venue = parts.venueName?.trim();
  // "KitKatClub, Köpenicker Str. 76" -> "Köpenicker Str. 76": the venue name is shown beside it.
  if (venue && address) {
    const [head, ...rest] = address.split(',');
    if (rest.length > 0 && norm(head) === norm(venue)) address = rest.join(',').trim();
  }
  const out: string[] = address ? [address] : [];
  for (const part of [parts.city, parts.region, parts.country]) {
    const value = part?.trim();
    if (!value) continue;
    if (out.some((written) => containsWords(written, value))) continue;
    out.push(value);
  }
  return out.length ? out.join(', ') : null;
}
