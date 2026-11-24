import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test accounts (profiles.is_test_account) are hidden from real members:
// a restrictive RLS policy covers direct reads and invoker views, and every
// SECURITY DEFINER function that lists or counts members filters them.
const sql = readFileSync(
  join(__dirname, '../../../supabase/migrations/99991795523574_hide_test_accounts.sql'),
  'utf8',
)
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

const patch = sql.slice(sql.indexOf('do $patch$'), sql.indexOf('$patch$;'));

describe('hide test accounts', () => {
  it('adds a restrictive select policy keyed on is_test_account', () => {
    expect(sql).toMatch(
      /create policy profiles_hide_test_accounts on public\.profiles\s+as restrictive\s+for select[\s\S]*?not is_test_account/,
    );
  });

  it.each([
    'member_cards',
    'people_discovery',
    'intimate_discover',
    'suggest_message_recipients',
    'cruising_presence_areas',
    'meet_member_count_for_location',
    'get_public_profile_safe',
  ])('patches %s', (fn) => {
    expect(patch).toContain(`'api_private.${fn}(`);
  });

  it('never grants users write access to the flag', () => {
    expect(sql).not.toMatch(/grant\s+(insert|update)[^;]*is_test_account/i);
  });

  it('fails the migration when an anchor is missing', () => {
    expect(patch).toMatch(/if v_n <> r\.expected then\s+raise exception/);
  });
});
