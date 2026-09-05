import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `backfill-city-timezone.mjs` fills and corrects `cities.timezone` from
 * coordinates. Two of its rules were arrived at by measurement and are easy to
 * "simplify" back into damage:
 *
 * 1. ZONE NAMES ARE COMPARED AS CLOCKS, NOT STRINGS. Measured against the 2,195
 *    cities that already carry a timezone, a naive string comparison reported
 *    98.13% agreement; 29 of those "disagreements" were IANA aliases and links
 *    denoting the identical clock (`Europe/Kyiv` vs `Europe/Kiev`,
 *    `America/Nuuk` vs `America/Godthab`, `Europe/Vatican` vs `Europe/Rome`,
 *    `Asia/Brunei` vs `Asia/Kuching`). Comparing clocks instead took the true
 *    figure to 99.45% — and note the direction: in the Kyiv and Nuuk cases the
 *    STORED value is the modern canonical name and the lookup returns the
 *    deprecated alias, so "correcting" them would have been a downgrade.
 *
 * 2. SAME-REGION DISAGREEMENTS ARE NEVER AUTO-CORRECTED. Of the 11 that survive
 *    clock-equivalence, roughly nine are ones where the STORED value is right
 *    and the raster lookup is wrong — border towns and small countries
 *    (Kinshasa, the Chittagong Hill Tracts, Didymóteicho, Ciudad Juárez, which
 *    has had its own zone since 2022). Only a cross-CONTINENT disagreement is
 *    unambiguous, because a city cannot be on two continents.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'data-quality', 'backfill-city-timezone.mjs');
const src = readFileSync(SCRIPT, 'utf8');

describe('city timezone backfill — comparison rule', () => {
  it('compares clocks rather than zone strings', () => {
    expect(src).toMatch(/function sameClock/);
    expect(src).toMatch(/offsetSignature/);
    expect(src).toMatch(/timeZoneName: 'longOffset'/);
    // The equality arm must consult sameClock, not just `===`.
    expect(src).toMatch(/sameClock\(got, c\.timezone\)/);
  });

  it('probes several instants so DST rules are compared too', () => {
    // A single instant makes two zones that merely share an offset today look
    // identical, e.g. Europe/London and Europe/Lisbon in winter.
    const probes = src.match(/Date\.UTC\(\d{4}, \d+, \d+, \d+\)/g) ?? [];
    expect(probes.length).toBeGreaterThanOrEqual(2);
  });

  it('never auto-corrects a same-region disagreement', () => {
    // Only crossRegion is fed to the correcting path.
    expect(src).toMatch(/const changes = v\.crossRegion/);
    expect(src).not.toMatch(/const changes = v\.sameRegion/);
  });

  it('refuses to write below a stated agreement bar', () => {
    expect(src).toMatch(/const BAR = 99/);
    expect(src).toMatch(/refusing to write: agreement/);
  });

  it('guards each write on the value it believes is there', () => {
    // So a row changed between read and write is skipped, not clobbered.
    expect(src).toMatch(/timezone=is\.null/);
    expect(src).toMatch(/timezone=eq\./);
  });

  it('writes an audit row before the update, under one batch id', () => {
    const auditAt = src.indexOf('external_correction_audit');
    const patchAt = src.indexOf("method: 'PATCH'");
    expect(auditAt).toBeGreaterThan(-1);
    expect(patchAt).toBeGreaterThan(-1);
    // If the process dies mid-batch the audit row is the only thing that makes
    // the change reversible, so it must not be the step that gets skipped.
    expect(auditAt).toBeLessThan(patchAt);
    expect(src).toMatch(/rollback_external_correction_batch/);
  });

  it('excludes the tmp- placeholder city cohort and Null Island', () => {
    expect(src).toMatch(/slug=not\.like\.tmp-\*/);
    expect(src).toMatch(/lat === 0 && lon === 0/);
  });

  it('pages reads rather than trusting PostgREST default limits', () => {
    expect(src).toMatch(/const PAGE = 1000/);
    expect(src).toMatch(/offset=\$\{offset\}/);
  });
});

/**
 * The claim "these names denote the same clock" is verified against this
 * runtime's own tz database rather than asserted, so the test fails if the
 * equivalence technique stops working.
 */
describe('clock equivalence holds in this runtime', () => {
  const PROBES = [
    Date.UTC(2026, 0, 15, 12),
    Date.UTC(2026, 3, 15, 12),
    Date.UTC(2026, 6, 15, 12),
    Date.UTC(2026, 9, 15, 12),
  ];
  const sig = (tz: string) =>
    PROBES.map(
      (ms) =>
        new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
          .formatToParts(new Date(ms))
          .find((p) => p.type === 'timeZoneName')?.value ?? '?',
    ).join('|');

  it.each([
    ['Europe/Kyiv', 'Europe/Kiev'],
    ['America/Nuuk', 'America/Godthab'],
    ['Europe/Vatican', 'Europe/Rome'],
  ])('%s and %s are the same clock', (a, b) => {
    expect(sig(a)).toBe(sig(b));
  });

  it.each([
    // Half-hour offset — the Bangladesh border case the lookup gets wrong.
    ['Asia/Dhaka', 'Asia/Kolkata'],
    // Different continents entirely — the Novosibirsk case.
    ['Europe/Berlin', 'Asia/Novosibirsk'],
  ])('%s and %s are NOT the same clock', (a, b) => {
    expect(sig(a)).not.toBe(sig(b));
  });
});
