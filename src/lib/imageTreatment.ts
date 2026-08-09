import type { ImageTreatment } from '@/components/ui/Image';

/**
 * Read an entity's opt-in hero print treatment.
 *
 * The treatment is a per-record editorial decision, not a style rule — see the
 * long note on the `image_treatment` column in
 * `supabase/migrations/20260825100000_entity_image_treatment.sql`. Short
 * version: the riso duotone renders a photo on two ink drums, which destroys
 * colour-coded identity imagery (rainbow / trans / bi flags), those appear
 * across news, event and venue heroes alike, and nothing in the data can tell
 * them apart. So it is off unless a human turned it on.
 *
 * Three stored states collapse to two rendered ones: NULL (never set) and the
 * literal `'none'` (a human chose off) both mean no treatment. `'none'` exists
 * because the admin select needs a clear option and Radix rejects a SelectItem
 * with an empty-string value.
 *
 * Reads defensively for two reasons: the generated Supabase types lag the
 * migration, and an unknown value from the database must degrade to `none`
 * rather than throw. The DB CHECK constrains writes; this constrains reads, so
 * neither side has to trust the other.
 */
export function entityImageTreatment(entity: unknown): ImageTreatment {
  const value = (entity as { image_treatment?: unknown } | null | undefined)?.image_treatment;
  return value === 'riso' || value === 'halftone' ? value : 'none';
}
