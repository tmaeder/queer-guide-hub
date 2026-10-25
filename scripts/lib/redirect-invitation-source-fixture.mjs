import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function verifyInvitationSourceWorkspace(db, base, actor, otherActor) {
  await db.exec(`BEGIN; RESET ROLE;
    ALTER TABLE public.redirect_workspace_members DROP CONSTRAINT redirect_workspace_members_pending_tenant_fence;
    ALTER TABLE public.redirect_workspace_invitations DROP CONSTRAINT redirect_workspace_invitations_pending_tenant_fence;
    DO $$ DECLARE fence text; BEGIN
      SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
      IF fence IS NULL THEN RAISE EXCEPTION 'Missing activation fixture fence';END IF;
      EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
    END $$; SET LOCAL ROLE service_role;`);
  const owner = randomUUID(),
    workspace = randomUUID(),
    invitation = randomUUID();
  async function request(
    path,
    expected = 200,
    body,
    credential = 'fixture-other-account-session',
    header = 'malformed-visitor-selection',
  ) {
    await db.exec('SAVEPOINT invitation_source_http');
    try {
      const response = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer ' + credential,
          'x-qg-redirect-workspace': header,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (response.status >= 400) await db.exec('ROLLBACK TO SAVEPOINT invitation_source_http');
      assert.equal(response.status, expected, JSON.stringify(data));
      await db.exec('RELEASE SAVEPOINT invitation_source_http');
      return data;
    } catch (error) {
      await db.exec(
        'ROLLBACK TO SAVEPOINT invitation_source_http; RELEASE SAVEPOINT invitation_source_http',
      );
      throw error;
    }
  }
  try {
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
    await db.query(
      "INSERT INTO public.redirect_workspaces(id,name,slug) VALUES($1,'Invitation HTTP source','invitation-http-source')",
      [workspace],
    );
    await db.query(
      'INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES($1,$2)',
      [workspace, owner],
    );
    await db.query(
      "INSERT INTO public.redirect_workspace_invitations(id,workspace_id,email,label,role,token_hash,created_by) VALUES($1,$2,'http-invite@example.org','Source viewer','viewer',repeat('e',64),$3)",
      [invitation, workspace, owner],
    );
    assert.equal(
      (await request('/invitations/received')).data.some((item) => item.id === invitation),
      false,
    );
    await request('/invitations/accept', 404, { id: invitation });
    await db.query("UPDATE public.redirect_workspaces SET status='active' WHERE id=$1", [
      workspace,
    ]);
    const visible = (await request('/invitations/received')).data.find(
      (item) => item.id === invitation,
    );
    assert.equal(visible.workspace.id, workspace);
    assert.equal(visible.workspace.name, 'Invitation HTTP source');
    assert.equal('token_hash' in visible || 'email' in visible, false);
    await request('/invitations/accept', 404, { id: invitation }, 'fixture-account-session');
    await request('/invitations/accept', 403, { id: invitation }, 'qg_redirect_' + 'a'.repeat(64));
    await request('/members', 403, undefined, 'fixture-account-session', workspace);
    const accepted = await request('/invitations/accept', 200, { id: invitation });
    assert.equal(accepted.workspace.id, workspace);
    assert.equal(accepted.role, 'viewer');
    assert.equal(
      (await request('/invitations/accept', 200, { id: invitation }, undefined, randomUUID()))
        .memberId,
      accepted.memberId,
    );
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS total FROM public.redirect_workspace_members WHERE workspace_id=$1 AND user_id=$2',
          [workspace, otherActor],
        )
      ).rows[0].total,
      1,
    );
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS total FROM public.redirect_workspace_members WHERE workspace_id=$1 AND user_id=$2',
          [workspace, actor],
        )
      ).rows[0].total,
      0,
    );
    await db.query('UPDATE public.redirect_workspace_members SET active=false WHERE id=$1', [
      accepted.memberId,
    ]);
    await request('/invitations/accept', 404, { id: invitation });
    console.log(
      'Recipient invitations HTTP: verified-email global inbox, saved active source acceptance, visitor-header independence, replay, wrong-account/key denial and preserved private resource fences pass.',
    );
  } finally {
    await db.exec('ROLLBACK');
  }
}
