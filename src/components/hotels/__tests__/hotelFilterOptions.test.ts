import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HOTEL_TYPE_OPTIONS,
  HOTEL_TYPE_LABEL,
  HOTEL_PRICE_OPTIONS,
  HOTEL_PRICE_LABEL,
} from '../hotelFilterOptions';

describe('hotelFilterOptions', () => {
  it('offers every hotel type accepted by the database', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../../supabase/migrations/00000000000000_baseline.sql'),
      'utf8',
    );
    const constraint = sql.match(/"hotels_hotel_type_check" CHECK[^\n]*ARRAY\[([^\]]+)\]/);
    expect(constraint).not.toBeNull();
    const allowed = [...constraint![1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(HOTEL_TYPE_OPTIONS.map((option) => option.value).sort()).toEqual(allowed.sort());
  });
  it('exports non-empty arrays', () => {
    expect(HOTEL_TYPE_OPTIONS.length).toBeGreaterThan(0);
    expect(HOTEL_PRICE_OPTIONS.length).toBeGreaterThan(0);
  });
  it('label maps match options', () => {
    for (const o of HOTEL_TYPE_OPTIONS) expect(HOTEL_TYPE_LABEL[o.value]).toBe(o.label);
    for (const o of HOTEL_PRICE_OPTIONS) expect(HOTEL_PRICE_LABEL[o.value]).toBe(o.label);
  });
});
