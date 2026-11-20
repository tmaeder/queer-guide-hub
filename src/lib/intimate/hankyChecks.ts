/**
 * Consistency between the hanky colours you wear, the ones you look for, and
 * your Interests & boundaries checklist. Hints only: nothing is blocked.
 */
export type Pocket = 'left' | 'right' | 'both';

/** Hanky colour id → checklist items that mean the same thing. Only colours
 *  with an unambiguous counterpart are listed. */
export const HANKY_KINK_ITEMS: Record<string, string[]> = {
  black: ['intense-pain'],
  grey: ['rope-shibari', 'light-bondage', 'cuffs'],
  navy: ['anal-sex-pegging'],
  'light-blue': ['oral-sex'],
  red: ['anal-fisting', 'frontal-fisting'],
  yellow: ['watersports'],
  purple: ['needle-play'],
  white: ['mutual-masturbation'],
  pink: ['dildos'],
  fuchsia: ['spanking'],
  lavender: ['drag'],
  charcoal: ['latex-rubber'],
  gold: ['threesomes'],
  'olive-drab': ['uniforms'],
  'medium-blue': ['uniforms'],
  'robins-egg-blue': ['sixty-nine'],
  beige: ['rimming'],
  coral: ['foot-play'],
  leopard: ['tattoos-piercings'],
};

export interface HankyCheck {
  kind: 'same-pocket' | 'boundary';
  colorId: string;
  /** For same-pocket: the pocket to switch the wanted colour to. */
  fixSide?: Pocket;
  message: string;
}

const POCKET_ROLE: Record<Pocket, string> = {
  left: 'left (top / giving)',
  right: 'right (bottom / receiving)',
  both: 'both pockets',
};

/** The rating sides that matter for you, given where the colour is worn. */
function mySides(pocket: Pocket, wearer: 'me' | 'them'): string[] {
  const giving = wearer === 'me' ? pocket === 'left' : pocket === 'right';
  if (pocket === 'both') return ['giving', 'receiving', 'general', 'self'];
  return [giving ? 'giving' : 'receiving', 'general', 'self'];
}

export function hankyChecks(input: {
  worn: Record<string, Pocket>;
  wanted: Record<string, Pocket>;
  /** Colour id → label, e.g. "Red (Fisting)". */
  label: (colorId: string) => string;
  /** Your checklist rating for an item slug on a side, if any. */
  rating: (slug: string, side: string) => string | undefined;
  itemLabel: (slug: string) => string;
}): HankyCheck[] {
  const out: HankyCheck[] = [];
  const { worn, wanted, label, rating, itemLabel } = input;

  for (const [color, mine] of Object.entries(worn)) {
    const theirs = wanted[color];
    if (theirs && mine === theirs && mine !== 'both') {
      out.push({
        kind: 'same-pocket',
        colorId: color,
        fixSide: mine === 'left' ? 'right' : 'left',
        message: `You wear ${label(color)} ${POCKET_ROLE[mine]} and look for the same pocket. A match usually wears the other one.`,
      });
    }
  }

  const boundary = (color: string, pocket: Pocket, wearer: 'me' | 'them') => {
    for (const slug of HANKY_KINK_ITEMS[color] ?? []) {
      for (const side of mySides(pocket, wearer)) {
        const r = rating(slug, side);
        if (r === 'no' || r === 'hard_limit') {
          const what = r === 'hard_limit' ? 'a hard limit' : 'a no';
          const verb = wearer === 'me' ? 'You wear' : "You're looking for";
          out.push({
            kind: 'boundary',
            colorId: color,
            message: `${verb} ${label(color)}, but ${itemLabel(slug)} is ${what} in Interests & boundaries.`,
          });
          return;
        }
      }
    }
  };
  for (const [color, pocket] of Object.entries(worn)) boundary(color, pocket, 'me');
  for (const [color, pocket] of Object.entries(wanted)) boundary(color, pocket, 'them');
  return out;
}

/**
 * Which of another member's colours (variant id → pocket) match you: a colour
 * you look for in a compatible pocket, or one you wear in the opposite pocket
 * (your left meets their right). 'both' on either side always matches.
 */
export function hankyMatches(
  theirs: Record<string, Pocket> | undefined,
  wanted: Record<string, Pocket>,
  mine: Record<string, Pocket>,
): Set<string> {
  const out = new Set<string>();
  const opposite: Record<Pocket, Pocket> = { left: 'right', right: 'left', both: 'both' };
  for (const [variant, side] of Object.entries(theirs ?? {})) {
    const want = wanted[variant];
    const own = mine[variant];
    const fits = (a: Pocket, b: Pocket) => a === b || a === 'both' || b === 'both';
    if ((want && fits(side, want)) || (own && fits(side, opposite[own]))) out.add(variant);
  }
  return out;
}
