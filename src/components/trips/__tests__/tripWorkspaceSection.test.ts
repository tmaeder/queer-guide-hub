import { describe, expect, it } from 'vitest';
import { getTripWorkspaceSection } from '../tripWorkspaceSection';

describe('getTripWorkspaceSection', () => {
  it('accepts known URL sections', () => {
    expect(getTripWorkspaceSection(new URLSearchParams('section=plan'), 'countdown')).toBe('plan');
    expect(getTripWorkspaceSection(new URLSearchParams('section=prepare'))).toBe('prepare');
    expect(getTripWorkspaceSection(new URLSearchParams('section=together'))).toBe('together');
  });

  it('falls back according to trip phase', () => {
    expect(getTripWorkspaceSection(new URLSearchParams(), 'seed')).toBe('plan');
    expect(getTripWorkspaceSection(new URLSearchParams(), 'countdown')).toBe('prepare');
    expect(getTripWorkspaceSection(new URLSearchParams(), 'memory')).toBe('together');
  });

  it('ignores invalid URL values', () => {
    expect(getTripWorkspaceSection(new URLSearchParams('section=unknown'), 'plan')).toBe('plan');
  });
});
