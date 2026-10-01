import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve('supabase/migrations/20261001202631_contextual_rights_news.sql'),
  'utf8',
);

describe('get_rights_news migration contract', () => {
  it('is an invoker-rights, read-only public RPC with explicit grants', () => {
    expect(sql).toMatch(/create or replace function public\.get_rights_news/i);
    expect(sql).toMatch(/security invoker/i);
    expect(sql).toMatch(/revoke all on function public\.get_rights_news[\s\S]+from public/i);
    expect(sql).toMatch(/grant execute[\s\S]+to anon, authenticated/i);
    expect(sql).not.toMatch(/security definer/i);
  });

  it('keeps every publication gate in the server query', () => {
    expect(sql).toMatch(/a\.archived_at is null/i);
    expect(sql).toMatch(/a\.duplicate_of_id is null/i);
    expect(sql).toMatch(/a\.quality_status = 'passed'/i);
    expect(sql).toMatch(/a\.content is not null/i);
  });

  it('ranks local topic matches first and broader rights fallback last', () => {
    expect(sql).toMatch(/when 1 then 'topic-local-recent'/i);
    expect(sql).toMatch(/when 2 then 'topic-global-recent'/i);
    expect(sql).toMatch(/when 3 then 'topic-global-older'/i);
    expect(sql).toMatch(/else 'rights-general-recent'/i);
  });

  it('collapses story clusters and caps repeated publishers', () => {
    expect(sql).toMatch(/partition by coalesce\(c\.story_id, c\.id\)/i);
    expect(sql).toMatch(/case when c\.publisher_rank <= 2 then 0 else 1 end/i);
  });
});
