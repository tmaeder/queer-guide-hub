/**
 * The one fact `useMapInstance` cannot be allowed to forget: data-layer
 * initialisation is NOT gated on MapLibre's `load` event.
 *
 * ── Why this is a source test and not a behavioural one ───────────────────
 * The behaviour is already covered twice over, and neither cover reaches the
 * call site:
 *
 *  • `mapStyleReady.test.ts` proves `applyWhenStyleReady` applies as soon as
 *    the style is mutable and never drops the update — against a fake map.
 *  • `e2e/map-shell-degraded.spec.ts` proves stations plot with every
 *    `.pbf`/`.mvt` aborted — against a real MapLibre, which is the only thing
 *    that can reproduce the actual defect, because `load` not firing is a
 *    property of MapLibre's render-frame latch that no fake reproduces. A mock
 *    map fires whatever `load` the test tells it to.
 *
 * What is left unguarded is whether `useMapInstance` ROUTES through the gate,
 * and that spec is in **no `e2e-pr.yml` list** — it runs only in the nightly,
 * against production. So a refactor that moves the body back inside
 * `map.on('load')` would ship green and be reported the next morning against a
 * merged commit. This is the PR-time half.
 *
 * ── The defect, measured against production 2026-10-04 ────────────────────
 * `/map?lat=52.5200&lng=13.4050&z=12` with every vector tile aborted, same
 * camera and geo stub as the healthy arm, one variable:
 *
 *   tiles alive → load 1 (t≈22.9s), idle 1, moveend 0
 *   tiles dead  → load 0, idle 0, moveend 0, error 9
 *
 * `load` never fires when the visible tiles fail. Everything the data layer is
 * gated on lived inside `map.on('load')` — `mapRef.current`, `setMapReady`,
 * glyphs, the initial viewport fetch — so a tile outage produced a map with
 * `sources: ["protomaps"]` and not one data layer.
 *
 * Assertions run over COMMENT-STRIPPED source. The hook's own block comment
 * quotes `map.on('load')` and `isStyleLoaded()` repeatedly in order to explain
 * why neither is used, so an unstripped scan passes while the statement is
 * back — the vacuous-assertion trap.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolved from `process.cwd()`, NOT `__dirname`.
 *
 * `__dirname` works under vitest's transform and does not exist in plain ESM —
 * and on a loaded machine vitest cannot start a worker at all ("Timeout waiting
 * for worker to respond", which it reports as `no tests` with a NON-ZERO exit,
 * indistinguishable from a passing mutation unless the harness checks). A
 * cwd-relative path lets this file also be driven by a plain-node shim, which
 * is what the mutation pass for this guard uses. Both runners start at the
 * repo root.
 */
const SRC = resolve(process.cwd(), 'src/components/map/hooks/useMapInstance.ts');
const raw = readFileSync(SRC, 'utf8');

/** Block and line comments removed; string literals are left alone. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * The body of `initialiseMap`, by BRACE MATCHING rather than by slicing to the
 * next landmark.
 *
 * The first draft sliced from `const initialiseMap` to the
 * `applyWhenStyleReady(...)` call — and a mutation that moved
 * `setMapReady(true)` OUT of the function to just above that call SURVIVED,
 * because the injected line still fell inside the slice. A slice bounded by a
 * later landmark is not the function.
 */
function initialiseMapBody(): string {
  const start = code.indexOf('const initialiseMap');
  if (start === -1) return '';
  const open = code.indexOf('{', start);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(open, i + 1);
  }
  return '';
}

describe('useMapInstance style gate', () => {
  it('has source to scan, and the comment stripper left the code behind', () => {
    // POSITIVE CONTROL. Every assertion below is about what `code` does or does
    // not contain, and an empty `code` satisfies all the negative ones.
    expect(raw.length).toBeGreaterThan(5_000);
    expect(code).toContain('export function useMapInstance');
    expect(code).toContain('new maplibregl.Map(');
    // And the stripper really did strip: the hook explains `load` at length.
    expect(raw).toContain("map.on('load')");
    expect(code).not.toContain("map.on('load')");
  });

  it('initialises through applyWhenStyleReady, not a load listener', () => {
    expect(code).toContain('applyWhenStyleReady(map, initialiseMap)');
    // The regression this file exists for: any live `load` listener at all.
    expect(code).not.toMatch(/\bmap\s*\.\s*on\s*\(\s*['"]load['"]/);
    expect(code).not.toMatch(/\bmap\s*\.\s*once\s*\(\s*['"]load['"]/);
  });

  it('does not gate on isStyleLoaded(), which mapStyleReady.ts forbids', () => {
    /**
     * `mapStyleReady.ts`'s header rules the public method out by name: it also
     * requires every tile manager to be loaded, so it "can sit false while a
     * basemap source retries… trade a crash for a permanently blank map".
     * Measured with tiles dead: `style._loaded` is true at 4.7 s while
     * `isStyleLoaded()` is still false. A gate on the public method is both
     * later and tiles-dependent — one hung-rather-than-aborted tile from inert.
     */
    expect(code).not.toContain('isStyleLoaded');
  });

  it('publishes mapRef and mapReady from the gated path only', () => {
    // Both are the latched facts every ungated layer hook
    // (usePointLayers/useAreaLayers/useHeatmapLayer) treats as proof the style
    // will take an addSource. Each must appear exactly once, inside
    // initialiseMap — a second assignment elsewhere is a second, ungated door.
    expect(code.match(/mapRef\.current\s*=\s*map\b/g) ?? []).toHaveLength(1);
    expect(code.match(/setMapReady\(true\)/g) ?? []).toHaveLength(1);

    const body = initialiseMapBody();
    // Positive control for the brace matcher: an empty body satisfies nothing
    // below, but a SHORT one would satisfy the two `toMatch`es by accident only
    // if they are really in it, so assert the matcher found a real function.
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/mapRef\.current\s*=\s*map\b/);
    expect(body).toContain('setMapReady(true)');

    // …and the gate is handed that function, after it is defined.
    const init = code.indexOf('const initialiseMap');
    const gate = code.indexOf('applyWhenStyleReady(map, initialiseMap)');
    expect(init).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(init);
  });

  it('disposes the gate on teardown', () => {
    // applyWhenStyleReady returns a disposer; dropping it leaves a `styledata`
    // listener on a removed map.
    expect(code).toMatch(/styleReadyRef\.current\s*=\s*applyWhenStyleReady/);
    expect(code).toMatch(/styleReadyRef\.current\?\.\(\)/);
  });
});
