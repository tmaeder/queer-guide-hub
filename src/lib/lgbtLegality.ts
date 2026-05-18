export type LegalityLevel = 'protected' | 'mixed' | 'restricted';

export interface LegalityBadge {
  level: LegalityLevel;
  label: string;
  ariaLabel: string;
}

interface CountryLegalityInput {
  equality_score?: number | null;
  lgbt_legal_status?: string | null;
  lgbt_rights_status?: string | null;
  lgbti_criminalization?: unknown;
}

const CRIMINALIZED_TEXT = /criminali[sz]ed|outlawed|punishable|imprisonment|death penalty applies/i;
const PROTECTED_TEXT = /legal and protected|same-?sex marriage|full equality|fully recogni[sz]ed/i;

function hasCriminalizationFlag(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const c = input as Record<string, unknown>;
  // Schema (countries.lgbti_criminalization): { legal: boolean, penalty: string,
  // death_penalty: 'Yes'|'No', max_prison: string|null, ... }
  // Treat as criminalized only when `legal === false` OR a real penalty is recorded.
  if (c.legal === false) return true;
  if (typeof c.death_penalty === 'string' && /^yes$/i.test(c.death_penalty)) return true;
  if (typeof c.max_prison === 'string' && !/^(no|none|0)$/i.test(c.max_prison)) return true;
  if (typeof c.penalty === 'string' && c.penalty && !/^no criminali[sz]ation$/i.test(c.penalty)) return true;
  return false;
}

export function getLegalityBadge(country: CountryLegalityInput | null | undefined): LegalityBadge | null {
  if (!country) return null;

  const score = country.equality_score;
  const status = (country.lgbt_legal_status || country.lgbt_rights_status || '').toLowerCase();
  const criminalized = hasCriminalizationFlag(country.lgbti_criminalization) || CRIMINALIZED_TEXT.test(status);

  if (criminalized) {
    return {
      level: 'restricted',
      label: 'Restrictions apply',
      ariaLabel: 'LGBTQ+ legal status: restrictions or criminalization may apply',
    };
  }

  if (typeof score === 'number') {
    if (score >= 75) {
      return {
        level: 'protected',
        label: 'LGBTQ+ legal',
        ariaLabel: `LGBTQ+ legal status: protections in place (equality score ${score})`,
      };
    }
    if (score >= 40) {
      return {
        level: 'mixed',
        label: 'Mixed protections',
        ariaLabel: `LGBTQ+ legal status: mixed protections (equality score ${score})`,
      };
    }
    return {
      level: 'restricted',
      label: 'Restrictions apply',
      ariaLabel: `LGBTQ+ legal status: limited or no protections (equality score ${score})`,
    };
  }

  if (status) {
    if (PROTECTED_TEXT.test(status)) {
      return {
        level: 'protected',
        label: 'LGBTQ+ legal',
        ariaLabel: `LGBTQ+ legal status: ${country.lgbt_legal_status || country.lgbt_rights_status}`,
      };
    }
    return {
      level: 'mixed',
      label: 'Mixed protections',
      ariaLabel: `LGBTQ+ legal status: ${country.lgbt_legal_status || country.lgbt_rights_status}`,
    };
  }

  return null;
}
