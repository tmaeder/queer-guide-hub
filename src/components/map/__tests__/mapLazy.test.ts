import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * The CONSOLIDATION baselines, and the measurable half of "every discovery map
 * uses the shared engine".
 *
 * The decisive argument for consolidation is infrastructural rather than
 * aesthetic: only `hooks/useMapInstance.ts` installs `installBasemapFallback`,
 * the donut `setMissingStyleImageResolver`, `loadGlyphImages` and (now)
 * `exposeMapForDebug`. Every other map constructs MapLibre directly, so a
 * tile-host failure white-screens it with no failover and no glyphs.
 *
 * These are DESCENDING baselines. They must only ever go DOWN — a cap that
 * only moves up stops being a guard, which is what `check-bundle-shape.mjs`'s
 * own `lucide: 130` comment says about itself. A number that falls is a
 * failure here, telling you to lock the improvement in.
 */

const SRC = resolve(__dirname, '../../..');

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === 'node_modules' || name === '__tests__') continue;
        walk(full);
        continue;
      }
      if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
    }
  };
  walk(SRC);
  return out;
}

const FILES = sourceFiles();

/**
 * The one hook allowed to construct a map, plus the worker shim, which
 * references the constructor only to set `maplibregl.workerUrl`.
 */
const ALLOWED_CONSTRUCTORS = ['components/map/hooks/useMapInstance.ts', 'config/maplibreWorker.ts'];

describe('map consolidation baselines', () => {
  it('scanned a plausible number of source files', () => {
    // THE POSITIVE CONTROL. A broken walk returns [], and every baseline below
    // then reads 0 — which looks like a fully consolidated codebase.
    expect(FILES.length).toBeGreaterThan(500);
  });

  it('bespoke `new maplibregl.Map` call sites: 14 and FALLING', () => {
    const offenders = FILES.filter((f) => {
      const rel = relative(SRC, f);
      if (ALLOWED_CONSTRUCTORS.includes(rel)) return false;
      return /new maplibregl\.Map\b/.test(readFileSync(f, 'utf8'));
    }).map((f) => relative(SRC, f));

    // Measured at the time of writing. Target 0: every one of these is a map
    // with no basemap failover and no glyph images.
    expect(
      offenders.length,
      `bespoke map constructions changed:\n  ${offenders.join('\n  ')}\n` +
        'DOWN is the goal — lower the baseline. UP means a new map was built ' +
        'outside useMapInstance, which has no basemap failover.',
    ).toBeLessThanOrEqual(14);

    // Named, so the next reader knows the work list rather than a number.
    // `EntityMap`, `WorldChoropleth`, `AtlasMap` and `UmamiMap` are deliberate
    // specialists (see the plan's §3.5) and still need the three infra
    // installs; the rest are consolidation targets.
    expect(offenders).toContain('components/events/EventsMapView.tsx');
    expect(offenders).toContain('components/hotels/HotelsMap.tsx');
    expect(offenders).toContain('components/trips/TripMap.tsx');
  });

  it('static maplibre importers: 34 and FALLING', () => {
    const importers = FILES.filter((f) => /from 'maplibre-gl'/.test(readFileSync(f, 'utf8'))).map(
      (f) => relative(SRC, f),
    );
    expect(
      importers.length,
      'static maplibre-gl importers changed — DOWN is the goal.\n' +
        'Each one pulls the maplibre chunk into whatever graph reaches it, ' +
        'which is why the page-level entries go through lazy()/lazyRetry().',
    ).toBeLessThanOrEqual(34);
  });
});

describe('the infra installs live in exactly one place', () => {
  const instance = readFileSync(resolve(SRC, 'components/map/hooks/useMapInstance.ts'), 'utf8');

  it('useMapInstance installs all four', () => {
    // Not an aesthetic claim: these are the four things a map silently lacks
    // when it is built anywhere else.
    expect(instance).toContain('installBasemapFallback');
    expect(instance).toContain('setMissingStyleImageResolver');
    expect(instance).toContain('loadGlyphImages');
    expect(instance).toContain('exposeMapForDebug');
  });

  it('nothing else installs the basemap fallback', () => {
    // If a second file did, "only useMapInstance has failover" would stop
    // being the argument for consolidation — and the degraded-mode e2e would
    // stop being a proof that every surface routes through it.
    const others = FILES.filter((f) => {
      const rel = relative(SRC, f);
      if (rel === 'components/map/hooks/useMapInstance.ts') return false;
      if (rel === 'components/map/basemapFallback.ts') return false; // the definition
      return /installBasemapFallback\s*\(/.test(readFileSync(f, 'utf8'));
    }).map((f) => relative(SRC, f));

    expect(
      others,
      'a second installer appeared — either consolidate it or update the ' +
        'claim that useMapInstance is the only one',
    ).toEqual([]);
  });
});

describe('the debug handle is gated', () => {
  const dbg = readFileSync(resolve(SRC, 'components/map/mapDebug.ts'), 'utf8');

  it('attaches nothing without the DEV flag or the localStorage opt-in', () => {
    // A handle attached unconditionally is a new production surface. The gate
    // is the same one `mapDebug` already uses.
    const fn = dbg.slice(dbg.indexOf('export function exposeMapForDebug'));
    expect(fn).toContain('import.meta.env.DEV');
    expect(fn).toContain("localStorage.getItem('qg:debug:map')");
    expect(fn).toContain('__qgMap');
  });

  it('is assigned INSIDE the gate, not before it', () => {
    // The assertion above is satisfied by a function that attaches the handle
    // and then checks the flag.
    const fn = dbg.slice(dbg.indexOf('export function exposeMapForDebug'));
    expect(fn.indexOf('import.meta.env.DEV')).toBeLessThan(fn.indexOf('__qgMap'));
  });
});
