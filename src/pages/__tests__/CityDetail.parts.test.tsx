/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import * as parts from '../CityDetail.parts';

describe('CityDetail.parts', () => {
  it('re-exports expected symbols', () => {
    expect(typeof parts.formatPopulation).toBe('function');
    expect(parts.CityHero).toBeDefined();
    expect(parts.CityOverviewTab).toBeDefined();
  });
});
