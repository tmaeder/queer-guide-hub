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

// ─────────────────────────────────────────────────────────────────────────────
// Second layer (99991791179135): the domain is the entity's own, the IMAGE is junk.

const MIGRATION2 = '99991791179135_logo_denied_marks';
const raw2 = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', `${MIGRATION2}.sql`),
  'utf8',
);
const flat2 = norm(stripSql(raw2));

describe('the denied-mark layer', () => {
  it('keys on the content hash, which is the identity of the BYTES', () => {
    // R2 is content-addressed, so two rows sharing this hash are provably
    // showing the same picture — that is what made the defect provable and what
    // makes a single denial cover every domain that produced it.
    expect(flat2).toContain(
      "select substring(coalesce(p_logo_url, '') from 'img\\.queer\\.guide/logos/([0-9a-f]{64})')",
    );
  });

  it('constrains the key to a real sha256', () => {
    expect(flat2).toMatch(/check \(sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  });

  it('denies every mark that was read by hand, with its label', () => {
    for (const [sha, label] of [
      ['8bd7d2723083724e7e473263d5d3ea976e001ad3333b6c6cf2c02ae783b2bf02', 'WordPress'],
      ['b32861f915ceff23135281d3c663e29e3d17fe316053150f27839bbcb939de17', 'HugeDomains'],
      ['475a092f7f969a365778034744343c3942f79279e2c58ee65c41db9065a6bc94', 'Wix'],
      ['b35d6b8246da05c8586ca6447eb677a478dad1bd0862122d3c344839e33c17e2', 'Sedo'],
      ['03bb306a0ca821d48b99cac728a80ab9c8b04353454228d05d4ce193355b87ea', 'bare rainbow flag'],
    ] as const) {
      expect(flat2).toContain(`'${sha}', '${label}'`);
    }
  });

  it('repairs venues and events, and NOT organizations', () => {
    // Organizations store logos per-UUID in Supabase storage rather than
    // content-addressed in R2, so their bytes have no shared identity to key on.
    // A named gap, not an oversight.
    expect(flat2).toContain("array['venues', 'events']");
    expect(flat2).not.toContain("array['venues', 'events', 'organizations']");
  });

  it('keeps the mirror assertion, so a sweep that cleared everything also fails', () => {
    expect(flat2).toContain('the repair took legitimate venue logos with it');
    expect(flat2).toMatch(/if v_n < 5000 then/);
  });

  it('adds denied_mark_rows as a SECOND zero-invariant without losing the first', () => {
    expect(flat2).toContain("'denied_mark_rows'");
    expect(flat2).toContain("'platform_logo_rows'");
    expect(flat2).toContain("'denied_mark_vocabulary_size'");
  });

  it('reports the mark hash on an advisory group, so the remedy is one INSERT', () => {
    expect(flat2).toContain("'mark', mark");
  });

  it('keeps the restated sentinel service_role only', () => {
    expect(flat2).toContain(
      'revoke all on function public.logo_platform_signals() from public, anon, authenticated',
    );
  });
});

describe('the producer refuses a denied mark', () => {
  const fn2 = readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'enrich-logos', 'index.ts'),
    'utf8',
  );

  it('checks the mark AFTER mirroring — the hash does not exist before then', () => {
    const mirror = fn2.indexOf('await mirrorLogoToR2(');
    const check = fn2.indexOf('deniedMarks.has(mark)');
    expect(mirror).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(mirror);
  });

  it('stamps the row attempted instead of leaving it on the retry path', () => {
    // A mirror failure leaves logo_fetched_at null so the row retries, which is
    // right for a transient upload error and wrong here: the image is junk every
    // time it is fetched.
    expect(fn2).toContain('} else if (!logo || deniedMark) {');
  });

  it('reports the skips', () => {
    expect(fn2).toContain('denied_mark_skipped: deniedMarkSkipped');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Third layer (99991791179157): organizations, whose logos are logo.dev monograms.

const MIGRATION3 = '99991791179157_organizations_logo_reprobe';
const flat3 = norm(
  stripSql(
    readFileSync(join(process.cwd(), 'supabase', 'migrations', `${MIGRATION3}.sql`), 'utf8'),
  ),
);

describe('the organizations re-probe', () => {
  it('adds the bookkeeping column the batch protocol needs', () => {
    // Without it a run has no way to say "examined, answer was no", so it would
    // re-probe the same rows forever.
    expect(flat3).toContain('add column if not exists logo_fetched_at timestamptz');
  });

  it('CHANGES NO LOGO — the decision belongs to the probe, not to a guess', () => {
    // Neither share count nor byte size can tell a monogram from a real logo
    // here (547 of 783 marks are singletons; the shared ones span 834 B to
    // 103 kB and include a genuine chain logo), so clearing in SQL would destroy
    // the real ones.
    expect(flat3).not.toMatch(/update\s+(public\.)?organizations\s+set\s+logo_url\s*=\s*null/i);
    expect(flat3).toContain('organization logos were modified by this migration');
  });

  it('asserts the work list is NON-EMPTY, so a green run cannot mean nothing', () => {
    expect(flat3).toContain('the work list is empty, so the schedule would be a no-op');
  });

  it('authenticates with the vault internal secret, not an invented bearer token', () => {
    // enrich-logos is gated by requireInternalOrAdmin; a bearer token produces a
    // job that fires, 401s, and still records a successful dispatch.
    expect(flat3).toContain(
      "'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')",
    );
    expect(flat3).not.toMatch(/'Authorization', 'Bearer/);
  });

  it('registers in admin_automations, which is the record', () => {
    expect(flat3).toContain("'enrich_logos_organizations'");
    expect(flat3).toContain('the enrich_logos_organizations automation was not registered');
  });
});

describe('the organizations worker', () => {
  const fn3 = readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'enrich-logos', 'index.ts'),
    'utf8',
  );

  it('clears only on an affirmative not_indexed, never on a failed probe', () => {
    expect(fn3).toContain("if (probe.outcome === 'not_indexed')");
    expect(fn3).toContain("cleared: 'logodev_monogram'");
  });

  it('aborts on unauthorized or rate_limited instead of writing rows off', () => {
    // A failed probe is absence of evidence about the row, not evidence about it.
    const w = fn3.slice(fn3.indexOf('async function reprobeLegacyOrgLogos'));
    expect(w).toMatch(
      /if \(probe\.outcome === 'unauthorized' \|\| probe\.outcome === 'rate_limited'\)/,
    );
    expect(w).toContain('aborted = probe.outcome');
  });

  it('MIGRATES a real logo to R2, which is what makes the denied-mark layer reach orgs', () => {
    const w = fn3.slice(fn3.indexOf('async function reprobeLegacyOrgLogos'));
    expect(w).toContain('await mirrorLogoToR2(probe.logo.bytes, probe.logo.contentType)');
    expect(w).toContain('migrated_to_r2: true');
  });

  it('leaves a mirror failure unstamped so it retries', () => {
    const w = fn3.slice(fn3.indexOf('async function reprobeLegacyOrgLogos'));
    expect(w).toMatch(/mirrorFailed\+\+ \/\/ left unstamped on purpose/);
  });

  it('preserves the prior url on every disposition', () => {
    const w = fn3.slice(fn3.indexOf('async function reprobeLegacyOrgLogos'));
    expect(w).toContain('prior_url: priorUrl');
  });
});
