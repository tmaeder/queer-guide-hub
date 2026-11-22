import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991795368571_inbox_counts_dm_dedupe_realtime.sql over comment-stripped
 * SQL (the header quotes the defects it removes).
 */
const sql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '99991795368571_inbox_counts_dm_dedupe_realtime.sql',
  ),
  'utf8',
)
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

describe('inbox counts / dm dedupe / realtime migration', () => {
  it('drops dm and message notifications from the feed alert lane', () => {
    expect(sql).toContain("AND n.type NOT IN (''dm'', ''message'')");
  });

  it('excludes dm notifications from the alert count too', () => {
    const counts = sql.slice(sql.indexOf('api_private.get_inbox_unread_counts(p_user uuid)'));
    expect(counts).toMatch(/n\.type not in \('dm', 'message'\)/);
  });

  it('never counts muted or archived chats', () => {
    expect(sql).toMatch(
      /coalesce\(cp\.is_archived, false\) = false\s+and coalesce\(cp\.is_muted, false\) = false/,
    );
  });

  it('clears dm notifications when a conversation is read', () => {
    expect(sql).toMatch(/after update of last_read_at on public\.conversation_participants/);
    expect(sql).toMatch(/n\.type = 'dm'\s+and n\.related_id = new\.conversation_id/);
  });

  it('keeps the counts RPC away from anon', () => {
    expect(sql).toMatch(
      /revoke all on function public\.get_inbox_unread_counts\(uuid\) from public, anon;/,
    );
  });

  it('never lets a failed ping fail the write', () => {
    const ping = sql.slice(sql.indexOf('api_private.inbox_ping(p_users uuid[])'));
    expect(ping).toMatch(/exception when others then\s+raise warning/);
  });

  it('only lets the owner join their inbox topic', () => {
    expect(sql).toMatch(/realtime\.topic\(\) = 'inbox:' \|\| \(select auth\.uid\(\)\)::text/);
  });
});
