/**
 * @vitest-environment jsdom
 *
 * The pulse must BREATHE AND THEN STOP, and both halves need asserting.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * This loop used to be unbounded: `requestAnimationFrame` calling
 * `setPaintProperty` twice, every frame, for as long as the page was open.
 * Measured against production 2026-10-04 with the data loaded and NO
 * interaction: 1.2 / 0.4 fps idle under normal motion against 15.7 / 33.2 with
 * `reducedMotion: 'reduce'`, and MapLibre's `idle` never fired at all. The
 * calls themselves are free (fifty measured at 0 ms) — the cost is the full
 * repaint each one forces on a 79-layer style with a heatmap and ~1,374
 * features. So the only lever is how often we repaint, and the only way to
 * reach zero is to stop.
 *
 * ── Why BEHAVIOURAL and not a source scan ────────────────────────────────
 * Because the behaviour is drivable: rAF is replaceable, so the frame clock can
 * be stepped by hand and the actual paint writes counted. A source scan would
 * only prove a constant is present. The one thing a scan is right for elsewhere
 * — a call site no behaviour can observe — does not apply here.
 *
 * ── The control that makes this a test and not a rubber stamp ─────────────
 * "It stopped" is trivially satisfied by deleting the animation, which would
 * also have fixed every number above. So `it animates` asserts the ring really
 * sweeps its range, and `it settles` asserts the resting values. A change that
 * satisfies one and not the other is the regression, in both directions.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { usePulseAnimation } from '../usePulseAnimation';

const PULSE_LAYER = 'live-pulse';

type Write = { prop: string; val: number };

/** Only the three members the hook touches. `getLayer` answers for the pulse
 *  layer alone, so a hook that pulses the wrong layer writes nothing. */
function fakeMap() {
  const writes: Write[] = [];
  const map = {
    writes,
    getLayer: (id: string) => (id === PULSE_LAYER ? ({ id } as unknown) : undefined),
    setPaintProperty: (layer: string, prop: string, val: unknown) => {
      if (layer !== PULSE_LAYER) throw new Error(`unexpected layer ${layer}`);
      writes.push({ prop, val: Number(val) });
    },
  };
  return map as typeof map & maplibregl.Map;
}

/** A hand-driven frame clock. Frames carry an explicit DOMHighResTimeStamp, so
 *  elapsed time is exact rather than wall-clock dependent — which matters,
 *  because the machine this was developed on ran at load average 189-427 and
 *  delivered ~0.5 real frames per second. */
let pending = new Map<number, (t: number) => void>();
let nextId = 1;
const realRaf = globalThis.requestAnimationFrame;
const realCancel = globalThis.cancelAnimationFrame;

function frame(t: number) {
  const due = [...pending.entries()];
  pending = new Map();
  for (const [, cb] of due) cb(t);
}

beforeEach(() => {
  pending = new Map();
  nextId = 1;
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  }) as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    pending.delete(id);
  }) as typeof globalThis.cancelAnimationFrame;
});

afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
  globalThis.cancelAnimationFrame = realCancel;
});

function mount(opts: { reduced?: boolean } = {}) {
  const map = fakeMap();
  const mapRef = { current: map } as MutableRefObject<maplibregl.Map | null>;
  const pulseRafRef = { current: null } as MutableRefObject<number | null>;
  const r = renderHook(() =>
    usePulseAnimation({
      mapRef,
      mapReady: true,
      prefersReducedMotion: opts.reduced ?? false,
      pulseRafRef,
    }),
  );
  return { map, mapRef, pulseRafRef, ...r };
}

const radii = (map: { writes: Write[] }) =>
  map.writes.filter((w) => w.prop === 'circle-radius').map((w) => w.val);

describe('usePulseAnimation', () => {
  it('animates: the ring sweeps its range while the burst runs', () => {
    const { map } = mount();
    // The mount effect calls startPulse, which schedules the first frame.
    expect(pending.size).toBe(1);

    for (const t of [0, 300, 600, 900, 1200, 1500]) frame(t);

    const r = radii(map);
    // 8 + phase * 16 over one 1800 ms period.
    expect(r.length).toBeGreaterThanOrEqual(5);
    expect(Math.min(...r)).toBeCloseTo(8, 1);
    expect(Math.max(...r)).toBeGreaterThan(18);
    // Distinct values, i.e. genuinely interpolating rather than writing a
    // constant every frame.
    expect(new Set(r.map((v) => v.toFixed(3))).size).toBeGreaterThanOrEqual(5);
    // Opacity moves the opposite way, 0.35 -> 0.
    const o = map.writes.filter((w) => w.prop === 'circle-opacity').map((w) => w.val);
    expect(Math.max(...o)).toBeCloseTo(0.35, 2);
    expect(Math.min(...o)).toBeLessThan(0.1);
  });

  it('opens on the small radius rather than mid-breath', () => {
    // The old loop derived phase from the ABSOLUTE timestamp (`t % period`), so
    // a burst began wherever that landed. Phase is measured from the burst's
    // own first frame now, which this pins: a first frame at a large absolute
    // t must still start at radius 8.
    const { map } = mount();
    frame(987_654);
    expect(radii(map)[0]).toBeCloseTo(8, 3);
  });

  it('STOPS: no frame is scheduled once the burst is over', () => {
    const { map, pulseRafRef } = mount();
    frame(0);
    expect(pending.size).toBe(1); // still going

    // 3 cycles x 1800 ms.
    frame(5400);

    expect(pending.size).toBe(0);
    expect(pulseRafRef.current).toBeNull();

    // And nothing writes again, however long the page stays open.
    const after = map.writes.length;
    frame(60_000);
    frame(600_000);
    expect(map.writes.length).toBe(after);
  });

  it('settles on the resting ring, which is also the reduced-motion ring', () => {
    const { map } = mount();
    frame(0);
    frame(5400);
    const last = map.writes.slice(-2);
    expect(last).toEqual([
      { prop: 'circle-radius', val: 12 },
      { prop: 'circle-opacity', val: 0.18 },
    ]);

    // Same picture as a reduced-motion visitor, by construction.
    const reduced = mount({ reduced: true });
    expect(reduced.map.writes).toEqual(last);
  });

  it('reduced motion schedules no frames at all', () => {
    const { pulseRafRef } = mount({ reduced: true });
    expect(pending.size).toBe(0);
    expect(pulseRafRef.current).toBeNull();
  });

  it('re-pulses on demand, so new pins still draw the eye', () => {
    // `usePointLayers` calls startPulse whenever the point data changes. A
    // bounded burst is only acceptable because that re-arms it.
    const { map, result } = mount();
    frame(0);
    frame(5400);
    expect(pending.size).toBe(0);

    const settledAt = map.writes.length;
    result.current.startPulse();
    expect(pending.size).toBe(1);
    frame(5400); // first frame of the NEW burst — phase 0 again
    expect(radii(map).at(-1)).toBeCloseTo(8, 3);
    expect(map.writes.length).toBeGreaterThan(settledAt);
  });

  it('stops when the layer disappears mid-burst', () => {
    const { map, mapRef, pulseRafRef } = mount();
    frame(0);
    (mapRef.current as unknown as { getLayer: () => undefined }).getLayer = () => undefined;
    const before = map.writes.length;
    frame(600);
    expect(pulseRafRef.current).toBeNull();
    expect(pending.size).toBe(0);
    expect(map.writes.length).toBe(before);
  });

  it('cancels the frame on unmount', () => {
    const { unmount, pulseRafRef } = mount();
    frame(0);
    expect(pending.size).toBe(1);
    unmount();
    expect(pending.size).toBe(0);
    expect(pulseRafRef.current).toBeNull();
  });
});
