import { AGE_BANDS } from '@/assets/intimate/options';
import type { IntimateSeeking } from '@/lib/intimate/types';

export interface SeekingFilters {
  roles: string[];
  ageBands: string[];
  bodyTypes: string[];
  genitalia: string[];
  /** cultural_variants.id → pocket wanted. */
  hanky: Record<string, 'left' | 'right' | 'both'>;
}

/** A member's "who you're looking for" as discovery filters. Empty = anyone. */
export function seekingToFilters(seeking: IntimateSeeking | null | undefined): SeekingFilters {
  const bands = AGE_BANDS as readonly string[];
  const lo = seeking?.age_min ? bands.indexOf(seeking.age_min) : 0;
  const hi = seeking?.age_max ? bands.indexOf(seeking.age_max) : bands.length - 1;
  const fullRange = lo <= 0 && hi >= bands.length - 1;
  return {
    roles: seeking?.roles ?? [],
    bodyTypes: seeking?.body_types ?? [],
    genitalia: seeking?.genitalia ?? [],
    hanky: seeking?.hanky ?? {},
    ageBands: fullRange || lo < 0 || hi < 0 ? [] : bands.slice(lo, hi + 1),
  };
}

export const hasSeeking = (f: SeekingFilters) =>
  f.roles.length +
    f.ageBands.length +
    f.bodyTypes.length +
    f.genitalia.length +
    Object.keys(f.hanky).length >
  0;
