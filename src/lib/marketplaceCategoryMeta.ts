/**
 * Icon + one-line description for the TOY categories.
 *
 * WHY THIS IS A SEPARATE FILE FROM `marketplaceTaxonomy.ts`. That module is
 * the SQL mirror — every map in it has a twin in the classifier migration and
 * a drift test watching the pair. Nothing here has a SQL twin: a blurb and a
 * glyph are presentation, they are edited on a different cadence, and folding
 * them in would make the mirror file's "keep the two in sync" instruction
 * untrue of half its contents.
 *
 * BLURBS ARE SCOPED TO THE TWO ADULT DEPARTMENTS, not all 40 groups. Every
 * tile still gets an ICON — `groupIcon()` below falls back to the department
 * mark — but the toy-specific glyphs stay in `TOY_GROUP_META`.
 * `/marketplace/categories` renders group tiles SECTIONED BY DEPARTMENT, so a
 * section is internally consistent either way, and widening to the whole
 * catalogue forces collisions the set cannot resolve: `gear-fetish` is a boot
 * (that group's fine buckets are latex/leather/rubber/uniforms, i.e. garment
 * material) and an `apparel/footwear` tile one section down wants the same
 * boot. A group with no entry renders exactly as it does today — text and a
 * count — so this map is additive and never leaves a hole.
 *
 * VOICE. Direct and factual, per the copy rules: no discover/explore/unlock/
 * curated/journey, no "vibrant", no consent boilerplate padding (the tag prose
 * judge was retired for generating exactly that), and no gendered framing —
 * "for women" / "for men" is the audience-label class this codebase has
 * repeatedly repaired OUT of the glossary, and a category blurb is the last
 * place to reintroduce it. Where a material or safety fact is load-bearing it
 * is stated plainly rather than hedged.
 */

import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { departmentGlyph } from '@/components/marketplace/departmentPlate';

export interface CategoryMeta {
  icon: TransitIconName;
  /** One line. Rendered in a ~116px tile, so keep it under ~110 characters. */
  blurb: string;
}

/**
 * Group tiles for the `intimacy` and `bdsm_fetish` departments.
 * Keys are `subcategory_group` slugs — the v3 classifier's vocabulary.
 */
export const TOY_GROUP_META: Record<string, CategoryMeta> = {
  // ── intimacy ──────────────────────────────────────────────────────────────
  sex_toys: {
    icon: 'intimacy',
    blurb:
      'The general bucket: strap-ons, packers, nipple and urethral play, kegel sets, machines.',
  },
  dildos: {
    icon: 'toy-dildo',
    blurb:
      'Insertable toys without a motor, from realistic casts to fantasy shapes and double-ended.',
  },
  anal_toys: {
    icon: 'toy-plug',
    blurb:
      'Plugs, beads, prostate massagers and dilators. A flared base is what keeps a toy retrievable.',
  },
  masturbators: {
    icon: 'toy-stroker',
    blurb:
      'Sleeves and strokers, open- or closed-ended, including moulded casts and automated units.',
  },
  vibrators: {
    icon: 'toy-vibrator',
    blurb: 'Motorised toys: wands, rabbits, bullets, eggs, air-pulse, and app-controlled models.',
  },
  cock_rings: {
    icon: 'toy-cockring',
    blurb: 'Rings, straps, stretchers and sleeves worn on the shaft or scrotum.',
  },
  chastity: {
    icon: 'toy-chastity',
    blurb: 'Cages, belts and retaining rings for consensual orgasm and access control.',
  },
  pumps: {
    icon: 'toy-pump',
    blurb: 'Vacuum cylinders for the penis, clitoris or nipples. Effects are temporary swelling.',
  },
  lubes: {
    icon: 'toy-lube',
    blurb:
      'Water-, silicone- and oil-based lubricant. Silicone degrades silicone toys; oil degrades latex.',
  },
  poppers: {
    icon: 'toy-poppers',
    blurb:
      'Alkyl nitrite inhalants. Never combine with erectile-dysfunction drugs — the drop in blood pressure is the risk.',
  },
  safer_sex: {
    icon: 'toy-condom',
    blurb: 'Condoms, dams, gloves and toy cleaner. The barrier layer, plus what keeps toys usable.',
  },

  // ── bdsm_fetish ───────────────────────────────────────────────────────────
  fetish_gear: {
    icon: 'gear-fetish',
    blurb: 'Garments by material: latex, leather, rubber and neoprene, and uniform wear.',
  },
  bondage: {
    icon: 'handcuffs',
    blurb: 'Rope, cuffs, restraints, spreader bars, and slings or furniture that take body weight.',
  },
  impact_play: {
    icon: 'paddle',
    blurb: 'Paddles, floggers, canes and crops, plus the sensation tools that sit alongside them.',
  },
  harnesses: {
    icon: 'gear-harness',
    blurb:
      'Strap-on harnesses and body harnesses. Fit and O-ring size decide what a harness will hold.',
  },
  collars: {
    icon: 'collar',
    blurb: 'Collars and leads, from day collars worn in public to locking play collars.',
  },
  gags: {
    icon: 'gear-gag',
    blurb:
      'Ball, bit and open-mouth gags. Speech is lost, so a non-verbal signal replaces the safeword.',
  },
  hoods_masks: {
    icon: 'gear-hood',
    blurb: 'Hoods, masks and blindfolds, open- or closed-face, in leather, latex and neoprene.',
  },
  pup_play: {
    icon: 'gear-pup',
    blurb: 'Pup, pony and kitten gear: hoods, mitts, tails, knee pads and harnesses.',
  },
};

/**
 * Fine-tier descriptions. The fine tier renders as FilterChips, which have no
 * room for a glyph — so this is text only, and the chips stay as they are.
 * Shown on the category page as a line under the active chip.
 */
export const TOY_FINE_BLURBS: Record<string, string> = {
  // sex_toys
  strap_ons: 'Harness-worn dildos, including harness-and-toy sets sold together.',
  packers_stp:
    'Soft packers for shape, and stand-to-pee devices. Gender-affirming gear, not sex toys by default.',
  nipple_play: 'Clamps, suckers and weights. Clamps hurt most coming OFF, as blood returns.',
  estim:
    'Electro-stimulation units and pads. Never route current across the chest, and never above the waist with a pacemaker.',
  sounding:
    'Urethral sounds and plugs. Sterile technique and dedicated lubricant are the whole safety story here.',
  kegel:
    'Weighted balls and trainers for pelvic-floor strength. Also sold as Ben Wa or jiggle balls.',
  sex_machines: 'Powered thrusting machines and drill attachments with a mount.',
  dolls: 'Full-body and torso dolls in TPE or silicone.',
  tongue_oral: 'Tongue-shaped and licking toys, plus oral simulators.',
  couples_dp: 'Toys built for two people at once, and double-penetration sets.',

  // anal_toys
  butt_plugs:
    'Plugs of every size, including inflatable, vibrating and jewelled. The flared base is not optional.',
  anal_beads: 'Graduated beads on a cord or stem, with a retrieval ring at the end.',
  prostate: 'Angled massagers that reach the prostate, usually with a perineum arm.',
  dilators: 'Graduated sets for training and comfort, sold as dilators or training kits.',
  anal_hooks:
    'Curved steel hooks, usually tied off as part of a bondage position rather than used alone.',

  // dildos
  fantasy_dildos:
    'Non-human shapes — knots, tentacles, ovipositors — mostly from independent makers.',
  realistic_dildos: 'Anatomical casts, often with a suction base.',
  double_dildos: 'Double-ended shafts for sharing, or for front-and-back use by one person.',

  // vibrators
  wands: 'Large-motor massagers, mains or rechargeable, with attachment heads.',
  rabbits: 'Dual-action: an internal shaft plus an external clitoral arm.',
  egg_vibrators: 'Egg and bullet-on-a-cord shapes, usually remote or app driven.',
  bullets: 'Small single-motor vibrators for pinpoint external use.',
  air_pulse:
    'Pressure-wave and suction stimulators. They do not touch the clitoris directly, which is why they feel different to a vibrator.',
  thrusting: 'Motorised in-and-out motion rather than vibration alone.',
  g_spot: 'Curved shafts angled at the front vaginal wall.',
  clit_stimulators: 'External clitoral vibrators, including butterfly and wearable shapes.',
  wearable_vibes: 'Panty vibrators and couples rings designed to stay on hands-free.',
  app_controlled: 'Bluetooth and long-distance control. Check what the app uploads before pairing.',

  // cock_rings
  penis_sleeves: 'Sleeves, sheaths and girth extenders worn over the shaft.',

  // chastity / pumps / lubes / poppers / safer_sex
  douching_enemas:
    'Bulbs, shower attachments and nozzles for anal rinsing. Plain warm water only; frequent douching irritates the lining.',

  // impact_play
  cbt: 'Genital impact and pressure gear — humblers, parachutes, crushers.',

  // bondage
  rope: 'Jute, hemp, cotton and synthetic rope, plus shibari kits and safety shears.',
  cuffs_restraints: 'Wrist and ankle cuffs, under-bed systems and straps.',
  spreader_bars: 'Rigid bars that hold ankles or wrists apart.',
  slings_furniture:
    'Slings, swings, benches and frames. Load rating and mounting are the things to check.',

  // fetish_gear
  latex:
    'Latex garments and sheeting. Oil-based lubricant destroys latex; silicone shine is the usual dressing aid.',
  leather: 'Leather harnesses, garments and accessories.',
  rubber_neoprene: 'Rubber, neoprene and wet-look garments.',
  uniforms: 'Uniform and workwear fetish garments.',

  // grooming (hygiene department, but reached from the toy glossary)
  aphrodisiacs:
    'Libido and arousal supplements. Claims here are largely unproven, and some interact with prescription medication.',
  edible_massage: 'Edible body products, massage candles and body paint.',
};

/** Icon + blurb for a group tile, or null when the group has no entry. */
export function toyGroupMeta(slug: string | null | undefined): CategoryMeta | null {
  return (slug && TOY_GROUP_META[slug]) || null;
}

/** Blurb for a fine chip, or null. */
export function toyFineBlurb(slug: string | null | undefined): string | null {
  return (slug && TOY_FINE_BLURBS[slug]) || null;
}

/**
 * Marks for the NON-adult groups that have a better glyph than their
 * department's. Everything else falls back to the department mark — so every
 * tile on `/marketplace/categories` carries an icon, and a group with no
 * distinct glyph reads as "a stop on the Apparel line" rather than borrowing a
 * mark that means something else. `footwear` deliberately stays on `apparel`
 * rather than `gear-fetish` (that boot is the fetish-garment mark; see the
 * scope note above).
 */
export const GROUP_ICONS: Record<string, TransitIconName> = {
  books: 'library',
  art: 'gallery',
  film: 'theater',
  calendars: 'events',
  home_goods: 'homeware',
  grooming: 'selfcare',
};

/**
 * Icon for a group tile: the toy mark, then a group override, then the
 * department's own mark. Total — an unrouted group (no department) gets `shop`.
 */
export function groupIcon(
  slug: string | null | undefined,
  department: string | null | undefined,
): TransitIconName {
  return toyGroupMeta(slug)?.icon ?? GROUP_ICONS[slug ?? ''] ?? departmentGlyph(department);
}

/**
 * Marks for FINE buckets that have a closer glyph than their group's. Anything
 * absent inherits its group's mark via `fineIcon()`, so every subcategory chip
 * carries one. Only reuse a glyph whose `use` line genuinely covers the thing:
 * a near-miss mark reads as a different category.
 */
export const FINE_ICONS: Record<string, TransitIconName> = {
  // apparel / underwear
  hats: 'apparel',
  flags: 'pride',
  pins_badges: 'pride',
  patches_stickers: 'pride',
  binders: 'trans-pride',
  packing_underwear: 'trans-pride',
  // books_art
  photography: 'gallery',
  prints_posters: 'gallery',
  cards_stationery: 'documents',
  // grooming
  shave_beard: 'salon',
  edible_massage: 'intimacy',
  aphrodisiacs: 'intimacy',
  // toys
  strap_ons: 'gear-harness',
  packers_stp: 'trans-pride',
  butt_plugs: 'toy-plug',
  dilators: 'toy-plug',
  realistic_dildos: 'toy-dildo',
  fantasy_dildos: 'toy-dildo',
  double_dildos: 'toy-dildo',
  penis_sleeves: 'toy-cockring',
  douching_enemas: 'body-health',
  cbt: 'toy-cockring',
  // bondage / fetish
  rope: 'rope-play',
  cuffs_restraints: 'handcuffs',
  spreader_bars: 'handcuffs',
  slings_furniture: 'rope-play',
  latex: 'gear-fetish',
  leather: 'gear-fetish',
  rubber_neoprene: 'gear-fetish',
  uniforms: 'gear-fetish',
};

/** Icon for a fine-tier chip: an override, else its group's mark. Total. */
export function fineIcon(
  slug: string | null | undefined,
  group: string | null | undefined,
  department: string | null | undefined,
): TransitIconName {
  return FINE_ICONS[slug ?? ''] ?? groupIcon(group, department);
}
