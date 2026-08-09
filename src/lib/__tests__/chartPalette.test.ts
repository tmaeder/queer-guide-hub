import { describe, expect, it } from 'vitest';
import { trackChartPalette, monoChartPalette } from '@/lib/chartPalette';

describe('trackChartPalette', () => {
  it('cycles the four track colors', () => {
    expect(trackChartPalette(4)).toEqual([
      'hsl(var(--track-pink))',
      'hsl(var(--track-blue))',
      'hsl(var(--track-green))',
      'hsl(var(--track-yellow))',
    ]);
    expect(trackChartPalette(6)).toHaveLength(6);
    expect(trackChartPalette(6)[4]).toBe('hsl(var(--track-pink))');
  });
  it('keeps the mono ramp for back-compat', () => {
    expect(monoChartPalette(2)).toHaveLength(2);
  });
});
