import { describe, it, expect } from 'vitest';
import { venueCategories, commonAmenities, emptyFormData } from '../types';

describe('admin-venues/types', () => {
  it('exports arrays and form defaults', () => {
    expect(Array.isArray(venueCategories)).toBe(true);
    expect(Array.isArray(commonAmenities)).toBe(true);
    expect(typeof emptyFormData).toBe('object');
  });
});
