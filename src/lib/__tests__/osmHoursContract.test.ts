import { describe, expect, it } from 'vitest';
import { parseOsmOpeningHours } from '../../../supabase/functions/_shared/osm-venue-fields';
import { hoursDisplay, isOpenNow } from '@/utils/openingHours';

/**
 * The producer and the consumer of `venues.hours` live on opposite sides of the
 * repo and in different runtimes: `parseOsmOpeningHours` runs in a Deno edge
 * function, `isOpenNow` runs in the browser. Nothing else makes them agree.
 *
 * This test imports BOTH and feeds one into the other. That matters more than it
 * looks: the alternative is a Deno test asserting a shape and a vitest test
 * asserting a hand-written fixture of that shape, which validates a retyped copy
 * rather than the artifact. `osm-venue-fields.ts` has no imports and touches no
 * Deno globals, so vitest can load it directly and the round trip is real.
 *
 * The specific thing being guarded: `close` may exceed 24:00 and is encoded
 * `"+HHMM"`. If the producer ever emitted `"0200"` for a bar that shuts at 2am,
 * every overnight venue in the corpus would read as CLOSED all evening — the
 * data would look populated and be wrong, which is worse than the 97.7% empty it
 * replaces.
 */

/** Local Monday 20:00 — inside an evening slot, before any midnight rollover. */
const MON_20 = new Date(2026, 8, 7, 20, 0, 0); // 2026-09-07 is a Monday
/** Local Tuesday 01:00 — after midnight, inside a slot that opened Monday. */
const TUE_01 = new Date(2026, 8, 8, 1, 0, 0);
/** Local Tuesday 10:00 — after the overnight slot has ended. */
const TUE_10 = new Date(2026, 8, 8, 10, 0, 0);

describe('OSM opening_hours round-trips into the venue hours consumer', () => {
  it('the fixture dates are the weekdays the assertions assume', () => {
    // Positive control. getDay(): 0=Sun..6=Sat. If these drift, every assertion
    // below silently tests a different day than it claims to.
    expect(MON_20.getDay()).toBe(1);
    expect(TUE_01.getDay()).toBe(2);
    expect(TUE_10.getDay()).toBe(2);
  });

  it('an evening slot reads open during the evening', () => {
    const hours = parseOsmOpeningHours('Mo-Th 17:00-23:00');
    expect(isOpenNow(hours, MON_20)).toBe(true);
    expect(isOpenNow(hours, TUE_10)).toBe(false);
  });

  it('an overnight slot is still open after midnight — the +HHMM contract', () => {
    const hours = parseOsmOpeningHours('Mo-Th 17:00-02:00');
    expect(hours!.regular[0].close.startsWith('+')).toBe(true);
    expect(isOpenNow(hours, MON_20)).toBe(true);
    // 01:00 Tuesday belongs to Monday's slot. This is the assertion that fails
    // if the producer stops encoding the rollover.
    expect(isOpenNow(hours, TUE_01)).toBe(true);
    expect(isOpenNow(hours, TUE_10)).toBe(false);
  });

  it('24/7 reads open at every probe', () => {
    const hours = parseOsmOpeningHours('24/7');
    for (const t of [MON_20, TUE_01, TUE_10]) expect(isOpenNow(hours, t)).toBe(true);
  });

  it('a closing time of 24:00 covers the last minute of the day', () => {
    const hours = parseOsmOpeningHours('Mo 10:00-24:00');
    expect(isOpenNow(hours, new Date(2026, 8, 7, 23, 59, 0))).toBe(true);
    expect(isOpenNow(hours, TUE_01)).toBe(false);
  });

  it('a day the venue is shut reads closed, not unknown', () => {
    // false and null are different answers: false renders "Closed", null renders
    // nothing. A venue with known hours must never fall back to silence.
    const hours = parseOsmOpeningHours('Sa-Su 12:00-18:00');
    expect(isOpenNow(hours, MON_20)).toBe(false);
  });

  it('a rejected value yields null, and the consumer treats that as unknown', () => {
    const hours = parseOsmOpeningHours('Apr-Oct Mo-Su 10:00-18:00');
    expect(hours).toBeNull();
    expect(isOpenNow(hours, MON_20)).toBeNull();
  });

  it('display survives to the consumer verbatim', () => {
    const raw = 'Mo-Fr 09:00-17:00; PH off';
    expect(hoursDisplay(parseOsmOpeningHours(raw))).toBe(raw);
  });

  it('the shape carries only the keys the consumer declares', () => {
    // open_now is precomputed and stale by design; openingHours.ts recomputes
    // instead. Emitting it would reintroduce the frozen value it works around.
    expect(Object.keys(parseOsmOpeningHours('24/7')!).sort()).toEqual(['display', 'regular']);
  });
});
