import { describe, it, expect } from 'vitest';
import { calculateAge, MAX_HUMAN_AGE } from '@/lib/personAge';

describe('calculateAge', () => {
  it('uses death_date, not today, for someone who has died', () => {
    // The /professions/Politician "434" case: born 1592, long dead.
    expect(calculateAge('1592-04-01', '1650-11-30')).toBe(58);
  });

  it('subtracts a year when the birthday has not come round yet', () => {
    expect(calculateAge('1950-12-31', '2000-01-01')).toBe(49);
    expect(calculateAge('1950-01-01', '2000-01-01')).toBe(50);
  });

  it('ages a living person against today', () => {
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - 30);
    expect(calculateAge(birth.toISOString().slice(0, 10))).toBe(30);
  });

  it('drops an implausible age rather than rendering it', () => {
    // Dead historical figure with no death_date recorded — the 434 shape.
    expect(calculateAge('1592-04-01')).toBeNull();
    expect(calculateAge('1871-01-01', '2050-01-01')).toBeNull();
  });

  it('keeps an age exactly at the human ceiling', () => {
    const birthYear = 2000 - MAX_HUMAN_AGE;
    expect(calculateAge(`${birthYear}-01-01`, '2000-01-01')).toBe(MAX_HUMAN_AGE);
    expect(calculateAge(`${birthYear - 1}-01-01`, '2000-01-01')).toBeNull();
  });

  it('returns null for missing, unparseable or future dates', () => {
    expect(calculateAge(null)).toBeNull();
    expect(calculateAge(undefined)).toBeNull();
    expect(calculateAge('')).toBeNull();
    expect(calculateAge('not-a-date')).toBeNull();
    expect(calculateAge('1980-01-01', 'not-a-date')).toBeNull();
    expect(calculateAge('2100-01-01')).toBeNull();
    expect(calculateAge('1990-01-01', '1980-01-01')).toBeNull();
  });

  it('returns 0 rather than a falsy hole for an infant', () => {
    expect(calculateAge('2000-01-01', '2000-06-01')).toBe(0);
  });
});
