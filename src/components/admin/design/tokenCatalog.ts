/**
 * Static catalog of every runtime-overridable design token: key, grouping for
 * the /admin/design editor, and the compiled-in default from src/index.css.
 *
 * The defaults here MUST match src/index.css — guarded by
 * __tests__/tokenCatalog.test.ts, which parses the stylesheet and diffs it
 * against this file. The overridable key set mirrors `branding_validate`
 * (supabase/migrations/20260723174925_site_branding.sql) and
 * functions/_lib/branding.ts.
 */

export type ColorGroup = 'core' | 'surface' | 'text' | 'sidebar' | 'feedback';

export type ColorTokenDef = {
  key: string; // without leading --
  group: ColorGroup;
  light: string; // "H S% L%" channels
  dark: string;
  /**
   * A wayfinding TRACK colour: a fill that is NEVER a letterform and never a
   * semantic state. Flagging it here enrols it in the safety guards in
   * __tests__/tokenContrast.test.ts — the ban on body text and, above all, the
   * check that it never drifts into the `--destructive` hue band. Those guards
   * used to read a hardcoded `['spot','ink-blue','ink-over']` (the PASTE-UP
   * alias names, retired 2026-08-19), so a fourth colour added everywhere else
   * would have been silently unguarded (adopted from #2659).
   */
  ink?: true;
};

export type GlobalTokenKind = 'size' | 'lineHeight' | 'radius' | 'tracking' | 'transition';

export type GlobalTokenDef = {
  key: string;
  kind: GlobalTokenKind;
  default: string;
  label: string;
};

/** Sparse override document, mirrors site_branding draft/published jsonb. */
export type BrandingDoc = {
  tokens?: {
    light?: Record<string, string>;
    dark?: Record<string, string>;
    global?: Record<string, string>;
  };
  meta?: {
    site_name?: string;
    default_title?: string;
    default_description?: string;
    twitter_handle?: string;
    og_image_url?: string;
    theme_color_light?: string;
    theme_color_dark?: string;
    org_logo_url?: string;
    org_sameas?: string[];
  };
  manifest?: {
    name?: string;
    short_name?: string;
    theme_color?: string;
    background_color?: string;
  };
  email?: {
    from_name?: string;
    from_address?: string;
    logo_url?: string;
    wrapper_bg?: string;
    wrapper_fg?: string;
  };
  fonts?: {
    display?: FontSlot;
    sans?: FontSlot;
  };
};

export type FontFile = { url: string; weight: string; style: 'normal' | 'italic' };
export type FontSlot = { family: string; files: FontFile[] };
export type FontSlotKey = 'display' | 'sans';

/** Default family stacks + the CSS var each slot overrides (mirror src/index.css). */
export const FONT_SLOTS: Array<{
  key: FontSlotKey;
  cssVar: string;
  label: string;
  defaultFamily: string;
}> = [
  {
    key: 'display',
    cssVar: '--font-display',
    label: 'Display (headings)',
    defaultFamily: 'Anton',
  },
  { key: 'sans', cssVar: '--font-sans', label: 'Sans (body & UI)', defaultFamily: 'Space Grotesk' },
];

export const COLOR_TOKENS: ColorTokenDef[] = [
  // Core — paper #FAFAF5 is BOTH page and card; the ground layer on `body`
  // (src/index.css) is what separates them. See tokenContrast.test.ts.
  { key: 'background', group: 'core', light: '60 33% 97%', dark: '0 0% 6.7%' },
  { key: 'foreground', group: 'core', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'card', group: 'core', light: '60 33% 97%', dark: '60 6.1% 12.9%' },
  { key: 'card-foreground', group: 'core', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'popover', group: 'core', light: '60 33% 97%', dark: '60 5.6% 14.1%' },
  { key: 'popover-foreground', group: 'core', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'primary', group: 'core', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'primary-foreground', group: 'core', light: '60 33% 97%', dark: '0 0% 6.7%' },
  { key: 'secondary', group: 'core', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'secondary-foreground', group: 'core', light: '60 33% 97%', dark: '0 0% 6.7%' },
  { key: 'muted', group: 'core', light: '60 22.2% 89.4%', dark: '60 5.7% 10.4%' },
  { key: 'muted-foreground', group: 'core', light: '0 0% 33%', dark: '60 6% 66%' },
  { key: 'accent', group: 'core', light: '60 22.2% 89.4%', dark: '60 5.6% 14.1%' },
  { key: 'accent-foreground', group: 'core', light: '0 0% 6.7%', dark: '60 33% 97%' },
  // A divider, not a component boundary — cards separate by tint + shadow.
  { key: 'border', group: 'core', light: '60 7.4% 81.4%', dark: '60 1.1% 17.5%' },
  // A form control's boundary IS required to clear 3:1 (WCAG 1.4.11).
  { key: 'input', group: 'core', light: '60 4.8% 44.9%', dark: '60 3.6% 51.2%' },
  { key: 'input-bg', group: 'core', light: '60 33% 97%', dark: '60 5.7% 10.4%' },
  { key: 'ring', group: 'core', light: '330 100% 56%', dark: '330 100% 56%' },
  // Track colors — SEMANTIC wayfinding lines. Fill-only, never body text;
  // a track-coloured MARK carries the ink `--track-ring`. See src/index.css.
  { key: 'track-pink', group: 'core', light: '330 100% 56%', dark: '330 100% 56%', ink: true },
  { key: 'track-blue', group: 'core', light: '193 100% 45%', dark: '193 100% 45%', ink: true },
  {
    key: 'track-green',
    group: 'core',
    light: '135.6 74.5% 52.4%',
    dark: '135.6 74.5% 52.4%',
    ink: true,
  },
  { key: 'track-yellow', group: 'core', light: '50.1 100% 50%', dark: '50.1 100% 50%', ink: true },
  // Feedback — destructive is the only chromatic hue; warning + success are neutral
  { key: 'destructive', group: 'feedback', light: '0 70% 38%', dark: '0 80% 66%' },
  { key: 'destructive-foreground', group: 'feedback', light: '60 33% 97%', dark: '0 0% 6.7%' },
  { key: 'warning', group: 'feedback', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'warning-foreground', group: 'feedback', light: '60 33% 97%', dark: '0 0% 6.7%' },
  { key: 'success', group: 'feedback', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'success-foreground', group: 'feedback', light: '60 33% 97%', dark: '0 0% 6.7%' },
  // Text hierarchy
  { key: 'text-primary', group: 'text', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'text-secondary', group: 'text', light: '0 0% 30%', dark: '60 8% 72%' },
  { key: 'text-muted', group: 'text', light: '0 0% 40%', dark: '60 6% 62%' },
  // Channels only — the 12% alpha lives in `--hairline-alpha`, because
  // branding_validate's HSL_RE forbids an alpha component in a token value.
  { key: 'border-hairline', group: 'text', light: '0 0% 6.7%', dark: '60 33% 97%' },
  // Surface elevation ladder — paper-tinted neutral steps
  { key: 'surface', group: 'surface', light: '60 33% 97%', dark: '60 6.1% 12.9%' },
  { key: 'surface-container-lowest', group: 'surface', light: '60 33% 97%', dark: '60 5.7% 10.4%' },
  {
    key: 'surface-container-low',
    group: 'surface',
    light: '60 22.2% 89.4%',
    dark: '60 6.1% 12.9%',
  },
  { key: 'surface-container', group: 'surface', light: '60 15.8% 88.8%', dark: '60 5.6% 14.1%' },
  {
    key: 'surface-container-high',
    group: 'surface',
    light: '60 15% 84.3%',
    dark: '60 5.5% 16.5%',
  },
  { key: 'surface-container-highest', group: 'surface', light: '60 12% 87%', dark: '60 5.4% 19%' },
  { key: 'surface-dim', group: 'surface', light: '60 11% 85%', dark: '60 5.2% 22%' },
  { key: 'inverse-surface', group: 'surface', light: '0 0% 6.7%', dark: '60 33% 97%' },
  // Sidebar
  { key: 'sidebar-background', group: 'sidebar', light: '60 33% 97%', dark: '60 6.1% 12.9%' },
  { key: 'sidebar-foreground', group: 'sidebar', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'sidebar-primary', group: 'sidebar', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'sidebar-primary-foreground', group: 'sidebar', light: '60 33% 97%', dark: '0 0% 6.7%' },
  { key: 'sidebar-accent', group: 'sidebar', light: '60 22.2% 89.4%', dark: '60 5.6% 14.1%' },
  { key: 'sidebar-accent-foreground', group: 'sidebar', light: '0 0% 6.7%', dark: '60 33% 97%' },
  { key: 'sidebar-border', group: 'sidebar', light: '60 7.4% 81.4%', dark: '60 1.1% 17.5%' },
  { key: 'sidebar-ring', group: 'sidebar', light: '0 0% 6.7%', dark: '60 33% 97%' },
];

export const GLOBAL_TOKENS: GlobalTokenDef[] = [
  // The radius ladder. `--radius-panel` (26px, dialogs + page-level shells)
  // is deliberately NOT cataloged: it is compile-time only, following the
  // --radius-full precedent, which keeps this change free of a
  // branding_validate migration and off the 150-key cap.
  {
    key: 'radius-container',
    kind: 'radius',
    default: '1.125rem',
    label: 'Container (cards, panels, fields)',
  },
  {
    key: 'radius-element',
    kind: 'radius',
    default: '0.75rem',
    label: 'Element (buttons, inputs, rows, chips)',
  },
  {
    key: 'radius-badge',
    kind: 'radius',
    default: '0.5625rem',
    label: 'Badge (count marks, swatches)',
  },
  { key: 'text-hero-xl', kind: 'size', default: '6rem', label: 'Hero XL' },
  {
    key: 'text-hero-xl--line-height',
    kind: 'lineHeight',
    default: '0.95',
    label: 'Hero XL line height',
  },
  { key: 'text-hero', kind: 'size', default: '4.75rem', label: 'Hero' },
  { key: 'text-hero--line-height', kind: 'lineHeight', default: '0.98', label: 'Hero line height' },
  { key: 'text-display', kind: 'size', default: '3.25rem', label: 'Display' },
  {
    key: 'text-display--line-height',
    kind: 'lineHeight',
    default: '1.02',
    label: 'Display line height',
  },
  // `text-headline-lg` removed 2026-08-04: it sat 1.14x from `text-headline`,
  // which no reader resolves as a separate level, so the two were used
  // interchangeably. This is one of six layers that move together — see the
  // note in src/index.css.
  { key: 'text-headline', kind: 'size', default: '2rem', label: 'Headline' },
  {
    key: 'text-headline--line-height',
    kind: 'lineHeight',
    default: '1.15',
    label: 'Headline line height',
  },
  { key: 'text-title', kind: 'size', default: '1.25rem', label: 'Title' },
  {
    key: 'text-title--line-height',
    kind: 'lineHeight',
    default: '1.4',
    label: 'Title line height',
  },
  { key: 'text-body-lg', kind: 'size', default: '1.0625rem', label: 'Body large' },
  {
    key: 'text-body-lg--line-height',
    kind: 'lineHeight',
    default: '1.7',
    label: 'Body large line height',
  },
  { key: 'text-15', kind: 'size', default: '0.9375rem', label: '15px body' },
  {
    key: 'text-15--line-height',
    kind: 'lineHeight',
    default: '1.375rem',
    label: '15px line height',
  },
  { key: 'text-13', kind: 'size', default: '0.8125rem', label: '13px small' },
  {
    key: 'text-13--line-height',
    kind: 'lineHeight',
    default: '1.125rem',
    label: '13px line height',
  },
  { key: 'text-xs2', kind: 'size', default: '0.6875rem', label: '11px extra small' },
  { key: 'text-xs2--line-height', kind: 'lineHeight', default: '1rem', label: '11px line height' },
  { key: 'text-2xs', kind: 'size', default: '0.625rem', label: '10px micro' },
  {
    key: 'text-2xs--line-height',
    kind: 'lineHeight',
    default: '0.875rem',
    label: '10px line height',
  },
  { key: 'text-3xs', kind: 'size', default: '0.5625rem', label: '9px nano' },
  {
    key: 'text-3xs--line-height',
    kind: 'lineHeight',
    default: '0.75rem',
    label: '9px line height',
  },
  { key: 'tracking-label', kind: 'tracking', default: '0.04em', label: 'Eyebrow label tracking' },
  {
    key: 'transition-smooth',
    kind: 'transition',
    default: 'all 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
    label: 'Smooth transition',
  },
];

/** Foreground-on-background pairs evaluated for WCAG contrast. */
export const CONTRAST_PAIRS: Array<{ fg: string; bg: string; label: string }> = [
  { fg: 'foreground', bg: 'background', label: 'Body text' },
  { fg: 'primary-foreground', bg: 'primary', label: 'Primary button' },
  { fg: 'secondary-foreground', bg: 'secondary', label: 'Secondary button' },
  { fg: 'muted-foreground', bg: 'muted', label: 'Muted text on muted' },
  { fg: 'muted-foreground', bg: 'background', label: 'Muted text on page' },
  { fg: 'accent-foreground', bg: 'accent', label: 'Accent' },
  { fg: 'card-foreground', bg: 'card', label: 'Card' },
  { fg: 'popover-foreground', bg: 'popover', label: 'Popover' },
  { fg: 'destructive-foreground', bg: 'destructive', label: 'Destructive button' },
  { fg: 'warning-foreground', bg: 'warning', label: 'Warning' },
  { fg: 'success-foreground', bg: 'success', label: 'Success' },
  // The `spot` / `ink-blue` / `ink-over` pairs that used to sit here went with
  // the PASTE-UP alias tokens themselves (2026-08-19). They asserted the same
  // three colours the track tokens hold, so nothing lost coverage: the
  // selection highlight now reads `--track-pink` / `--track-ring` directly.
  // The three `foreground`-on-track pairs that used to sit here were REMOVED
  // when dark mode came back. `--foreground` flips to paper in dark, so they
  // would have asserted paper-on-cyan (2.32:1) and failed — while the product
  // renders `--track-ring`, which is ink in BOTH modes and is not cataloged
  // (it is compile-time only, so it cannot be named here). The rule is
  // asserted directly against the stylesheet in tokenContrast.test.ts
  // instead, for both modes.
  { fg: 'text-primary', bg: 'background', label: 'Text hierarchy: primary' },
  { fg: 'text-secondary', bg: 'background', label: 'Text hierarchy: secondary' },
  { fg: 'text-muted', bg: 'background', label: 'Text hierarchy: muted' },
  { fg: 'sidebar-foreground', bg: 'sidebar-background', label: 'Sidebar' },
];

export const COLOR_GROUP_LABELS: Record<ColorGroup, string> = {
  core: 'Core',
  surface: 'Surfaces',
  text: 'Text hierarchy & hairline',
  sidebar: 'Sidebar',
  feedback: 'Feedback',
};

const colorByKey = new Map(COLOR_TOKENS.map((t) => [t.key, t]));

/** Resolve a color token's effective value from a sparse doc (draft ?? default). */
export function resolveColor(doc: BrandingDoc, key: string, mode: 'light' | 'dark'): string {
  return doc.tokens?.[mode]?.[key] ?? colorByKey.get(key)?.[mode] ?? '0 0% 0%';
}

/** Resolve a global token's effective value from a sparse doc. */
export function resolveGlobal(doc: BrandingDoc, key: string): string {
  return doc.tokens?.global?.[key] ?? GLOBAL_TOKENS.find((t) => t.key === key)?.default ?? '';
}

/** Count every override present in a sparse doc (tokens + meta + manifest + email). */
export function countOverrides(doc: BrandingDoc): number {
  const tokenCount =
    Object.keys(doc.tokens?.light ?? {}).length +
    Object.keys(doc.tokens?.dark ?? {}).length +
    Object.keys(doc.tokens?.global ?? {}).length;
  return (
    tokenCount +
    Object.keys(doc.meta ?? {}).length +
    Object.keys(doc.manifest ?? {}).length +
    Object.keys(doc.email ?? {}).length +
    Object.keys(doc.fonts ?? {}).length
  );
}

/** Flatten a sparse doc to dot-path → value for diffing (arrays joined). */
export function flattenBrandingDoc(doc: BrandingDoc): Record<string, string> {
  const out: Record<string, string> = {};
  for (const scope of ['light', 'dark', 'global'] as const) {
    for (const [k, v] of Object.entries(doc.tokens?.[scope] ?? {})) {
      out[`tokens.${scope}.${k}`] = v;
    }
  }
  for (const section of ['meta', 'manifest', 'email'] as const) {
    for (const [k, v] of Object.entries(doc[section] ?? {})) {
      out[`${section}.${k}`] = Array.isArray(v) ? v.join(', ') : String(v);
    }
  }
  for (const slot of ['display', 'sans'] as const) {
    const s = doc.fonts?.[slot];
    if (s)
      out[`fonts.${slot}`] =
        `${s.family} (${s.files?.length ?? 0} file${s.files?.length === 1 ? '' : 's'})`;
  }
  return out;
}

/** Remove empty sections so the stored doc stays sparse. */
export function pruneDoc(doc: BrandingDoc): BrandingDoc {
  const out: BrandingDoc = {};
  const tokens: NonNullable<BrandingDoc['tokens']> = {};
  for (const scope of ['light', 'dark', 'global'] as const) {
    const entries = doc.tokens?.[scope];
    if (entries && Object.keys(entries).length > 0) tokens[scope] = entries;
  }
  if (Object.keys(tokens).length > 0) out.tokens = tokens;
  for (const section of ['meta', 'manifest', 'email'] as const) {
    const entries = doc[section];
    if (entries && Object.keys(entries).length > 0) {
      out[section] = entries as never;
    }
  }
  // fonts: keep only slots that have a family + at least one file
  const fonts: NonNullable<BrandingDoc['fonts']> = {};
  for (const slot of ['display', 'sans'] as const) {
    const s = doc.fonts?.[slot];
    if (s && s.family && Array.isArray(s.files) && s.files.length > 0) fonts[slot] = s;
  }
  if (Object.keys(fonts).length > 0) out.fonts = fonts;
  return out;
}
