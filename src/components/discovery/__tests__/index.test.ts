import { describe, it, expect } from 'vitest';
import * as Discovery from '../index';

describe('discovery barrel', () => {
  it('re-exports', () => {
    expect(Discovery.EntityCard).toBeDefined();
    expect(Discovery.PageHero).toBeDefined();
    expect(Discovery.BentoSection).toBeDefined();
    expect(Discovery.spansForPreset).toBeDefined();
  });
});
