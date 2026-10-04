import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Venues, events and organizations were publishing other companies' logos —
 * 6,526 rows measured on prod, including one Facebook mark on 558 venues and
 * GayCities' mark on 4,169 of the 4,306 events that had a logo.
 *
 * Asserted against COMMENT-STRIPPED SQL. This migration's header quotes nearly
 * every string these tests look for, so an unstripped check would pass on the
 * prose with the statements deleted — the vacuous-assertion class this repo has
 * recorded repeatedly.
 */
const MIGRATION = '99991791144831_platform_domain_logos';

const stripSql = (s: string) =>
  s
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', `${MIGRATION}.sql`), 'utf8');
const sql = stripSql(raw);
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const flat = norm(sql);

describe('the vocabulary is a table, not a constant', () => {
  it('creates logo_platform_domains with both match modes constrained', () => {
    expect(flat).toContain('create table if not exists public.logo_platform_domains');
    expect(flat).toMatch(/check \(match_mode in \('label', 'suffix'\)\)/);
  });

  it('seeds every platform the measurement actually found', () => {
    // Each of these was attached to real rows. A vocabulary that loses one of
    // them silently restores that platform's logo to the corpus.
    for (const value of [
      "('facebook'",
      "('instagram'",
      "('tinyurl'",
      "('bit.ly'",
      "('gaycities'",
      "('misterbandb'",
      "('display-magazin.ch'",
      "('blogspot'",
      "('business.site'",
      "('negocio.site'",
      "('wix'",
      "('webnode'",
      "('free.fr'",
    ]) {
      expect(flat).toContain(value);
    }
  });

  it('is never readable by anon — it is an operational vocabulary', () => {
    expect(flat).toContain('revoke all on public.logo_platform_domains from anon');
  });
});

describe('the matcher cannot over-reach', () => {
  it('label mode compares a WHOLE label, never a substring', () => {
    // A substring match would block `facebooks.com` and `instagram-bar.com` by
    // luck rather than by rule, and would take real venue domains with it.
    expect(flat).toContain(
      "d.match_mode = 'label' and d.value = any(string_to_array(h.host, '.'))",
    );
    expect(flat).not.toMatch(/match_mode = 'label'[^)]*like '%' \|\| d\.value/);
  });

  it('suffix mode is anchored on the dot', () => {
    // Without the dot, `notbit.ly` passes as `bit.ly`.
    expect(flat).toContain("h.host = d.value or h.host like '%.' || d.value");
  });
});

describe('the repair', () => {
  it('clears logo_url on all three affected tables', () => {
    expect(flat).toContain("array['venues', 'events', 'organizations']");
    expect(flat).toContain('set logo_url = null');
  });

  it('preserves the prior url so the repair is reversible', () => {
    expect(flat).toContain("'url', t.logo_url");
    expect(flat).toContain("'reason', 'platform_website'");
  });

  it('LEAVES logo_fetched_at stamped', () => {
    // Clearing it would put every repaired row back into the producer's work
    // list, and a venue whose website is a Facebook page has no logo to find —
    // re-probing it nightly forever is the treadmill this repo has removed from
    // three other queues.
    expect(sql).not.toMatch(/logo_fetched_at\s*=\s*null/i);
  });

  it('is batched, because the search trigger fires per row', () => {
    expect(flat).toContain('limit 300');
  });
});

describe('the postconditions', () => {
  it('assert the REACHED state, not the rows this migration happened to touch', () => {
    // Counting own updates turns a concurrent repair that got there first into a
    // `db push` abort on main, which blocks every migration queued behind it.
    expect(flat).toContain('still publishes % platform logos after the repair');
    expect(flat).toMatch(/if v_cleared <> 0 then\s*raise exception/);
  });

  it('carry a MIRROR assertion, so a sweep that cleared everything also fails', () => {
    // "No platform logos remain" is equally satisfied by deleting every logo in
    // the corpus. This is the half that notices.
    expect(flat).toContain('the repair took legitimate venue logos with it');
    expect(flat).toMatch(/if v_cleared < 3000 then/);
  });
});

describe('the sentinel', () => {
  it('reports the vocabulary size, so an empty table cannot read as a clean corpus', () => {
    expect(flat).toContain("'vocabulary_size', v_vocab");
    expect(flat).toContain("'probe_ok', true");
  });

  it('separates the zero-invariant arm from the advisory one', () => {
    expect(flat).toContain("'platform_logo_rows'");
    expect(flat).toContain("'unknown_platform_groups'");
  });

  it('bounds the unknown-platform arm at 4 domains, above the widest real operator', () => {
    // Measured: the widest legitimate multi-domain group in this corpus is three
    // (Grupo Arena; the SF AIDS Foundation's three programme sites).
    expect(flat).toMatch(/having count\(distinct .*\) >= 4/);
  });

  it('is service_role only — a DEFINER aggregate granted to authenticated is granted to everyone', () => {
    expect(flat).toContain(
      'revoke all on function public.logo_platform_signals() from public, anon, authenticated',
    );
    expect(flat).toContain(
      'grant execute on function public.logo_platform_signals() to service_role',
    );
    expect(flat).not.toMatch(
      /grant execute on function public\.logo_platform_signals\(\) to [^;]*authenticated/,
    );
  });
});

describe('the producer refuses before it probes', () => {
  const fn = readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'enrich-logos', 'index.ts'),
    'utf8',
  );

  it('checks the platform class BEFORE calling logo.dev', () => {
    // Order is the whole point: after the probe the quota is already spent and
    // the wrong answer has already been fetched.
    const guard = fn.indexOf('platformWebsiteClass(website, platformRules)');
    const probe = fn.indexOf('await probeRealLogo(website)');
    expect(guard).toBeGreaterThan(-1);
    expect(probe).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(probe);
  });

  it('loads the vocabulary from the database, not from a constant in source', () => {
    expect(fn).toContain('loadPlatformRules(supabase)');
    expect(fn).not.toMatch(/const\s+PLATFORM_DOMAINS\s*=/);
  });

  it('reports the skips rather than absorbing them into processed', () => {
    expect(fn).toContain('platform_skipped: platformSkipped');
  });
});
