import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyOwnerAdmissionHttp(
  db,
  base,
  actor,
  target,
  apiCredential,
  verifyOwnershipSdks,
) {
  await db.exec(
    'BEGIN;RESET ROLE;ALTER TABLE public.redirect_workspace_members DROP CONSTRAINT redirect_workspace_members_pending_tenant_fence;SET LOCAL ROLE service_role;',
  );
  const workspace = randomUUID(),
    foreign = randomUUID(),
    member = randomUUID(),
    third = randomUUID(),
    thirdMember = randomUUID(),
    unverified = randomUUID(),
    unverifiedMember = randomUUID();
  async function call(
    path,
    method = 'GET',
    body,
    account = 'fixture-account-session',
    expected = 200,
    selected = workspace,
  ) {
    await db.exec('SAVEPOINT ownership_http_call');
    try {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + account,
          'X-Qg-Redirect-Workspace': selected,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (response.status >= 400) await db.exec('ROLLBACK TO SAVEPOINT ownership_http_call');
      assert.equal(response.status, expected, JSON.stringify(data));
      await db.exec('RELEASE SAVEPOINT ownership_http_call');
      return data;
    } catch (error) {
      await db.exec('ROLLBACK TO SAVEPOINT ownership_http_call');
      await db.exec('RELEASE SAVEPOINT ownership_http_call');
      throw error;
    }
  }
  try {
    await db.query(
      "INSERT INTO public.redirect_workspaces(id,name,slug,created_by) VALUES($1,'Owner HTTP registry','owner-http-registry',$3),($2,'Foreign Owner registry','foreign-owner-http-registry',$4)",
      [workspace, foreign, actor, target],
    );
    await db.query(
      'INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES($1,$2),($3,$4)',
      [workspace, actor, foreign, target],
    );
    await db.query(
      "INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'nonglobal-owner-http@example.org',now()),($2,'unverified-owner-http@example.org',NULL)",
      [third, unverified],
    );
    await db.query(
      "INSERT INTO public.redirect_workspace_members(id,workspace_id,user_id,kind,label,role) VALUES($1,$2,$3,'user','Other verified Owner candidate','member'),($4,$2,$5,'user','Non-global candidate','viewer'),($6,$2,$7,'user','Unverified candidate','member')",
      [member, workspace, target, thirdMember, third, unverifiedMember, unverified],
    );
    const beforeRoles = (await db.query('SELECT * FROM public.user_roles ORDER BY user_id')).rows;
    const owners = await call('/workspace-ownership');
    assert.equal(owners.legacy, false);
    assert.equal(owners.count, 1);
    assert.equal(owners.data[0].userId, actor);
    assert.equal(owners.data[0].canRemove, false);
    await call(
      '/workspace-ownership/' + actor,
      'DELETE',
      { version: owners.data[0].version },
      undefined,
      400,
    );
    await call('/workspace-ownership', 'GET', undefined, 'fixture-other-account-session', 403);
    await call('/workspace-ownership', 'GET', undefined, undefined, 403, foreign);
    await call('/workspace-ownership', 'GET', undefined, apiCredential, 403);
    await call('/workspace-ownership', 'GET', undefined, undefined, 400, 'not-a-workspace');
    const candidates = await call('/workspace-ownership?view=candidates&limit=1');
    assert.equal(candidates.count, 3);
    assert.equal(candidates.data.length, 1);
    assert.ok(candidates.nextCursor);
    const rest = await call(
      '/workspace-ownership?view=candidates&limit=100&after=' + candidates.nextCursor,
    );
    assert.equal(rest.data.length, 2);
    for (const row of [...candidates.data, ...rest.data])
      for (const key of ['email', 'token_hash', 'raw_user_meta_data'])
        assert.equal(key in row, false);
    await call(
      '/workspace-ownership',
      'POST',
      { memberId: member, expectedRole: 'viewer' },
      undefined,
      409,
    );
    await call(
      '/workspace-ownership',
      'POST',
      { memberId: unverifiedMember, expectedRole: 'member' },
      undefined,
      400,
    );
    const added = await call('/workspace-ownership', 'POST', {
      memberId: member,
      expectedRole: 'member',
    });
    assert.equal(added.userId, target);
    assert.equal(added.canRemove, true);
    const otherOwners = await call(
      '/workspace-ownership',
      'GET',
      undefined,
      'fixture-other-account-session',
    );
    assert.equal(otherOwners.count, 2);
    const extra = await call('/workspace-ownership', 'POST', {
      memberId: thirdMember,
      expectedRole: 'viewer',
    });
    assert.equal(extra.userId, third);
    assert.equal(
      (await db.query('SELECT count(*)::int AS n FROM public.user_roles WHERE user_id=$1', [third]))
        .rows[0].n,
      0,
    );
    await call('/workspace-ownership/' + third, 'DELETE', { version: extra.version });
    if (verifyOwnershipSdks) await verifyOwnershipSdks(workspace, thirdMember, third);
    await call(
      '/workspace-ownership/' + target,
      'DELETE',
      { version: randomUUID() },
      undefined,
      409,
    );
    await call('/session', 'GET', undefined, undefined, 403);
    await call(
      '/workspace-ownership/' + actor,
      'DELETE',
      { version: owners.data[0].version },
      'fixture-other-account-session',
    );
    await call('/workspace-ownership', 'GET', undefined, undefined, 403);
    await call(
      '/workspace-ownership/' + target,
      'DELETE',
      { version: added.version },
      'fixture-other-account-session',
      400,
    );
    assert.deepEqual(
      (await db.query('SELECT * FROM public.user_roles ORDER BY user_id')).rows,
      beforeRoles,
    );
    assert.equal(
      (await db.query('SELECT status FROM public.redirect_workspaces WHERE id=$1', [workspace]))
        .rows[0].status,
      'provisioning',
    );
    assert.equal(
      (
        await db.query('SELECT count(*)::int AS n FROM public.redirects WHERE workspace_id=$1', [
          workspace,
        ])
      ).rows[0].n,
      0,
    );
    console.log(
      'Workspace Owner admission: actual HTTP → SQL manages only an explicitly owned provisioning registry, admits verified current members with no application-admin grant, paginates sanitized metadata, denies global-admin substitution/wrong context/key/unverified/stale revision, enforces handoff/last-Owner protection and leaves business activation closed.',
    );
  } finally {
    await db.exec('ROLLBACK');
  }
}
