import { describe, expect, it } from 'vitest';
import {
  lensToRenderMode,
  exploreLayersFor,
  heatmapRenderPlan,
} from '@/components/map/mapShellAdapters';
import type { LayerType } from '@/hooks/useExploreMapData';

describe('lensToRenderMode', () => {
  it('maps density to heatmap, combined to combined, everything else to pins', () => {
    expect(lensToRenderMode('density')).toBe('heatmap');
    expect(lensToRenderMode('combined')).toBe('combined');
    expect(lensToRenderMode('pins')).toBe('pins');
    expect(lensToRenderMode('boundary')).toBe('pins');
    expect(lensToRenderMode('routes')).toBe('pins');
  });
});

describe('exploreLayersFor', () => {
  const enabled: LayerType[] = ['venues', 'events', 'hotels', 'restrooms'];
  const config: LayerType[] = ['venues', 'events', 'hotels', 'neighbourhoods', 'cities'];

  it('returns the full enabled set for pins and combined', () => {
    expect(exploreLayersFor('pins', enabled, config)).toEqual(enabled);
    expect(exploreLayersFor('combined', enabled, config)).toEqual(enabled);
  });

  it('restricts density to venues and events only', () => {
    expect(exploreLayersFor('density', enabled, config)).toEqual(['venues', 'events']);
  });

  it('seeds boundary with preset area layers', () => {
    const result = exploreLayersFor('boundary', ['neighbourhoods'], config);
    expect(result).toContain('neighbourhoods');
    expect(result).toContain('cities');
  });
});

describe('heatmapRenderPlan', () => {
  it('wants the heatmap and keeps pins for the combined mode', () => {
    expect(heatmapRenderPlan('combined', true)).toEqual({ wantHeatmap: true, hidePins: false });
  });

  it('wants the heatmap and hides pins for the pure heatmap mode', () => {
    expect(heatmapRenderPlan('heatmap', true)).toEqual({ wantHeatmap: true, hidePins: true });
  });

  it('wants no heatmap for pins mode', () => {
    expect(heatmapRenderPlan('pins', true)).toEqual({ wantHeatmap: false, hidePins: false });
  });

  it('wants no heatmap when there are no point layers, even in combined/heatmap', () => {
    expect(heatmapRenderPlan('combined', false)).toEqual({ wantHeatmap: false, hidePins: false });
    expect(heatmapRenderPlan('heatmap', false)).toEqual({ wantHeatmap: false, hidePins: true });
  });
});
