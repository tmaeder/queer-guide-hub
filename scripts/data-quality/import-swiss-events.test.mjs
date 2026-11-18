import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const importer = fileURLToPath(new URL('./import-swiss-events.mjs', import.meta.url));

test('Swiss staging preserves explicit foreign countries and separates booking from website', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'swiss-stage-test-'));
  try {
    const out = join(cwd, 'out-swiss-events');
    mkdirSync(out);
    const venues = [
      { id: 101, venue: 'Published Paris venue', country: 'FR', city: 'Paris', address: 'Rue exemple, 75001 Paris' },
      { id: 102, venue: 'Published Vienna venue', city: 'Wien', address: 'Beispielgasse, 1010 Wien' },
      { id: 103, venue: 'Published Milan venue', country: 'IT', city: 'Milano', address: 'Via esempio, 20121 Milano' },
    ];
    const events = venues.map((venue, i) => ({
      id: 1000 + i, title: `Published event ${i}`, venue,
      start_date: '2026-11-20 19:00:00', end_date: null,
      website: 'https://organizer.example/programme',
      tickets: i === 2 ? '  https://tickets.example/exact-show  ' : '',
    }));
    writeFileSync(join(out, 'dm-venues.json'), JSON.stringify(venues));
    writeFileSync(join(out, 'dm-events.json'), JSON.stringify(events));
    writeFileSync(join(out, 'gaych-events.ndjson'), '');
    // A nonmatching cache entry satisfies the existing staging preflight.
    // No record gets invented coordinates or a geocoder country fallback.
    writeFileSync(join(out, 'geo.json'), JSON.stringify({ 'unused-fixture': {} }));
    execFileSync(process.execPath, [importer, '--phase', 'stage', '--dry-run'], {
      cwd, encoding: 'utf8', timeout: 30_000, stdio: 'pipe',
    });
    const preview = JSON.parse(readFileSync(join(out, 'staged-preview.json'), 'utf8'));
    for (const entityType of ['venue', 'event']) {
      const rows = preview.find(g => g.sourceName === 'display-magazin' && g.entityType === entityType).rows;
      assert.deepEqual(rows.map(r => r.location.country), ['FR', null, 'IT']);
      assert.ok(rows.every(r => r.location.lat === null && r.location.lng === null));
    }
    const rows = preview.find(g => g.sourceName === 'display-magazin' && g.entityType === 'event').rows;
    assert.equal(rows[0].website, 'https://organizer.example/programme');
    assert.equal(rows[0].ticket_url, null);
    assert.equal(rows[2].ticket_url, 'https://tickets.example/exact-show');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
