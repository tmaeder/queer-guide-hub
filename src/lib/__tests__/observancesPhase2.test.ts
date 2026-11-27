// Guards the observances phase-2 migrations and the health-script section.
// Assertions run over COMMENT-STRIPPED text: the headers quote the rules they implement,
// so a bare toContain over the raw file passes against a deleted statement.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'supabase/migrations');
const strip = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--') && !l.trimStart().startsWith('//'))
    .join('\n');
const load = (suffix: string) => {
  const f = readdirSync(dir).find((n) => n.endsWith(suffix));
  expect(f, suffix).toBeTruthy();
  return strip(readFileSync(join(dir, f!), 'utf8'));
};

describe('observance review triage source', () => {
  const sql = load('_observance_review_triage.sql');

  const decide = sql.slice(
    sql.indexOf('function api_private.observance_review_decide('),
    sql.indexOf('$fn$;', sql.indexOf('function api_private.observance_review_decide(')),
  );

  it('approve links as human, reject tombstones as human', () => {
    expect(decide).toMatch(
      /p_action = 'approve' then\s+update public\.event_observances set status = 'linked', method = 'human'/,
    );
    expect(decide).toMatch(
      /p_action = 'reject' then\s+update public\.event_observances set status = 'rejected', method = 'human'/,
    );
  });

  it('reopen keeps method=human so the linker never rewrites a human decision', () => {
    expect(decide).toMatch(
      /p_action = 'reopen' then\s+update public\.event_observances set status = 'review', method = 'human'/,
    );
    expect(decide).not.toMatch(/method = 'auto'/);
  });

  it('a decision on a missing row raises instead of reporting ok', () => {
    expect(decide).toMatch(/if v_n = 0 then\s+raise exception/);
  });

  it('triage_action delegates to the helper', () => {
    expect(sql).toMatch(
      /PERFORM api_private\.observance_review_decide\(p_item_id, p_action, p_user_id\)/,
    );
  });

  it('patches the live body instead of restating it, exactly-once anchor', () => {
    expect(sql).toMatch(/pg_get_functiondef\(\s*'api_private\.triage_action/);
    expect(sql).toMatch(/not found exactly once/);
    expect(sql).not.toMatch(/create or replace function api_private\.triage_action/i);
  });

  it('emits text, not enums, and shows only review rows', () => {
    const view = sql.slice(
      sql.indexOf('create or replace view'),
      sql.indexOf('revoke all on public.triage_src'),
    );
    expect(view).toMatch(/eo\.status::text as status/);
    expect(view).toMatch(/::numeric\(3,2\) as confidence_score/);
    expect(view).toMatch(/where eo\.status = 'review';/);
  });

  it('verify block runs the union and refuses anon', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/public\.triage_queue_signals\(\)->>'probe_ok'/);
    expect(verify).toMatch(
      /has_table_privilege\('anon', 'public\.triage_src_observance_review', 'select'\)/,
    );
    expect(verify).toMatch(/if v_n <> 1 then\s+raise exception/);
  });
});

describe('observance_signals sentinel', () => {
  const sql = load('_observance_signals.sql');

  it('is service_role only', () => {
    expect(sql).toMatch(
      /revoke all on function public\.observance_signals\(\) from public, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.observance_signals\(\) to service_role;/,
    );
  });

  it('counts upcoming coverage from linked rows inside the window only', () => {
    expect(sql).toMatch(
      /eo\.status = 'linked'\s+and e\.duplicate_of_id is null\s+and e\.start_date::date between n\.starts - n\.wb and n\.ends \+ n\.wa/,
    );
    expect(sql).toMatch(/where n\.starts between current_date and current_date \+ 14/);
  });
});

describe('check-pipeline-health observance section', () => {
  const src = strip(readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8'));
  const start = src.indexOf('rpc/observance_signals');
  const sec = src.slice(start, src.indexOf('\nif (FAILED) {', start));

  it('is wired before the terminal exit', () => {
    expect(start).toBeGreaterThan(-1);
    expect(src.lastIndexOf('process.exit(1)')).toBeGreaterThan(start);
  });

  it('hard-fails on an anon-visible gated event, with a positive control first', () => {
    expect(sec).toMatch(/events\.safety_gated=is\.true/);
    expect(sec).toMatch(/\} else if \(all\.n < 1\) \{\s+console\.error[^\n]+\n\s+FAILED = true/);
    expect(sec).toMatch(/\} else if \(leak\.n > 0\) \{\s+console\.error[^\n]+\n\s+FAILED = true/);
    expect(sec.indexOf('all.n < 1')).toBeLessThan(sec.indexOf('leak.n > 0'));
  });

  it('warns, never fails, on thin upcoming coverage', () => {
    expect(sec).toMatch(/linked_upcoming \?\? 0\) < 5\) \{\s+console\.warn/);
  });
});

describe('news observance linker', () => {
  const sql = load('_news_observances.sql');
  const linker = sql.slice(
    sql.indexOf('function public.run_observance_news_link('),
    sql.indexOf('$fn$;', sql.indexOf('function public.run_observance_news_link(')),
  );

  it('auto-links only with a TITLE match and the date window, full mode only', () => {
    expect(linker).toMatch(
      /case when v_mode = 'full' and s\.title_term is not null and s\.date_sig then 'linked' else 'review' end/,
    );
  });

  it('never rewrites a human decision or a rejection', () => {
    expect(linker).toMatch(
      /where public\.news_observances\.status = 'review'\s+and public\.news_observances\.method = 'auto'/,
    );
    const demote = linker.slice(linker.indexOf("if v_mode = 'full' then"));
    expect(demote).toMatch(/nx\.method = 'auto' and nx\.status = 'linked'/);
    expect(demote).not.toMatch(/'human'|'rejected'/);
  });

  it('candidates need a name match; date alone inserts nothing', () => {
    expect(linker).toMatch(
      /join o on \(n\.title ~\* o\.rx or coalesce\(n\.excerpt, ''\) ~\* o\.rx\)/,
    );
  });

  it('public read is linked-only and inherits news_articles RLS', () => {
    expect(sql).toMatch(
      /for select using \(status = 'linked'\s+and exists \(select 1 from public\.news_articles n where n\.id = article_id/,
    );
  });

  it('the shared decision falls through to news only when no event row matched', () => {
    const decide = sql.slice(sql.indexOf('function api_private.observance_review_decide('));
    expect(decide.indexOf('update public.event_observances')).toBeLessThan(
      decide.indexOf('update public.news_observances'),
    );
    expect(decide).toMatch(/if v_n = 0 then\s+update public\.news_observances/);
  });
});
