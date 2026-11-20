/**
 * Plausibility checks for Body & about. Hints, not rules: bodies vary, so a
 * mismatch is a "worth a second look", never a block. Only values the database
 * would reject (outside its CHECK ranges) are errors.
 */
export interface BodyInput {
  body_type?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  size_top?: string | null;
  size_underwear?: string | null;
}

export interface BodyCheck {
  level: 'error' | 'hint';
  field: 'height_cm' | 'weight_kg' | 'body_type' | 'size_top' | 'size_underwear';
  message: string;
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const;
/** Upper weight (kg) of each letter size, a rough unisex guide. */
const SIZE_MAX_KG = [55, 65, 78, 92, 108, 125, Infinity];

const sizeIndex = (s: string | null | undefined) =>
  s ? (SIZES as readonly string[]).indexOf(s) : -1;
const sizeForWeight = (kg: number) => SIZE_MAX_KG.findIndex((max) => kg <= max);

export function bmi(heightCm: number, weightKg: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bodyChecks(b: BodyInput): BodyCheck[] {
  const out: BodyCheck[] = [];
  const h = b.height_cm ?? null;
  const w = b.weight_kg ?? null;

  if (h !== null && (h < 100 || h > 250))
    out.push({
      level: 'error',
      field: 'height_cm',
      message: 'Height must be between 100 and 250 cm.',
    });
  if (w !== null && (w < 30 || w > 300))
    out.push({
      level: 'error',
      field: 'weight_kg',
      message: 'Weight must be between 30 and 300 kg.',
    });
  if (out.length) return out;

  if (h !== null && w !== null) {
    const value = bmi(h, w);
    const lean = ['slim', 'twink'].includes(b.body_type ?? '');
    const heavy = ['chub', 'bear'].includes(b.body_type ?? '');
    if (lean && value >= 30)
      out.push({
        level: 'hint',
        field: 'body_type',
        message: `${h} cm and ${w} kg reads heavier than "${b.body_type}". Check the body type or your numbers.`,
      });
    if (heavy && value < 20)
      out.push({
        level: 'hint',
        field: 'body_type',
        message: `${h} cm and ${w} kg reads lighter than "${b.body_type}". Check the body type or your numbers.`,
      });
  }

  if (w !== null) {
    const expected = sizeForWeight(w);
    for (const field of ['size_top', 'size_underwear'] as const) {
      const picked = sizeIndex(b[field]);
      if (picked >= 0 && Math.abs(picked - expected) >= 3)
        out.push({
          level: 'hint',
          field,
          message: `${b[field]} is unusual at ${w} kg (around ${SIZES[expected]} is typical). Fine if it fits you.`,
        });
    }
  }

  const top = sizeIndex(b.size_top);
  const under = sizeIndex(b.size_underwear);
  if (top >= 0 && under >= 0 && Math.abs(top - under) >= 3)
    out.push({
      level: 'hint',
      field: 'size_underwear',
      message: `Top ${b.size_top} and underwear ${b.size_underwear} are far apart. Double-check one of them.`,
    });

  return out;
}
