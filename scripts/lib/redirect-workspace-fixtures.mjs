import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
// This fixture runs only in the isolated migrated database. The rollback restores
// every activation fence; no second workspace is enabled by the product migration.
export async function verifyRedirectWorkspaceMembershipHttp(db, request, owner) {
  const paths = [
    '/members',
    '/tokens',
    '/folders',
    '/tags',
    '/templates',
    '/invitations',
    '/access-requests?view=review',
  ];
  const before = new Map();
  for (const path of paths) before.set(path, (await request(path)).count);
  const inboxBefore = (
    await request('/invitations/received', 'GET', undefined, 'fixture-other-account-session')
  ).count;
  await db.exec('BEGIN');
  async function call(...args) {
    await db.exec('SAVEPOINT workspace_http_call');
    try {
      const result = await request(...args);
      if ((args[4] ?? 200) >= 400) await db.exec('ROLLBACK TO SAVEPOINT workspace_http_call');
      await db.exec('RELEASE SAVEPOINT workspace_http_call');
      return result;
    } catch (error) {
      await db.exec('ROLLBACK TO SAVEPOINT workspace_http_call');
      await db.exec('RELEASE SAVEPOINT workspace_http_call');
      throw error;
    }
  }
  try {
    // Restore the isolated fixture's schema-owner role only for temporary DDL.
    await db.exec('RESET ROLE');
    const tables = [
      'redirect_workspace_members',
      'redirect_api_tokens',
      'redirect_link_folders',
      'redirect_link_tags',
      'redirect_utm_templates',
      'redirect_workspace_invitations',
      'redirect_access_requests',
    ];
    for (const table of tables)
      await db.exec(`ALTER TABLE public.${table} DROP CONSTRAINT ${table}_pending_tenant_fence`);
    await db.exec('SET LOCAL ROLE service_role');
    const workspace = randomUUID(),
      member = randomUUID(),
      token = randomUUID(),
      folder = randomUUID(),
      tag = randomUUID(),
      template = randomUUID(),
      invite = randomUUID(),
      access = randomUUID();
    const secret = 'qg_redirect_' + randomBytes(32).toString('hex'),
      digest = createHash('sha256').update(secret).digest('hex');
    await db.query(
      "INSERT INTO public.redirect_workspaces(id,name,slug,created_by) VALUES($1,'Foreign private HTTP workspace','http-membership-fixture',$2)",
      [workspace, owner],
    );
    await db.query(
      "INSERT INTO public.redirect_workspace_members(id,workspace_id,kind,label) VALUES($1,$2,'machine','Foreign private HTTP member')",
      [member, workspace],
    );
    await db.query(
      "INSERT INTO public.redirect_api_tokens(id,workspace_id,name,token_hash,prefix,scopes,member_id,created_by,expires_at) VALUES($1,$2,'Foreign private HTTP credential',$3,$4,ARRAY['links:read','workspace:read'],$5,$6,now()+interval '1 day')",
      [token, workspace, digest, secret.slice(0, 20), member, owner],
    );
    await db.query(
      "INSERT INTO public.redirect_link_folders(id,workspace_id,name) VALUES($1,$2,'Foreign private HTTP folder')",
      [folder, workspace],
    );
    await db.query(
      "INSERT INTO public.redirect_link_tags(id,workspace_id,name) VALUES($1,$2,'Foreign private HTTP tag')",
      [tag, workspace],
    );
    await db.query(
      "INSERT INTO public.redirect_utm_templates(id,workspace_id,name) VALUES($1,$2,'Foreign private HTTP template')",
      [template, workspace],
    );
    await db.query(
      "INSERT INTO public.redirect_workspace_invitations(id,workspace_id,email,label,role,token_hash,created_by) VALUES($1,$2,'http-invite@example.org','Foreign private HTTP invitation','viewer',$3,$4)",
      [invite, workspace, createHash('sha256').update(randomBytes(32)).digest('hex'), owner],
    );
    // Access requests require a human member; this foreign account is separate
    // from the legacy recipient so the production global-user constraint remains.
    const foreignUser = randomUUID();
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [foreignUser]);
    const human = randomUUID();
    await db.query(
      "INSERT INTO public.redirect_workspace_members(id,workspace_id,user_id,kind,label) VALUES($1,$2,$3,'user','Foreign private HTTP requester')",
      [human, workspace, foreignUser],
    );
    await db.query(
      "INSERT INTO public.redirect_access_requests(id,workspace_id,folder_id,member_id,message) VALUES($1,$2,$3,$4,'Foreign private HTTP request')",
      [access, workspace, folder, human],
    );
    for (const path of paths) {
      const page = await call(path);
      assert.equal(page.count, before.get(path), path + ' counted foreign rows');
      assert.ok(
        !JSON.stringify(page).includes('Foreign private HTTP'),
        path + ' leaked private fields',
      );
    }
    const inbox = await call(
      '/invitations/received',
      'GET',
      undefined,
      'fixture-other-account-session',
    );
    assert.equal(inbox.count, inboxBefore);
    assert.ok(!JSON.stringify(inbox).includes('Foreign private HTTP'));
    assert.equal((await call('/members/' + member, 'DELETE')).deleted, false);
    assert.equal((await call('/tokens/' + token, 'DELETE')).revoked, false);
    assert.equal((await call('/invitations/' + invite, 'DELETE')).revoked, false);
    for (const [kind, id] of [
      ['folders', folder],
      ['tags', tag],
      ['templates', template],
    ])
      await call('/' + kind + '/' + id, 'GET', undefined, undefined, 404);
    await call('/folders/' + folder, 'PATCH', { name: 'Changed foreign folder' }, undefined, 404);
    await call('/folders/' + folder, 'DELETE', undefined, undefined, 404);
    await call(
      '/access-requests/' + access,
      'PATCH',
      { action: 'approve', permission: 'edit' },
      undefined,
      404,
    );
    await call('/links', 'GET', undefined, secret, 403);
    const unchanged = await db.query(
      'SELECT (SELECT count(*) FROM public.redirect_workspace_members WHERE workspace_id=$1)::int AS members,(SELECT name FROM public.redirect_link_folders WHERE id=$2) AS folder,(SELECT revoked_at IS NULL AND last_used_at IS NULL FROM public.redirect_api_tokens WHERE id=$3) AS token,(SELECT accepted_at IS NULL AND revoked_at IS NULL FROM public.redirect_workspace_invitations WHERE id=$4) AS invitation,(SELECT status FROM public.redirect_access_requests WHERE id=$5) AS request',
      [workspace, folder, token, invite, access],
    );
    assert.deepEqual(unchanged.rows[0], {
      members: 2,
      folder: 'Foreign private HTTP folder',
      token: true,
      invitation: true,
      request: 'pending',
    });
    console.log(
      'Workspace membership isolation: actual owner HTTP -> scoped SQL hides foreign members/credentials/resources/invitations/requests; foreign IDs cannot read/change/revoke/grant or authenticate, and foreign state stays unchanged. Temporary fixture fences roll back.',
    );
  } finally {
    await db.exec('ROLLBACK');
  }
}
