import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isMessagingBlockedError } from '../messagingBlocked';

const MIGRATION = 'supabase/migrations/99991791260404_dm_block_enforcement.sql';
const sql = readFileSync(MIGRATION, 'utf8')
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

describe('isMessagingBlockedError', () => {
  it('recognises the RPC refusal and the RLS refusal', () => {
    expect(isMessagingBlockedError({ code: '42501', message: 'cannot message this user' })).toBe(
      true,
    );
    expect(
      isMessagingBlockedError({
        code: '42501',
        message:
          'new row violates row-level security policy "Blocked users cannot send direct messages" for table "messages"',
      }),
    ).toBe(true);
  });

  it('does not swallow other permission errors', () => {
    expect(
      isMessagingBlockedError({ code: '42501', message: 'permission denied for table messages' }),
    ).toBe(false);
    expect(isMessagingBlockedError({ code: 'P0001', message: 'cannot message this user' })).toBe(
      false,
    );
    expect(isMessagingBlockedError(null)).toBe(false);
  });

  it('matches the strings the migration actually raises', () => {
    expect(sql).toContain("RAISE EXCEPTION 'cannot message this user' USING ERRCODE = '42501'");
    expect(sql).toContain('create policy "Blocked users cannot send direct messages"');
  });
});

describe('dm_block_enforcement migration', () => {
  it('gates message inserts with a RESTRICTIVE policy, not a permissive one', () => {
    expect(sql).toMatch(
      /create policy "Blocked users cannot send direct messages"\s+on public\.messages\s+as restrictive\s+for insert/,
    );
  });

  it('checks the block in the public RPC before creating the conversation', () => {
    const rpc = sql.slice(sql.indexOf('function public.get_or_create_direct_conversation'));
    const check = rpc.indexOf('public.is_blocked(user1_id, user2_id)');
    const create = rpc.indexOf('ensure_conversation_between(');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(create);
  });

  it('limits the send check to direct conversations', () => {
    expect(sql).toMatch(/coalesce\(c\.conversation_type, 'direct'\) = 'direct'/);
  });

  it('makes suggest_message_recipients runnable and filters blocks', () => {
    expect(sql).toContain('#variable_conflict use_column');
    expect(sql).toContain('WHERE NOT public.is_blocked(p_user, m.user_id)');
    // The postcondition must EXECUTE the function, not only grep it.
    expect(sql).toMatch(/from public\.suggest_message_recipients\(v_user, 5\)/);
  });

  it('never grants the helper to anon', () => {
    expect(sql).toMatch(
      /revoke all on function public\.dm_send_blocked\(uuid, uuid\) from public, anon/,
    );
    expect(sql).not.toMatch(/grant execute on function public\.dm_send_blocked[^;]*\banon\b/);
  });
});
