import { z } from 'zod';
import type { PrideFlag } from './flags/prideFlags';
import type { HankyCodeEntry } from './flags/hankyCode';
import type { CategoryDef } from './competitionCategories';
import type { ReferenceTerm } from './referenceTaxonomyStore';
import type { ValidationResult } from '@/utils/contentValidation';
import { TRANSIT_ICON_NAMES } from '@/components/transit/transitIconPaths';

const hex = z
  .string()
  .regex(/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i, 'Use a hexadecimal color.');
const stripe = z.object({
  hex,
  weight: z.number().positive().optional(),
  meaningKey: z.string().optional(),
  meaningEn: z.string().optional(),
});
const overlay = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('chevron'), colors: z.array(hex).min(1).max(16) }),
  z.object({ kind: z.literal('circle'), ringHex: hex }),
  z.object({ kind: z.literal('triangle'), hex }),
  z.object({ kind: z.literal('heart'), hex }),
  z.object({ kind: z.literal('paw'), hex }),
]);
const flagSchema = z.object({
  stripes: z.array(stripe).min(1).max(32),
  overlay: overlay.optional(),
  designer: z.string().optional(),
  year: z.number().int().optional(),
  nameKey: z.string().optional(),
  noteKey: z.string().optional(),
  noteEn: z.string().optional(),
  flagTagSlug: z.string().optional(),
  identityTagSlugs: z.array(z.string()).default([]),
});
const hankySchema = z.object({
  hex,
  meaningEn: z.string().min(1),
  meaningKey: z.string().optional(),
  colorKey: z.string().optional(),
  tier: z.enum(['classic', 'extended']),
});
const competitionSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  blurb: z.string().default(''),
  labelKey: z.string().optional(),
  blurbKey: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  hasGrid: z.boolean().default(false),
  bullet: z
    .object({
      letter: z.string().min(1).max(2),
      track: z.enum(['pink', 'blue', 'green', 'yellow']),
    })
    .default({ letter: 'C', track: 'pink' }),
  icon: z
    .enum(
      TRANSIT_ICON_NAMES as [
        (typeof TRANSIT_ICON_NAMES)[number],
        ...(typeof TRANSIT_ICON_NAMES)[number][],
      ],
    )
    .default('theater'),
});

export function prideFlagDefinition(term: ReferenceTerm, baseline?: PrideFlag): PrideFlag | null {
  const parsed = flagSchema.safeParse(term.metadata);
  if (!parsed.success) return null;
  const metadata = parsed.data;
  return {
    ...metadata,
    id: term.value,
    nameEn: term.name,
    nameKey: baseline?.nameEn === term.name ? baseline.nameKey : `managedFlags.${term.value}.name`,
    stripes: metadata.stripes.map((entry, index) => ({
      ...entry,
      meaningKey:
        entry.meaningEn === baseline?.stripes[index]?.meaningEn
          ? entry.meaningKey
          : `managedFlags.${term.value}.stripes.${index}`,
    })),
    noteKey:
      metadata.noteEn === baseline?.noteEn ? metadata.noteKey : `managedFlags.${term.value}.note`,
  };
}
export function hankyDefinition(
  term: ReferenceTerm,
  baseline?: HankyCodeEntry,
): HankyCodeEntry | null {
  const parsed = hankySchema.safeParse(term.metadata);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    id: term.value,
    colorEn: term.name,
    colorKey:
      baseline?.colorEn === term.name ? baseline.colorKey : `managedHanky.${term.value}.color`,
    meaningKey:
      baseline?.meaningEn === parsed.data.meaningEn
        ? baseline.meaningKey
        : `managedHanky.${term.value}.meaning`,
  };
}
export function competitionDefinition(
  term: ReferenceTerm,
  baseline?: CategoryDef,
): CategoryDef | null {
  const parsed = competitionSchema.safeParse(term.metadata);
  if (!parsed.success) return null;
  const metadata = parsed.data;
  return {
    ...metadata,
    id: term.value,
    slug: baseline?.slug ?? term.value.replaceAll('_', '-'),
    label: term.name,
    labelKey:
      baseline?.label === term.name ? baseline.labelKey : `managedCompetitions.${term.value}.label`,
    blurbKey:
      baseline?.blurb === metadata.blurb
        ? baseline.blurbKey
        : `managedCompetitions.${term.value}.blurb`,
    metaTitle:
      metadata.metaTitle &&
      (baseline?.label === term.name || metadata.metaTitle !== baseline?.metaTitle)
        ? metadata.metaTitle
        : `${term.name} | Queer Guide`,
    metaDescription: metadata.metaDescription ?? metadata.blurb,
  };
}
export function validateReferenceTerm(data: Record<string, unknown>): ValidationResult {
  const schema =
    data.taxonomy === 'pride_flag'
      ? flagSchema
      : data.taxonomy === 'hanky_code'
        ? hankySchema
        : data.taxonomy === 'competition_category'
          ? competitionSchema
          : null;
  const result = schema?.safeParse(data.metadata ?? {});
  const messages =
    result && !result.success
      ? result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      : [];
  return {
    isValid: messages.length === 0,
    errors: messages.map((message) => ({ field: 'metadata', message, severity: 'error' as const })),
    warnings: [],
  };
}
