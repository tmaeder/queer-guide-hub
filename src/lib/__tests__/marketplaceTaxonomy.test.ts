import { describe, it, expect } from 'vitest';
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_ORDER,
  DEPARTMENT_GROUPS,
  GROUP_LABELS,
  ADULT_DEPARTMENTS,
  groupLabel,
} from '@/lib/marketplaceTaxonomy';

describe('marketplace taxonomy mirror', () => {
  it('every ordered department has a label', () => {
    for (const dep of DEPARTMENT_ORDER) {
      expect(DEPARTMENT_LABELS[dep], `label for ${dep}`).toBeDefined();
    }
  });

  it('adult departments are known departments', () => {
    for (const dep of ADULT_DEPARTMENTS) {
      expect(DEPARTMENT_LABELS[dep], `adult dep ${dep}`).toBeDefined();
    }
  });

  it('every group in DEPARTMENT_GROUPS has a label', () => {
    for (const [dep, groups] of Object.entries(DEPARTMENT_GROUPS)) {
      expect(DEPARTMENT_LABELS[dep], `dep ${dep}`).toBeDefined();
      for (const g of groups) {
        expect(GROUP_LABELS[g], `label for group ${g} (dep ${dep})`).toBeDefined();
      }
    }
  });

  it('groupLabel falls back to a prettified slug for unknown groups', () => {
    expect(groupLabel('tops')).toBe('Tops');
    expect(groupLabel('some_new_group')).toBe('Some New Group');
    expect(groupLabel(null)).toBe('Other');
  });
});
