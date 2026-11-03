import { describe, it, expect } from 'vitest';
import { exitsOf, flatStops, routeTo } from '../branchLineModel';
import { LOOP, STATIONS } from '../../figures/consentFlow/data';

describe('BranchLine route rules', () => {
  it('a main station is reached through every station above it', () => {
    expect([...routeTo(STATIONS, 'checkin')]).toEqual([
      'start',
      'asked',
      'clear-yes',
      'capacity',
      'checkin',
    ]);
  });

  it('an off-ramp end is reached down the main line to its question, then the branch', () => {
    expect([...routeTo(STATIONS, 'not-a-yes')]).toEqual([
      'start',
      'asked',
      'clear-yes',
      'not-a-yes',
    ]);
  });

  it('no selection, or an unknown id, lights nothing', () => {
    expect(routeTo(STATIONS, null).size).toBe(0);
    expect(routeTo(STATIONS, 'nope').size).toBe(0);
  });

  it('the loop is never part of a route', () => {
    // Reaching "go" does not pass back through the check-in a second time.
    const route = routeTo(STATIONS, 'go');
    expect(route.has('stop-now')).toBe(false);
  });

  it('flattens to reading order: each station, then its off-ramp end', () => {
    expect(flatStops(STATIONS).map((s) => s.id)).toEqual([
      'start',
      'asked',
      'not-asked',
      'clear-yes',
      'not-a-yes',
      'capacity',
      'checkin',
      'stop-now',
      'go',
    ]);
  });

  it('every question has an off-ramp, and the line ends in a loop, not a verdict', () => {
    for (const s of STATIONS.filter((x) => x.kind === 'question')) {
      expect(s.branch).toBeDefined();
    }
    expect(exitsOf(STATIONS, LOOP, 'go')).toEqual([
      { labelFallback: 'And again, any time', to: 'Still yes, right now?' },
    ]);
    expect(exitsOf(STATIONS, LOOP, 'stop-now')).toEqual([]);
  });
});
