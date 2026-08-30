import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `/admin/users` must never offer bulk delete.
 *
 * The shared data-table bulk bar issues a raw
 * `DELETE FROM <tableName> WHERE id IN (...)` via PostgREST, and AdminUsers
 * sets `tableName: 'profiles'`. That is the wrong door, not a blunt version of
 * the right one:
 *
 *   - `profiles` has NO-ACTION FK blockers (trip_members, events.created_by,
 *     venues.created_by, review_queue.resolved_by, group_invites.accepted_by)
 *     that must be cleared first — a bare delete errors on them.
 *   - the user's storage objects have no FK at all, so nothing cascades and
 *     the uploaded files survive.
 *   - `auth.users` lives in another schema; a table delete never touches it,
 *     leaving an orphaned login.
 *
 * `delete_my_account` exists precisely because that sequence is thirty
 * statements in a fixed order. Deletion now lives on the single user's detail
 * sheet behind `admin_delete_user` plus the `admin-delete-user` edge function.
 *
 * Text assertions over the source, like the sibling detailIndexableGate suite:
 * the defect is a config flag being absent, and a render test would have to be
 * written to notice an absence it was never told about.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('/admin/users offers no bulk delete', () => {
  const src = read('src/pages/admin/AdminUsers.tsx');

  it('targets the profiles table (the precondition this guard is about)', () => {
    // If this ever stops being true the rest of the suite is asserting about
    // the wrong screen, and would pass while the hole reopened elsewhere.
    expect(src).toMatch(/tableName:\s*'profiles'/);
  });

  it('sets allowBulkDelete: false', () => {
    expect(
      /allowBulkDelete:\s*false/.test(src),
      'AdminUsers must set allowBulkDelete: false — the bulk bar defaults to showing Delete',
    ).toBe(true);
  });

  it('keeps selection on, so bulk edit and export still work', () => {
    // The fix is meant to remove one button, not the whole bulk bar.
    expect(src).toMatch(/enableSelection:\s*true/);
  });
});

describe('the bulk bar honours the flag', () => {
  const bar = read('src/components/admin/data-table/DataTableBulkActions.tsx');
  const table = read('src/components/admin/data-table/AdminDataTable.tsx');

  it('DataTableBulkActions gates the Delete button on allowDelete', () => {
    expect(bar).toMatch(/allowDelete\s*=\s*true/); // default preserves behaviour elsewhere
    expect(
      /\{allowDelete && \(/.test(bar),
      'the Delete button must be wrapped in the allowDelete gate, not merely disabled',
    ).toBe(true);
  });

  it('AdminDataTable threads the config flag through', () => {
    expect(table).toMatch(/allowBulkDelete\s*=\s*true/);
    expect(table).toMatch(/allowDelete=\{allowBulkDelete\}/);
  });
});

describe('the admin deletion path exists and is gated', () => {
  const fn = read('supabase/functions/admin-delete-user/index.ts');

  it('requires a typed confirmation server-side', () => {
    // The dialog checks it too, but a client check is not a control.
    expect(fn).toMatch(/Confirmation does not match/);
  });

  it('calls the RPC as the CALLER, not with the service key', () => {
    // assert_admin_or_internal() is what authorizes this. Invoking with the
    // service role would satisfy that check unconditionally and stamp a null
    // actor on the audit row.
    expect(fn).toMatch(/userClient\.rpc\(/);
    expect(
      /const userClient = createClient\(url, anonKey/.test(fn),
      'the RPC must be called through a caller-scoped client so auth.uid() is the admin',
    ).toBe(true);
  });

  it('enumerates storage before the profile row is removed', () => {
    // For a delete the profile row is the handle the enumeration hangs off, so
    // the order is load-bearing rather than stylistic.
    const listIdx = fn.indexOf('list_my_storage_objects');
    const rpcIdx = fn.indexOf('userClient.rpc(');
    expect(listIdx).toBeGreaterThan(-1);
    expect(rpcIdx).toBeGreaterThan(-1);
    expect(listIdx).toBeLessThan(rpcIdx);
  });
});
