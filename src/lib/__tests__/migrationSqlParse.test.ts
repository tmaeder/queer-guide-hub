import { describe, expect, it, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KNOWN_UNPARSEABLE,
  MIN_CORPUS,
  loadParser,
} from '../../../scripts/check-migration-sql.mjs';

/**
 * Guards `scripts/check-migration-sql.mjs`, which parses every migration with
 * Postgres's own grammar (libpg-query, pinned to 17.x) before it can reach prod.
 *
 * The gate exists because on 2026-09-14 a `COMMENT ON ... IS 'a' || 'b'` — a
 * 42601, since COMMENT ON takes a LITERAL — aborted `db push` on main and
 * stranded every migration queued behind it for four and a half hours. A parse
 * error is unreachable at runtime, so no test that executes logic could find it,
 * and CI's other migration checks only ever look at 14-digit versions.
 *
 * These tests run the REAL parser over the REAL corpus rather than asserting on
 * the script's source text. A source-string assertion would pass against a gate
 * that had stopped matching anything, which is the vacuous-assertion class this
 * repo keeps re-learning.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

let parse: (sql: string) => Promise<unknown>;
beforeAll(async () => {
  parse = await loadParser();
});

async function parses(sql: string): Promise<boolean> {
  try {
    await parse(sql);
    return true;
  } catch {
    return false;
  }
}

describe('migrations parse with the Postgres grammar', () => {
  it('rejects the exact defect that took main down — positive control', async () => {
    // Byte-shape of 50500101100300's original comment. Without this control a
    // parser that silently stopped matching would report a clean corpus forever.
    const broken = [
      'comment on function public.tag_disowned_prose_signals() is',
      "  'Active tags still publishing the prose a disowned entity produced. '",
      "  || 'Complements tag_wikidata_repair_regressions().';",
    ].join('\n');

    expect(await parses(broken)).toBe(false);
  });

  it('accepts the single-literal form that replaced it', async () => {
    expect(
      await parses("comment on function public.f() is 'one literal, no concatenation.';"),
    ).toBe(true);
  });

  it('does not fire on `||` inside dynamic SQL — negative control', async () => {
    // Concatenation is the normal way to interpolate an identifier into EXECUTE.
    // A gate that flagged this would be unusable, and an unusable gate gets muted.
    expect(await parses("do $$ begin execute 'select * from ' || quote_ident('t'); end $$;")).toBe(
      true,
    );
  });

  it('reads a corpus large enough for the sweep to mean something', () => {
    // An empty or mis-pathed directory reports zero defects and reads exactly
    // like a clean corpus.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThanOrEqual(MIN_CORPUS);
  });

  it('parses every migration except the recorded pre-existing six', async () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    const broken: string[] = [];

    for (const f of files) {
      if (KNOWN_UNPARSEABLE.has(f)) continue;
      if (!(await parses(readFileSync(join(MIGRATIONS, f), 'utf8')))) broken.push(f);
    }

    expect(
      broken,
      'These migrations do not parse. `supabase db push` aborts at the first one and strands every migration queued behind it — the blast radius is the whole repo, not this PR.',
    ).toEqual([]);
  });

  it('keeps the allowlist honest — every entry must still genuinely fail', async () => {
    // The list may only SHRINK. An entry whose file now parses is a stale
    // exemption, and a stale exemption is a place a real new defect can hide.
    const stale: string[] = [];

    for (const f of KNOWN_UNPARSEABLE) {
      if (await parses(readFileSync(join(MIGRATIONS, f), 'utf8'))) stale.push(f);
    }

    expect(
      stale,
      'These files now parse. Delete them from KNOWN_UNPARSEABLE in scripts/check-migration-sql.mjs.',
    ).toEqual([]);
  });

  it('documents the plpgsql blind spot rather than implying coverage', async () => {
    // The outer grammar treats `$$ ... $$` as an opaque string literal, so a
    // syntax error INSIDE a plpgsql body is NOT caught here — only the plpgsql
    // validator at CREATE FUNCTION time sees it, and that needs a live server.
    //
    // If this test ever FAILS that is good news: the parser got stronger, and
    // the "MISSES" section of the script's header must be corrected to match.
    const bodyIsNonsense =
      'create function public.g() returns void language plpgsql as $$ begin if 1 then end $$;';

    expect(await parses(bodyIsNonsense)).toBe(true);
  });
});
