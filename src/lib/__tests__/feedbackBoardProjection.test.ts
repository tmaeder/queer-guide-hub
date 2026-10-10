/**
 * Guards the public feedback board's projection.
 *
 * Context, because the shape of this is a reaction to what was measured: before
 * migration 99991791633461, `public.community_submissions` was
 * `anon=awd/postgres` — INSERT, UPDATE, DELETE and NO SELECT — so the
 * long-standing `community_submissions_anon_read_feedback` policy
 * (SELECT to anon USING content_type='feedback', unqualified) had no privilege
 * behind it and was INERT: anon reads returned 42501. There was no anonymous
 * leak. That migration OPENS the board through `feedback_board_v` and narrows
 * anon to the single INSERT it performs.
 *
 * Two things make these assertions look odd, and both are deliberate:
 *
 *  1. They are scoped to the CREATE VIEW statement, not to the file. The
 *     migration's header quotes the rejected denylist form
 *     (`data - 'contact_email' - 'context'`) and its `COMMENT ON VIEW` names
 *     `handoffs` / `replies` / `review_notes` in a real SQL string literal — so a
 *     whole-file "must not contain" check is satisfied by the prose while the
 *     guard is gone. Comments are stripped and the view body is extracted first.
 *
 *  2. They read the LATEST migration that defines the view, not a pinned
 *     filename. `CREATE OR REPLACE VIEW` means a future migration can widen the
 *     allowlist without ever re-running 99991791633461's postconditions, which
 *     is the only way this can regress silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const VIEW = 'feedback_board_v';

/** The three keys the board is allowed to publish. */
const ALLOWED_DATA_KEYS = ['title', 'description', 'category'] as const;

/**
 * Every `data` key that exists on a feedback row and must never be published.
 * Measured inventory at the time of writing (rows / rows holding an email):
 *   contact_email 155/0 (JSON null on all 155) · context 154/4 (all 4 inside
 *   context.network_failures) · screenshot_url 154/0 · handoffs 5/5 (every row,
 *   staff handoff trail) · replies 1/0 · _last_source 1/0 · review_notes 1/0
 * Plus base-table columns that must not reach the view at all.
 */
const MUST_NEVER_PUBLISH = [
  'contact_email',
  'context',
  'screenshot_url',
  'handoffs',
  'replies',
  'review_notes',
  '_last_source',
  'ip_address',
  'user_agent',
  'submitted_by',
  'reviewer_notes',
  'submitter_metadata',
] as const;

/** Strip `--` line comments so prose cannot satisfy a structural assertion. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function latestMigrationDefining(view: string): { file: string; sql: string } {
  const matches = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => {
      const body = stripComments(readFileSync(join(MIGRATIONS, f), 'utf8'));
      return new RegExp(`create\\s+(or\\s+replace\\s+)?view\\s+(public\\.)?${view}\\b`, 'i').test(
        body,
      );
    })
    .sort();
  // Positive control: an empty match set also satisfies every "must not contain"
  // assertion below, which would turn this file green while nothing is checked.
  expect(
    matches.length,
    `no migration defines the view ${view} — these assertions would be vacuous`,
  ).toBeGreaterThan(0);
  const file = matches[matches.length - 1];
  return { file, sql: readFileSync(join(MIGRATIONS, file), 'utf8') };
}

/** The CREATE VIEW statement only, comments stripped. */
function viewBody(sql: string): string {
  const stripped = stripComments(sql);
  const start = stripped.search(
    new RegExp(`create\\s+(or\\s+replace\\s+)?view\\s+(public\\.)?${VIEW}\\b`, 'i'),
  );
  expect(start, 'could not locate the CREATE VIEW statement').toBeGreaterThanOrEqual(0);
  const end = stripped.indexOf(';', start);
  expect(end, 'CREATE VIEW statement is unterminated').toBeGreaterThan(start);
  return stripped.slice(start, end);
}

describe('feedback_board_v — the allowlist projection', () => {
  const { file, sql } = latestMigrationDefining(VIEW);
  const body = viewBody(sql);
  const stripped = stripComments(sql);

  it('builds data from an explicit allowlist, never a denylist', () => {
    // jsonb_build_object cannot publish a key added to the base row next month.
    // `data - 'contact_email' - 'context'` publishes every key nobody enumerated
    // — which at the time of writing was handoffs (5 rows, all 5 carrying an
    // email address), replies and review_notes, i.e. staff correspondence.
    expect(body).toMatch(/jsonb_build_object\s*\(/i);
    expect(body, `${file}: the view must not subtract keys from data`).not.toMatch(/data\s*-\s*'/i);
    expect(body, `${file}: the view must not use jsonb #- either`).not.toMatch(/#-/);
  });

  it('publishes exactly title, description and category', () => {
    const keys = [...body.matchAll(/'([a-z_]+)'\s*,\s*cs\.data->>'([a-z_]+)'/gi)].map((m) => ({
      out: m[1],
      src: m[2],
    }));
    expect(keys.map((k) => k.out).sort()).toEqual([...ALLOWED_DATA_KEYS].sort());
    // The published name must match the source key — a projection that renames
    // `contact_email` to `title` would pass the list check above.
    for (const k of keys) expect(k.src).toBe(k.out);
  });

  it('never names a field that must stay unpublished', () => {
    for (const field of MUST_NEVER_PUBLISH) {
      expect(body, `${file}: the view must not reference ${field}`).not.toContain(field);
    }
  });

  it('never selects the whole data jsonb', () => {
    // Every mention of cs.data must be a key extraction, never the column itself.
    for (const m of body.matchAll(/cs\.data(.{0,3})/g)) {
      expect(m[1], `bare cs.data in ${file} would publish the whole payload`).toMatch(/^\s*->/);
    }
  });

  it('re-asserts its own row filters, because it bypasses RLS', () => {
    // The view is deliberately NOT security_invoker (anon has no SELECT on the
    // base table, and a column grant cannot redact inside a jsonb), so this
    // WHERE is the only guard. Nothing upstream is filtering.
    expect(body).toMatch(/content_type\s*=\s*'feedback'/i);
    expect(body).toMatch(/is_spam/i);
    expect(body).toMatch(/duplicate_of\s+is\s+null/i);
  });

  it('stays non-security_invoker', () => {
    // Flipping this fails closed (anon gets 42501, board empties) rather than
    // open, but it silently breaks the page — so it is asserted here too.
    expect(body).not.toMatch(/security_invoker/i);
  });

  it('is readable by anon and authenticated', () => {
    expect(stripped).toMatch(
      new RegExp(`grant\\s+select\\s+on\\s+(public\\.)?${VIEW}\\s+to\\s+anon`, 'i'),
    );
  });

  it('aggregates vote_count instead of granting anon access to feedback_votes', () => {
    // feedback_votes carries user_id — who voted for what. A count discloses no
    // identity; the grant would.
    expect(body).toMatch(/count\(\*\)\s*from\s+public\.feedback_votes/i);
    expect(stripped, 'anon must never be granted SELECT on feedback_votes').not.toMatch(
      /grant\s+select\s+on\s+(table\s+)?public\.feedback_votes\s+to\s+[^;]*anon/i,
    );
  });
});

describe('99991791633461 — anon privilege narrowing', () => {
  const { file, sql } = latestMigrationDefining(VIEW);
  const stripped = stripComments(sql);

  it('drops the inert anon SELECT policy', () => {
    // It gated nothing (no SELECT privilege behind it) but it is the latent
    // hazard: one `GRANT SELECT ON community_submissions TO anon` away from
    // being the full-row leak this change was mistakenly opened to fix.
    expect(stripped).toMatch(
      /drop\s+policy\s+if\s+exists\s+community_submissions_anon_read_feedback/i,
    );
  });

  it('revokes every write anon cannot use, and keeps the one it can', () => {
    const revoke = stripped.match(
      /revoke\s+([^;]*?)\s+on\s+public\.community_submissions\s+from\s+anon/i,
    );
    expect(revoke, `${file}: expected a REVOKE on community_submissions FROM anon`).toBeTruthy();
    const privs = revoke![1].toLowerCase();
    for (const p of ['update', 'delete', 'truncate', 'trigger', 'references', 'maintain']) {
      expect(privs, `${p} must be revoked from anon`).toContain(p);
    }
    // INSERT is the feedback form (policy community_submissions_anon_insert_feedback)
    // — the single anon write this system performs. Revoking it breaks submission.
    expect(privs, 'anon must keep INSERT on community_submissions').not.toMatch(/\binsert\b/);
    expect(privs, 'anon must not be granted SELECT here either').not.toMatch(/\bselect\b/);
  });

  it('strips anon entirely from the audit and vote tables', () => {
    expect(stripped).toMatch(
      /revoke\s+all\s+on\s+public\.community_submissions_audit\s+from\s+anon/i,
    );
    expect(stripped).toMatch(/revoke\s+all\s+on\s+public\.feedback_votes\s+from\s+anon/i);
  });

  it('asserts its end state so a db push re-apply is a no-op', () => {
    // END STATE, never a delta: a `rows affected = 1` style check fails the
    // moment the migration is re-applied, and db push re-applies on merge.
    expect(stripped).toMatch(/do\s+\$verify\$/i);
    expect(stripped).toMatch(/expected exactly "a"/i);
    expect(stripped).toMatch(/outside the allowlist/i);
    expect(stripped).toMatch(/anon cannot read feedback_board_v/i);
  });

  it('does NOT assert that the view holds no email-shaped string', () => {
    // Deliberate. A user typing their own address into a public feedback
    // description is the board working as designed; asserting its absence would
    // abort `db push` for the whole repo over one submission. The structural
    // allowlist above is what cannot be breached by user data.
    expect(stripped).not.toMatch(/\[A-Za-z0-9\._%\+-\]\+@/);
  });
});

describe('the client reads the view, not the base table', () => {
  const fetchers = readFileSync(join(process.cwd(), 'src/hooks/usePageFetchers.ts'), 'utf8');
  const fn = fetchers.slice(
    fetchers.indexOf('export async function fetchFeedbackBoardItems'),
    fetchers.indexOf('export async function toggleFeedbackVote'),
  );

  it('fetchFeedbackBoardItems targets feedback_board_v', () => {
    expect(fn.length, 'could not isolate fetchFeedbackBoardItems').toBeGreaterThan(0);
    expect(fn).toMatch(/\.from\('feedback_board_v'/);
    expect(fn, 'the board must not read community_submissions directly').not.toMatch(
      /\.from\('community_submissions'/,
    );
  });

  it('selects only the view columns', () => {
    const select = fn.match(/\.select\('([^']*)'\)/);
    expect(select).toBeTruthy();
    expect(
      select![1]
        .split(',')
        .map((s) => s.trim())
        .sort(),
    ).toEqual(['data', 'feedback_status', 'id', 'submitted_at', 'vote_count'].sort());
  });

  it('does not re-filter rows the view already filters', () => {
    // Harmless but misleading: it reads as though the client were the guard.
    expect(fn).not.toMatch(/content_type/);
    expect(fn).not.toMatch(/is_spam/);
    expect(fn).not.toMatch(/duplicate_of/);
  });
});

describe('the public row type and the board', () => {
  const card = readFileSync(
    join(process.cwd(), 'src/components/feedback/FeedbackCard.tsx'),
    'utf8',
  );
  const board = readFileSync(join(process.cwd(), 'src/pages/FeedbackBoard.tsx'), 'utf8');

  it('FeedbackItem declares no unpublished field', () => {
    const iface = card.slice(
      card.indexOf('export interface FeedbackItem'),
      card.indexOf('interface FeedbackCardProps'),
    );
    expect(iface.length).toBeGreaterThan(0);
    for (const field of MUST_NEVER_PUBLISH) {
      expect(iface, `FeedbackItem must not declare ${field}`).not.toContain(field);
    }
    expect(iface).toMatch(/vote_count\?:\s*number/);
  });

  it('gates the vote-count hook on a signed-in user', () => {
    // feedback_votes is anon=a with no SELECT, so for anon this hook 42501'd on
    // every board load and contributed nothing the view does not already supply.
    expect(board).toMatch(/user\s*\?\s*items\.map\(\(i\)\s*=>\s*i\.id\)\s*:\s*\[\]/);
  });

  it('falls back to the view aggregate for counts', () => {
    expect(board).toMatch(/votesMap\[item\.id\]\?\.count\s*\?\?\s*item\.vote_count\s*\?\?\s*0/);
    // No render site may read the raw map for a count any more, or anon sees 0.
    expect(board).not.toMatch(/votesMap\[(item|selectedItem)\.id\]\?\.count\s*\?\?\s*0/);
  });
});
