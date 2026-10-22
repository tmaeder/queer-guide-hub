import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { aggregateToGrid } from './grid.ts';

Deno.test('groups nearby vehicles into one ~100 m cell and counts them', () => {
  const r = aggregateToGrid(
    [
      { lat: 47.37001, lon: 8.54101, provider_id: 'lime' },
      { lat: 47.37009, lon: 8.54109, provider_id: 'lime' },
      { lat: 47.38, lon: 8.55, provider_id: 'voi' },
    ],
    { lime: 'Bike', voi: 'E-Bike' },
  );
  assertEquals(r.vehicles, 3);
  assertEquals(r.cells.length, 2);
  assertEquals(r.cells.find((c) => c[2] === 2)!.slice(0, 2), [47.3705, 8.54175]);
  assertEquals(r.providers, ['lime', 'voi']);
});

Deno.test('drops cars, mopeds, disabled and reserved vehicles', () => {
  const r = aggregateToGrid(
    [
      { lat: 47.37, lon: 8.54, provider_id: 'mobility' },
      { lat: 47.37, lon: 8.54, provider_id: 'scoot' },
      { lat: 47.37, lon: 8.54, provider_id: 'lime', is_disabled: true },
      { lat: 47.37, lon: 8.54, provider_id: 'lime', is_reserved: 1 },
      { lat: 47.37, lon: 8.54, provider_id: 'lime' },
    ],
    { mobility: 'E-Car', scoot: 'E-Moped', lime: 'Bike' },
  );
  assertEquals(r.vehicles, 1);
  assertEquals(r.providers, ['lime']);
});

Deno.test('keeps cargo bikes — "CargoBike" contains "car" and once dropped Velospot entirely', () => {
  const r = aggregateToGrid(
    [
      { lat: 47.37, lon: 8.54, provider_id: 'velospot' },
      { lat: 47.37, lon: 8.54, provider_id: 'nextbike' },
    ],
    { velospot: 'CargoBike', nextbike: 'E-CargoBike' },
  );
  assertEquals(r.vehicles, 2);
});
