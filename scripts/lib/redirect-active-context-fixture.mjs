import assert from 'node:assert/strict';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
export async function verifyActiveWorkspaceContext(db, base, actor, otherActor) {
  await db.exec(`BEGIN; RESET ROLE;
 ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
 ALTER TABLE public.redirect_workspace_members DROP CONSTRAINT redirect_workspace_members_pending_tenant_fence;
 ALTER TABLE public.redirect_api_tokens DROP CONSTRAINT redirect_api_tokens_pending_tenant_fence;
 ALTER TABLE public.redirect_link_folders DROP CONSTRAINT redirect_link_folders_pending_tenant_fence;
 ALTER TABLE public.redirect_link_metadata DROP CONSTRAINT redirect_link_metadata_pending_tenant_fence;
 DO $$ DECLARE fence text; BEGIN
 SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
 IF fence IS NULL THEN RAISE EXCEPTION 'Missing activation fixture fence';END IF;
 EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
 END $$; SET LOCAL ROLE service_role;`);
  const workspace = randomUUID(),
    foreign = randomUUID(),
    link = randomUUID(),
    folder = randomUUID(),
    key = randomUUID(),
    credential = 'qg_redirect_' + randomBytes(32).toString('hex'),
    hash = createHash('sha256').update(credential).digest('hex');
  async function request(
    path,
    expected = 200,
    workspaceHeader = workspace,
    token = 'fixture-account-session',
    body,
    method = body ? 'PATCH' : 'GET',
  ) {
    await db.exec('SAVEPOINT active_workspace_http');
    try {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          ...(workspaceHeader ? { 'x-qg-redirect-workspace': workspaceHeader } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (response.status >= 400) await db.exec('ROLLBACK TO SAVEPOINT active_workspace_http');
      assert.equal(response.status, expected, JSON.stringify(data));
      await db.exec('RELEASE SAVEPOINT active_workspace_http');
      return data;
    } catch (error) {
      await db.exec(
        'ROLLBACK TO SAVEPOINT active_workspace_http; RELEASE SAVEPOINT active_workspace_http',
      );
      throw error;
    }
  }
  try {
    await db.query(
      "INSERT INTO public.redirect_workspaces(id,name,slug) VALUES($1,'Active source context','active-source-context'),($2,'Private other context','private-other-context')",
      [workspace, foreign],
    );
    await db.query(
      'INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES($1,$3),($2,$4)',
      [workspace, foreign, actor, otherActor],
    );
    await db.query(
      "INSERT INTO public.redirect_workspace_members(workspace_id,user_id,kind,label,role) VALUES($1,$2,'user','Future viewer','viewer')",
      [workspace, otherActor],
    );
    await db.query(
      "INSERT INTO public.redirect_link_folders(id,workspace_id,name,default_permission) VALUES($1,$2,'Context folder','view')",
      [folder, workspace],
    );
    await db.query(
      "INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES($1,$2,'SHORT','active-context-source','https://example.org/source')",
      [link, workspace],
    );
    await db.query(
      "INSERT INTO public.redirect_link_metadata(workspace_id,redirect_key,folder_id) VALUES($1,'redirects:'||$2::uuid::text,$3)",
      [workspace, link, folder],
    );
    await db.query(
      "INSERT INTO public.redirect_api_tokens(id,workspace_id,name,token_hash,prefix,scopes,created_by,expires_at) VALUES($1,$2,'Context key',$3,'qg_redirect_12345678',ARRAY['links:read','links:write'],$4,now()+interval '1 day')",
      [key, workspace, hash, actor],
    );
    await request('/session', 403);
    await request('/links', 403, undefined, credential);
    await db.query("UPDATE public.redirect_workspaces SET status='active' WHERE id IN($1,$2)", [
      workspace,
      foreign,
    ]);
    assert.equal((await request('/session')).role, 'owner');
    const local = await request('/links');
    assert.equal(local.count, 1);
    assert.equal(local.data[0].id, link);
    assert.equal(
      (await request('/session', 200, workspace, 'fixture-other-account-session')).role,
      'viewer',
    );
    assert.equal(
      (await request('/links', 200, workspace, 'fixture-other-account-session')).data[0].id,
      link,
    );
    await request('/links/' + link, 403, workspace, 'fixture-other-account-session', {
      target: 'https://example.org/forged',
    });
    await request('/links', 403, foreign);
    assert.equal((await request('/links', 200, null, credential)).data[0].id, link);
    assert.equal((await request('/links', 200, workspace, credential)).data[0].id, link);
    await request('/links', 403, foreign, credential);
    await db.query("UPDATE public.redirect_api_tokens SET scopes=ARRAY['links:read'] WHERE id=$1", [
      key,
    ]);
    assert.equal((await request('/links', 200, null, credential)).data[0].canEdit, false);
    await request('/links/' + link, 403, null, credential, {
      target: 'https://example.org/read-only-forged',
    });
    await db.query(
      "UPDATE public.redirect_api_tokens SET scopes=ARRAY['links:read','links:write','workspace:read'] WHERE id=$1",
      [key],
    );
    await request('/links/' + link, 200, null, credential, {
      folderId: folder,
      target: 'https://example.org/key-update',
    });
    await request('/folders/' + folder + '/access', 200, null, credential);
    await db.query(
      'UPDATE public.redirect_api_tokens SET redirect_ids=ARRAY[$2::uuid] WHERE id=$1',
      [key, link],
    );
    await request('/folders/' + folder + '/access', 403, null, credential);
    await request(
      '/links',
      403,
      null,
      credential,
      { target: 'https://example.org/forbidden-create', folderId: folder },
      'POST',
    );
    await db.query('UPDATE public.redirect_api_tokens SET redirect_ids=NULL WHERE id=$1', [key]);
    await request(
      '/links',
      201,
      null,
      credential,
      { target: 'https://example.org/created', slug: 'active-context-created', folderId: folder },
      'POST',
    );
    await request('/links/' + link, 200, workspace, 'fixture-account-session', {
      target: 'https://example.org/updated',
    });
    assert.equal(
      (await db.query('SELECT target FROM public.redirects WHERE id=$1', [link])).rows[0].target,
      'https://example.org/updated',
    );
    await db.query(
      'UPDATE redirect_internal.workspace_owners SET active=false WHERE workspace_id=$1',
      [workspace],
    );
    await request('/links', 403);
    await request('/links', 403, null, credential);
    await db.query(
      'UPDATE redirect_internal.workspace_owners SET active=true WHERE workspace_id=$1',
      [workspace],
    );
    await db.query('UPDATE public.redirect_api_tokens SET revoked_at=now() WHERE id=$1', [key]);
    await request('/links', 403, null, credential);
    const grants = (
      await db.query(
        "SELECT has_function_privilege('anon','public.redirect_token_workspace(text)','execute') AS anon,has_function_privilege('authenticated','public.redirect_token_workspace(text)','execute') AS authenticated",
      )
    ).rows[0];
    assert.deepEqual(grants, { anon: false, authenticated: false });
    console.log(
      'Active private context HTTP: independent source Owner/viewer, scoped inventory/write, global-admin isolation, omitted key binding, explicit key/header mismatch, provisioning and current Owner/key revocation denial pass; activation fences roll back.',
    );
  } finally {
    await db.exec('ROLLBACK');
  }
}
