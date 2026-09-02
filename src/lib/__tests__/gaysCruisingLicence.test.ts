import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * gays-cruising.com (Keyup Studio S.L., Valencia) carries an EXPRESS
 * prohibition, not merely an absent licence. Condiciones de Uso §5 forbids
 * reproducing, copying, reselling or exploiting any part of the service without
 * consent given expressly and in writing; §12 repeats it for site contents;
 * §17 puts disputes under Spanish law in Valencia.
 *
 * Two separate things follow, and they fail differently:
 *
 * 1. PROSE. The spot write-ups are their USERS' authored text. Identifiers,
 *    coordinates, a name and a link back are facts; the write-ups are
 *    expression. The parser's return type therefore has no prose field, and
 *    these tests make adding one a visible, deliberate act rather than a
 *    convenience during a later edit — the failure mode the drgay.ch and
 *    Kinktionary guards were written for.
 *
 * 2. CONSENT. Until Keyup Studio supply the §5 written consent, nothing may
 *    fetch from the origin on a schedule. The parser is offline work and is
 *    safe to have; a registered cron is not. The last test fails the build if a
 *    migration schedules this source, so consent has to arrive before the
 *    switch can be flipped, not after.
 */

const ROOT = join(__dirname, '..', '..', '..');
const PARSER = join(ROOT, 'supabase', 'functions', '_shared', 'gays-cruising-parse.ts');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const parser = readFileSync(PARSER, 'utf8');

/** The exported record type, which is the contract the rest of the code sees. */
const spotInterface = (() => {
  const i = parser.indexOf('export interface CruisingSpot');
  expect(i, 'CruisingSpot interface not found').toBeGreaterThan(-1);
  return parser.slice(i, parser.indexOf('}', i));
})();

describe('gays-cruising licence boundary', () => {
  it('the spot type carries no prose field', () => {
    // Any of these would be their users' writing rather than a fact.
    for (const banned of [
      'description',
      'summary',
      'notes',
      'body',
      'text',
      'comment',
      'review',
      'excerpt',
    ]) {
      expect(
        spotInterface.toLowerCase(),
        `CruisingSpot must not carry a "${banned}" field — that is user prose, not a fact`,
      ).not.toMatch(new RegExp(`\\b${banned}\\??\\s*:`));
    }
  });

  it('the parser never reads description off the page', () => {
    // The source's JSON-LD does carry a description. Reading it into a variable
    // is the step before storing it, so ban the read, not just the field.
    expect(parser).not.toMatch(/\bplace\.description\b/);
    expect(parser).not.toMatch(/\[['"]description['"]\]/);
    // meta description is the drgay.ch trap: structured-looking, still prose.
    expect(parser).not.toMatch(/name=["']description["']/i);
  });

  it('never emits an empty-string country', () => {
    // Not a licence rule but the same class of silent corruption:
    // venues_country_iso2_check allows NULL and rejects ''. An unmapped token
    // must be undefined. Guarding the shape because a `?? ''` is a one-character
    // edit that CI would otherwise only catch at commit time.
    expect(parser).not.toMatch(/countryCode\s*[:=][^,\n]*\?\?\s*['"]{2}/);
    expect(parser).toMatch(/COUNTRY_TOKENS\[/);
  });

  it('no migration schedules this source before written consent exists', () => {
    // A parser is offline work. A cron is a crawler. §5 gates the second.
    const offenders = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => {
        const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
        return (
          /gays[-_]cruising/i.test(sql) &&
          /(cron\.schedule|admin_automations|ingestion_sources)/i.test(sql)
        );
      });
    expect(
      offenders,
      'a migration registers gays-cruising as a scheduled source; §5 requires express written consent first',
    ).toEqual([]);
  });

  it('the edge function, if present, is not enabled in config', () => {
    // verify_jwt=false is what lets a cron reach it. Absent function = fine.
    const fn = join(ROOT, 'supabase', 'functions', 'source-gays-cruising');
    if (!existsSync(fn)) return;
    const cfg = readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8');
    expect(cfg).not.toMatch(/\[functions\.source-gays-cruising\]/);
  });
});
