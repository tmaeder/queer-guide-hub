/**
 * The member's Body & about sizes as marketplace size slugs (the bare values
 * marketplace_listing_variants.option_size uses: s, m, 2xl, eu-43, …).
 */
export interface StoredSizes {
  size_top?: string | null;
  size_underwear?: string | null;
  size_bottom?: string | null;
  size_shoe?: string | null;
}

const LETTER: Record<string, string> = {
  XS: 'xs',
  S: 's',
  M: 'm',
  L: 'l',
  XL: 'xl',
  XXL: '2xl',
  '3XL': '3xl',
};

/** "EU 43", "eu43", "43" → "eu-43"; anything else is not a size we can match. */
function euSize(value: string | null | undefined): string | null {
  const m = value?.trim().match(/^(?:eu\s*-?\s*)?(\d{2})(?:\.5)?$/i);
  return m ? `eu-${m[1]}` : null;
}

export function mySizeSlugs(s: StoredSizes | null | undefined): string[] {
  if (!s) return [];
  const out = new Set<string>();
  for (const letter of [s.size_top, s.size_underwear]) {
    const slug = letter ? LETTER[letter.toUpperCase()] : undefined;
    if (slug) out.add(slug);
  }
  for (const v of [s.size_shoe, s.size_bottom]) {
    const slug = euSize(v);
    if (slug) out.add(slug);
  }
  return [...out];
}

/** "My sizes" as a filter toggle over `size-<slug>` tokens. `mine` must already
 *  be limited to sizes the current department stocks. */
export function mySizesToggle(attributeTags: string[], mine: string[]) {
  const tokens = mine.map((slug) => `size-${slug}`);
  const on = tokens.length > 0 && tokens.every((t) => attributeTags.includes(t));
  const next = on
    ? attributeTags.filter((t) => !tokens.includes(t))
    : [...attributeTags, ...tokens.filter((t) => !attributeTags.includes(t))];
  return { on, next };
}
