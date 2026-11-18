import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const importer = fileURLToPath(new URL('./import-patroc.mjs', import.meta.url));

for (const TZ of ['UTC', 'Pacific/Honolulu']) {
  test(`Patroc staging preserves local instants and isolates invalid dates under ${TZ}`, () => {
    const cwd = mkdtempSync(join(tmpdir(), 'patroc-stage-test-'));
    try {
      const out = join(cwd, 'out-patroc');
      mkdirSync(out);
      const base = {
        title: 'Pitti', city_slug: 'florence', startDate: '2027-01-12',
        startTime: '09:00', endDate: '2027-01-15', endTime: '16:00',
        cityLine: null, websites: [], venueName: 'Fortezza da Basso',
      };
      const rows = [
        { ...base, id: 'valid-winter' },
        { ...base, id: 'ambiguous', city_slug: 'cologne', startDate: '2026-10-25', startTime: '02:30', endDate: null, endTime: null },
        { ...base, id: 'date-only', startTime: null, endTime: null },
        { ...base, id: 'mixed-reversed', startTime: '00:30', endDate: '2027-01-11', endTime: null },
      ];
      writeFileSync(join(out, 'venues.ndjson'), '');
      writeFileSync(join(out, 'events.ndjson'), rows.map(JSON.stringify).join('\n') + '\n');
      execFileSync(process.execPath, [importer, '--phase', 'stage', '--dry-run'], {
        cwd, env: { ...process.env, TZ }, encoding: 'utf8', timeout: 30_000, stdio: 'pipe',
      });
      const preview = JSON.parse(readFileSync(join(out, 'staged-preview.json'), 'utf8'));
      assert.equal(preview.events.length, 2);
      assert.equal(preview.events[0].start_date, '2027-01-12T08:00:00.000Z');
      assert.equal(preview.events[0].end_date, '2027-01-15T15:00:00.000Z');
      assert.equal(preview.events[0].metadata.source_local_dates.start_time, '09:00');
      assert.equal(preview.events[0].metadata.source_local_dates.timezone, 'Europe/Rome');
      assert.equal(preview.events[1].start_date, '2027-01-12');
      assert.equal(preview.events[1].end_date, '2027-01-15');
      const errors = readFileSync(join(out, 'event-date-errors.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(errors.length, 2);
      assert.equal(errors[0].source_id, 'ambiguous');
      assert.equal(errors[0].start_time, '02:30');
      assert.match(errors[0].error, /Ambiguous Patroc local time/);
      assert.equal(errors[1].source_id, 'mixed-reversed');
      assert.match(errors[1].error, /precedes/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
