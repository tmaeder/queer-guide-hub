import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LINE_LABELS, VIEW_LABELS } from '../MapShell.types';
import { bulletTypeForLayer, departureStatus, departureTime } from '../chrome/railDeparture';
import { LAYER_DEFS } from '@/config/mapLayers';
import { ROUTE_BULLET_MAP } from '@/components/transit/routeBulletMap';
import type { MapPointSummary } from '../mapPoint';

const point = (over: Partial<MapPointSummary> = {}): MapPointSummary => ({
  id: '1',
  type: 'venues',
  entity: 'venue',
  line: 'M',
  name: 'Somewhere',
  lng: 0,
  lat: 0,
  color: '#111',
  featured: false,
  live: false,
  ...over,
});

describe('bulletTypeForLayer', () => {
  it('maps EVERY map layer to a real route bullet', () => {
    // The two vocabularies are plural vs singular and disagree on
    // neighbourhoods/queer_village, so this is the guard that a new layer
    // cannot silently fall through to the venue bullet.
    for (const def of LAYER_DEFS) {
      const key = bulletTypeForLayer(def.type);
      expect(ROUTE_BULLET_MAP[key], `${def.type} → ${key} is not a bullet`).toBeDefined();
    }
  });

  it('resolves the one name that string surgery cannot', () => {
    expect(bulletTypeForLayer('neighbourhoods')).toBe('queer_village');
  });
});

describe('departureTime', () => {
  it('uses the countdown for a future event', () => {
    const soon = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    expect(departureTime(point({ type: 'events', startDate: soon }))).not.toBe('—');
  });

  it('says Now for a live event rather than a countdown to the past', () => {
    expect(departureTime(point({ type: 'events', live: true }))).toBe('Now');
  });

  it('falls back to distance for places, which have no departure time', () => {
    expect(departureTime(point({ type: 'venues', distanceKm: 1.2 }))).toMatch(/\d/);
  });

  it('renders an em-dash rather than inventing a time', () => {
    // The one thing a departure board must never do is show a plausible
    // time it does not have.
    expect(departureTime(point())).toBe('—');
    expect(departureTime(point({ type: 'events' }))).toBe('—');
  });
});

describe('departureStatus', () => {
  it('ranks live above open, and marks it urgent', () => {
    expect(departureStatus(point({ type: 'events', live: true, openNow: true }))).toEqual({
      status: 'Live',
      urgent: true,
    });
  });

  it('distinguishes closed from unknown — false is not null', () => {
    expect(departureStatus(point({ openNow: false })).status).toBe('Closed');
    expect(departureStatus(point({ openNow: null })).status).toBeUndefined();
  });

  it('never marks a non-live row urgent', () => {
    // `urgent` paints a pink station dot, and a track colour must not encode
    // a state that is merely "featured".
    expect(departureStatus(point({ featured: true })).urgent).toBeUndefined();
    expect(departureStatus(point({ openNow: true })).urgent).toBeUndefined();
  });

  it('always pairs any urgency with a text label, never colour alone', () => {
    const s = departureStatus(point({ type: 'events', live: true }));
    expect(s.urgent).toBe(true);
    expect(s.status, 'urgent with no label would be colour-only (WCAG 1.4.1)').toBeTruthy();
  });
});

describe('view and line labels', () => {
  it('the i18n value and the code fallback agree', async () => {
    // Chrome renders t('map.view.<key>', { defaultValue: VIEW_LABELS[key] })
    // and t('map.lines.<L>', { defaultValue: LINE_LABELS[L] }), so en.json
    // WINS wherever it has a value. A rename applied to only one of the two is
    // invisible in the running app while looking done in the diff.
    const en = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../public/locales/en.json'), 'utf8'),
    ) as { map: { view?: Record<string, string>; lines?: Record<string, string> } };

    let compared = 0;
    for (const [key, label] of Object.entries(VIEW_LABELS)) {
      const translated = en.map.view?.[key];
      if (translated === undefined) continue; // fallback is the only source
      compared++;
      expect(translated, `map.view.${key} disagrees with VIEW_LABELS`).toBe(label);
    }
    for (const [key, label] of Object.entries(LINE_LABELS)) {
      const translated = en.map.lines?.[key];
      if (translated === undefined) continue;
      compared++;
      expect(translated, `map.lines.${key} disagrees with LINE_LABELS`).toBe(label);
    }

    // THE POSITIVE CONTROL. Every assertion above is skipped when the key is
    // absent, so a missing `map.view` block would make the whole test vacuous
    // — which is precisely the state a careless rename leaves behind.
    expect(compared, 'no label was compared — did map.view / map.lines move?').toBe(8);
  });

  it('the retired lens vocabulary is gone from en.json', () => {
    // `combined` named a view that no longer exists, and `pins`/`boundary`
    // name the old words. Leaving the block would let a stale key win over
    // the new fallback and publish "Pins" under a view called Stations.
    const en = JSON.parse(
      readFileSync(resolve(__dirname, '../../../../public/locales/en.json'), 'utf8'),
    ) as { map: Record<string, unknown> };
    expect(en.map.lens).toBeUndefined();
  });
});
