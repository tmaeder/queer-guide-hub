import { describe, expect, it } from 'vitest';
import { createReliabilityAccumulator } from '../../../scripts/transit/lib/vbz-reliability.mjs';

// betriebsdatum 06.01.23 is a Friday.
const row = (soll: number, ist: number, datum = '06.01.23', linie = '4') => ({
  linie,
  betriebsdatum: '06.01.23',
  datum_von: datum,
  soll_ab_von: String(soll),
  ist_ab_von: String(ist),
});

describe('vbz-reliability', () => {
  it('counts after-midnight departures (next calendar date) toward the previous service day', () => {
    const acc = createReliabilityAccumulator();
    acc.add(row(1800, 1800, '07.01.23')); // 00:30 Saturday calendar, Friday service
    expect(acc.result(1)).toEqual([
      { route_ref: '4', day_class: 'friday', on_time_share: 1, samples: 1 },
    ]);
  });

  it('treats leaving >1 min early as NOT on time, and up to 3 min late as on time', () => {
    const acc = createReliabilityAccumulator();
    const late = 23 * 3600 + 600;
    acc.add(row(late, late - 120)); // 2 min early -> stranded risk
    acc.add(row(late, late + 170)); // 2m50 late -> fine
    acc.add(row(late, late + 400)); // 6m40 late -> not on time
    acc.add(row(late, late));
    expect(acc.result(1)[0].on_time_share).toBe(0.5);
  });

  it('ignores daytime departures and lines below the sample floor', () => {
    const acc = createReliabilityAccumulator();
    acc.add(row(12 * 3600, 12 * 3600));
    expect(acc.result(1)).toEqual([]);
    acc.add(row(23 * 3600, 23 * 3600));
    expect(acc.result(2)).toEqual([]);
  });
});
