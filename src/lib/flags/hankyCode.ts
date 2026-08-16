/**
 * The handkerchief code — REFERENCE DATA ONLY.
 *
 * This table exists so /tags/handkerchief-code can document the code as queer
 * history, the way the diagnostic-codes band documents clinical classification.
 * It is deliberately NOT a signaling feature: nothing in the product lets a
 * user "wear" a hanky colour, and nothing should — that decision is
 * user-locked (2026-08-16 brainstorm).
 *
 * The CLASSIC tier is the ten-colour core as published in Larry Townsend's
 * "The Leatherman's Handbook II" (1983), the closest thing the code has to a
 * canonical source. The EXTENDED tier is a small set of additions that appear
 * consistently across later scene lists; dozens more variants exist and
 * meanings shift by city and decade, which is why this list stays short and
 * the band says so. Hand-curated like the flags — no enrichment sweep.
 *
 * Wearing convention (one rule, not per-row): LEFT pocket = top / giving
 * side, RIGHT pocket = bottom / receiving side.
 */

export interface HankyCodeEntry {
  id: string;
  colorKey: string;
  colorEn: string;
  hex: string;
  meaningKey: string;
  meaningEn: string;
  tier: 'classic' | 'extended';
}

export const HANKY_CODE: readonly HankyCodeEntry[] = [
  // ── Classic (Townsend, 1983) ─────────────────────────────────────────────
  {
    id: 'black',
    colorKey: 'flags.hanky.colors.black',
    colorEn: 'Black',
    hex: '#111111',
    meaningKey: 'flags.hanky.meanings.black',
    meaningEn: 'Heavy S&M',
    tier: 'classic',
  },
  {
    id: 'grey',
    colorKey: 'flags.hanky.colors.grey',
    colorEn: 'Grey',
    hex: '#808080',
    meaningKey: 'flags.hanky.meanings.grey',
    meaningEn: 'Bondage',
    tier: 'classic',
  },
  {
    id: 'navy',
    colorKey: 'flags.hanky.colors.navy',
    colorEn: 'Navy blue',
    hex: '#000080',
    meaningKey: 'flags.hanky.meanings.navy',
    meaningEn: 'Anal sex',
    tier: 'classic',
  },
  {
    id: 'light-blue',
    colorKey: 'flags.hanky.colors.lightBlue',
    colorEn: 'Light blue',
    hex: '#9BD1F5',
    meaningKey: 'flags.hanky.meanings.lightBlue',
    meaningEn: 'Oral sex',
    tier: 'classic',
  },
  {
    id: 'red',
    colorKey: 'flags.hanky.colors.red',
    colorEn: 'Red',
    hex: '#C0181A',
    meaningKey: 'flags.hanky.meanings.red',
    meaningEn: 'Fisting',
    tier: 'classic',
  },
  {
    id: 'yellow',
    colorKey: 'flags.hanky.colors.yellow',
    colorEn: 'Yellow',
    hex: '#F5C518',
    meaningKey: 'flags.hanky.meanings.yellow',
    meaningEn: 'Watersports',
    tier: 'classic',
  },
  {
    id: 'brown',
    colorKey: 'flags.hanky.colors.brown',
    colorEn: 'Brown',
    hex: '#6B3F1D',
    meaningKey: 'flags.hanky.meanings.brown',
    meaningEn: 'Scat',
    tier: 'classic',
  },
  {
    id: 'green',
    colorKey: 'flags.hanky.colors.green',
    colorEn: 'Kelly green',
    hex: '#2E8B3A',
    meaningKey: 'flags.hanky.meanings.green',
    meaningEn: 'Hustling — sex for money',
    tier: 'classic',
  },
  {
    id: 'orange',
    colorKey: 'flags.hanky.colors.orange',
    colorEn: 'Orange',
    hex: '#E86A17',
    meaningKey: 'flags.hanky.meanings.orange',
    meaningEn: 'Anything goes',
    tier: 'classic',
  },
  {
    id: 'purple',
    colorKey: 'flags.hanky.colors.purple',
    colorEn: 'Purple',
    hex: '#6A2E8F',
    meaningKey: 'flags.hanky.meanings.purple',
    meaningEn: 'Piercing',
    tier: 'classic',
  },
  // ── Extended (common later additions; varies by scene) ───────────────────
  {
    id: 'white',
    colorKey: 'flags.hanky.colors.white',
    colorEn: 'White',
    hex: '#F5F5F0',
    meaningKey: 'flags.hanky.meanings.white',
    meaningEn: 'Masturbation',
    tier: 'extended',
  },
  {
    id: 'pink',
    colorKey: 'flags.hanky.colors.pink',
    colorEn: 'Pink',
    hex: '#F2A7C3',
    meaningKey: 'flags.hanky.meanings.pink',
    meaningEn: 'Dildo play',
    tier: 'extended',
  },
  {
    id: 'fuchsia',
    colorKey: 'flags.hanky.colors.fuchsia',
    colorEn: 'Fuchsia',
    hex: '#C4256E',
    meaningKey: 'flags.hanky.meanings.fuchsia',
    meaningEn: 'Spanking',
    tier: 'extended',
  },
  {
    id: 'lavender',
    colorKey: 'flags.hanky.colors.lavender',
    colorEn: 'Lavender',
    hex: '#B57EDC',
    meaningKey: 'flags.hanky.meanings.lavender',
    meaningEn: 'Drag',
    tier: 'extended',
  },
  {
    id: 'charcoal',
    colorKey: 'flags.hanky.colors.charcoal',
    colorEn: 'Charcoal',
    hex: '#3A3A3A',
    meaningKey: 'flags.hanky.meanings.charcoal',
    meaningEn: 'Rubber and latex',
    tier: 'extended',
  },
  {
    id: 'hunter-green',
    colorKey: 'flags.hanky.colors.hunterGreen',
    colorEn: 'Hunter green',
    hex: '#1E4D2B',
    meaningKey: 'flags.hanky.meanings.hunterGreen',
    meaningEn: 'Daddy / boy dynamics',
    tier: 'extended',
  },
];

/** The one tag page the hanky band mounts on. */
export const HANKY_CODE_TAG_SLUG = 'handkerchief-code';
