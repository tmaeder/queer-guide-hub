import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { readFileSync as _rf } from 'node:fs';
import {
  DESTINATIONS,
  INTENT_NAV,
  INTENT_SCOPE_BIAS,
  INTENT_TRACK,
  findActiveIntent,
  BOTTOM_NAV_TABS,
  NAV_CLUSTERS,
  USER_MODES,
  USER_MODE_VALUES,
  MODE_SCOPE_BIAS,
  isIntentActive,
} from '../navigation';

const routesSrc = readFileSync(resolve(__dirname, '../../routes.tsx'), 'utf8');

describe('navigation config', () => {
  it('gives every destination a cluster that exists, and every cluster a member', () => {
    const clusterIds = NAV_CLUSTERS.map((c) => c.id);
    for (const d of DESTINATIONS) {
      expect(clusterIds).toContain(d.cluster);
    }
    for (const id of clusterIds) {
      expect(DESTINATIONS.some((d) => d.cluster === id)).toBe(true);
    }
  });

  it('has unique destination routes', () => {
    const routes = DESTINATIONS.map((d) => d.to);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('keeps modes and mode-scope bias in lockstep', () => {
    expect(USER_MODES).toHaveLength(6);
    expect(USER_MODE_VALUES).toHaveLength(6);
    expect(USER_MODES.map((m) => m.value).sort()).toEqual([...USER_MODE_VALUES].sort());
    for (const mode of USER_MODE_VALUES) {
      expect(MODE_SCOPE_BIAS[mode]).toBeDefined();
      expect(MODE_SCOPE_BIAS[mode].length).toBeGreaterThan(0);
    }
  });
});

describe('INTENT_NAV', () => {
  it('has six intents with unique ids and routes', () => {
    // Six is the ceiling: the desktop row is one flex line shared with the
    // search field across 11 locales, and every label is held to <=11 chars
    // below. A seventh needs a different layout, not a seventh entry.
    expect(INTENT_NAV).toHaveLength(6);
    expect(new Set(INTENT_NAV.map((i) => i.id)).size).toBe(6);
    expect(new Set(INTENT_NAV.map((i) => i.to)).size).toBe(6);
  });

  it('never uses a 2-letter first path segment', () => {
    // stripLocale() in src/lib/locale.ts is /^\/(?:[a-z]{2}\/)?/ and strips ANY
    // two-letter leading segment, not just supported locales. A `/go` intent
    // would be silently rewritten to `/` by every consumer of stripLocale —
    // header active state, MobileBottomNav, RouteFade, getSubmitCta — with no
    // error anywhere. Breadcrumbs would keep working (they use a stricter
    // stripLocale), which makes it even harder to spot.
    for (const intent of INTENT_NAV) {
      const firstSegment = intent.to.replace(/^\//, '').split('/')[0];
      expect(firstSegment.length, `${intent.to} has a 2-letter first segment`).toBeGreaterThan(2);
    }
  });

  it('declares a route in src/routes.tsx for every intent', () => {
    for (const intent of INTENT_NAV) {
      const relative = intent.to.replace(/^\//, '');
      expect(
        routesSrc.includes(`path="${relative}"`),
        `${intent.to} has no route declared in src/routes.tsx`,
      ).toBe(true);
    }
  });

  it('lights the mobile Explore tab for every intent route', () => {
    const explore = BOTTOM_NAV_TABS.find((t) => t.id === 'explore');
    expect(explore).toBeDefined();
    for (const intent of INTENT_NAV) {
      expect(
        explore!.activePrefixes.some((p) => intent.to === p || intent.to.startsWith(`${p}/`)),
        `${intent.to} does not light the Explore tab`,
      ).toBe(true);
    }
  });

  it('carries a label and a subtitle key for every intent', () => {
    for (const intent of INTENT_NAV) {
      expect(intent.labelKey).toMatch(/^header\.intents\./);
      expect(intent.subtitleKey).toMatch(/^header\.intents\./);
      expect(intent.fallback.length).toBeGreaterThan(0);
      // The desktop row is a single flex line shared with the search box across
      // 11 locales; long labels wrap and break the masthead.
      expect(
        intent.fallback.length,
        `"${intent.fallback}" is too long for the row`,
      ).toBeLessThanOrEqual(11);
    }
  });

  it('matches active state by path prefix, not by exact equality', () => {
    const travelling = INTENT_NAV.find((i) => i.id === 'travelling')!;
    expect(isIntentActive(travelling, '/travel')).toBe(true);
    expect(isIntentActive(travelling, '/travel/book')).toBe(true);
    expect(isIntentActive(travelling, '/city/berlin')).toBe(true);
    expect(isIntentActive(travelling, '/rights')).toBe(false);

    const goingOut = INTENT_NAV.find((i) => i.id === 'going-out')!;
    expect(isIntentActive(goingOut, '/going-out')).toBe(true);
    expect(isIntentActive(goingOut, '/venues/some-bar')).toBe(true);
    // Prefix matching must not fire on a mere string prefix of a longer segment.
    expect(isIntentActive(goingOut, '/venues-archive')).toBe(false);
  });

  it('is imported by every surface that renders DESTINATIONS', () => {
    // The defect class this guards is "a surface renders the browse layer
    // alone". It is not hypothetical: after the Intent Router shipped, the
    // header rendered INTENT_NAV while SearchPopoverEmpty — the site's
    // highest-frequency discovery surface (⌘K on desktop, the entire header
    // row on mobile) — still rendered only DESTINATIONS, i.e. only the
    // content-type model the router replaced. Two models were taught at once.
    //
    // Source-level, deliberately: no render test can catch a NEW surface that
    // forgets the intent layer, because the defect is an absence.
    const srcRoot = resolve(__dirname, '../..');
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '__tests__') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(full) || /\.(test|spec)\.tsx?$/.test(full)) continue;
        // The config module itself declares both; skip it.
        if (full === resolve(srcRoot, 'config/navigation.ts')) continue;
        const src = readFileSync(full, 'utf8');
        if (!/\bDESTINATIONS\b/.test(src)) continue;
        if (!/\bINTENT_NAV\b/.test(src)) offenders.push(full.slice(srcRoot.length + 1));
      }
    };
    walk(srcRoot);

    expect(
      offenders,
      `these render the browse layer without the intent layer above it:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('assigns each browse route to at most one intent', () => {
    // Two intents claiming the same prefix would light both entries at once.
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const intent of INTENT_NAV) {
      for (const prefix of intent.activePrefixes) {
        const prior = seen.get(prefix);
        if (prior) collisions.push(`${prefix}: ${prior} and ${intent.id}`);
        else seen.set(prefix, intent.id);
      }
    }
    expect(collisions).toEqual([]);
  });
});

describe('INTENT_SCOPE_BIAS', () => {
  // searchTaxonomy is the only source of legal scope ids. A typo here does not
  // throw — it silently biases the discovery panel toward a type that matches
  // nothing, so the tiles quietly go generic. That is exactly the failure this
  // whole change exists to remove, so it is asserted rather than trusted.
  const taxonomy = _rf(resolve(__dirname, '../../lib/searchTaxonomy.ts'), 'utf8');
  const legalIds = new Set([...taxonomy.matchAll(/id: '([a-z_]+)'/g)].map((m) => m[1]));

  it('covers every intent', () => {
    for (const intent of INTENT_NAV) {
      expect(INTENT_SCOPE_BIAS[intent.id], `${intent.id} has no scope bias`).toBeDefined();
      expect(INTENT_SCOPE_BIAS[intent.id].length).toBeGreaterThan(0);
    }
    expect(Object.keys(INTENT_SCOPE_BIAS).sort()).toEqual(INTENT_NAV.map((i) => i.id).sort());
  });

  it('only names real searchTaxonomy ids', () => {
    const bogus: string[] = [];
    for (const [id, scopes] of Object.entries(INTENT_SCOPE_BIAS)) {
      for (const scope of scopes) if (!legalIds.has(scope)) bogus.push(`${id}: ${scope}`);
    }
    expect(bogus, 'these scope ids do not exist in searchTaxonomy').toEqual([]);
  });
});

describe('INTENT_TRACK', () => {
  const TRACKS = ['pink', 'blue', 'green', 'yellow'] as const;

  it('assigns a line to every intent and to nothing else', () => {
    expect(Object.keys(INTENT_TRACK).sort()).toEqual(INTENT_NAV.map((i) => i.id).sort());
  });

  it('only names real tracks', () => {
    for (const [id, track] of Object.entries(INTENT_TRACK)) {
      expect(TRACKS, `${id} is on an unknown line`).toContain(track);
    }
  });

  it('puts at least one intent on each of the four lines', () => {
    // The homepage draws all four tracks. A line with no station on it is a
    // stripe of colour that leads nowhere.
    for (const track of TRACKS) {
      expect(
        Object.values(INTENT_TRACK),
        `no intent rides the ${track} line`,
      ).toContain(track);
    }
  });
});

describe('findActiveIntent', () => {
  it('resolves a route to the intent that owns it', () => {
    expect(findActiveIntent('/going-out')?.id).toBe('going-out');
    expect(findActiveIntent('/venues/some-bar')?.id).toBe('going-out');
    expect(findActiveIntent('/city/berlin')?.id).toBe('travelling');
    expect(findActiveIntent('/community/groups')?.id).toBe('meet');
  });

  it('returns undefined off an intent route, so the mode fallback applies', () => {
    expect(findActiveIntent('/settings')).toBeUndefined();
    expect(findActiveIntent('/')).toBeUndefined();
  });
});
