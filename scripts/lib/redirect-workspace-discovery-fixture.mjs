import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function verifyWorkspaceDiscovery(db, base, actor, otherActor) {
  await db.exec(`BEGIN; RESET ROLE;
 ALTER TABLE public.redirect_workspace_members DROP CONSTRAINT redirect_workspace_members_pending_tenant_fence;
 DO $$ DECLARE fence text; BEGIN
 SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
 IF fence IS NULL THEN RAISE EXCEPTION 'Missing activation fixture fence';END IF;
 EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
 END $$; SET LOCAL ROLE service_role;`);
  const workspace = randomUUID();
  async function request(
    path = '/workspaces',
    workspaceHeader,
    expected = 200,
    credential = 'fixture-account-session',
  ) {
    await db.exec('SAVEPOINT workspace_discovery_http');
    try {
      const response = await fetch(base + path, {
        headers: {
          Authorization: 'Bearer ' + credential,
          ...(workspaceHeader ? { 'x-qg-redirect-workspace': workspaceHeader } : {}),
        },
      });
      const data = await response.json();
      if (response.status >= 400) await db.exec('ROLLBACK TO SAVEPOINT workspace_discovery_http');
      assert.equal(response.status, expected, JSON.stringify(data));
      await db.exec('RELEASE SAVEPOINT workspace_discovery_http');
      return data;
    } catch (error) {
      await db.exec(
        'ROLLBACK TO SAVEPOINT workspace_discovery_http; RELEASE SAVEPOINT workspace_discovery_http',
      );
      throw error;
    }
  }
  try {
    const before = await request();
    await db.query(
      "INSERT INTO public.redirect_workspaces(id,name,slug) VALUES($1,'Account discovery HTTP','account-discovery-http')",
      [workspace],
    );
    await db.query(
      'INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES($1,$2)',
      [workspace, otherActor],
    );
    assert.equal((await request('/workspaces', workspace)).currentWorkspaceId, null);
    await db.query("UPDATE public.redirect_workspaces SET status='active' WHERE id=$1", [
      workspace,
    ]);
    assert.equal((await request()).count, before.count);
    const owned = await request('/workspaces', workspace, 200, 'fixture-other-account-session');
    assert.equal(owned.currentWorkspaceId, workspace);
    assert.equal(owned.data.find((item) => item.id === workspace).role, 'owner');
    const member = (
      await db.query(
        "INSERT INTO public.redirect_workspace_members(workspace_id,user_id,kind,label,role) VALUES($1,$2,'user','HTTP workspace reader','viewer') RETURNING id",
        [workspace, actor],
      )
    ).rows[0].id;
    for (const role of ['member', 'viewer', 'billing']) {
      await db.query('UPDATE public.redirect_workspace_members SET role=$2 WHERE id=$1', [
        member,
        role,
      ]);
      const listed = await request('/workspaces', workspace);
      assert.equal(listed.currentWorkspaceId, workspace);
      assert.equal(listed.data.find((item) => item.id === workspace).role, role);
    }
    assert.equal((await request('/workspaces?offset=100', workspace)).data.length, 0);
    await request('/workspaces?offset=-1', workspace, 400);
    await request('/workspaces?offset=0&offset=1', workspace, 400);
    await request('/workspaces', 'invalid', 400);
    await request('/workspaces', workspace, 403, 'qg_redirect_' + 'a'.repeat(64));
    assert.equal((await request('/session', workspace)).role, 'billing');
    await request('/members', workspace, 403);
    await db.query('UPDATE public.redirect_workspace_members SET active=false WHERE id=$1', [
      member,
    ]);
    assert.equal((await request('/workspaces', workspace)).currentWorkspaceId, null);
    await db.query('DELETE FROM public.user_roles WHERE user_id=$1', [actor]);
    const empty = await request();
    assert.deepEqual(empty.data, []);
    assert.equal(empty.count, 0);
    assert.equal(empty.currentWorkspaceId, null);
    console.log(
      'Account workspace discovery HTTP: explicit Owner and all member roles, global-admin isolation, provisioning/stale grants, empty account, page/selection validation and private/key denial pass.',
    );
  } finally {
    await db.exec('ROLLBACK');
  }
}
