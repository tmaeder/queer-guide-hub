import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Actual Edge HTTP -> service SQL with Auth facts independent of the fake
// session identity. Every change, including temporary tenant fences, rolls back.
export async function verifyNativeSignupWorkspace(db, base, actor, setVerified) {
  await db.exec(`BEGIN; RESET ROLE;
    ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
    ALTER TABLE public.redirect_events DROP CONSTRAINT redirect_events_pending_tenant_fence;
    ALTER TABLE public.redirect_link_conversions DROP CONSTRAINT redirect_link_conversions_pending_tenant_fence;
    ALTER TABLE public.redirect_link_customers DROP CONSTRAINT redirect_link_customers_pending_tenant_fence;
    DO $$ DECLARE fence text; BEGIN
      SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
      IF fence IS NULL THEN RAISE EXCEPTION 'Missing activation fixture fence';END IF;
      EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
    END $$; SET LOCAL ROLE service_role;`);
  const workspace = randomUUID(),
    owner = randomUUID(),
    link = randomUUID(),
    click = randomUUID();
  async function signup(expected, workspaceHeader, extra = {}, selectedClick = click) {
    await db.exec('SAVEPOINT native_signup_http');
    try {
      const response = await fetch(base + '/native/signup', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer fixture-account-session',
          'Content-Type': 'application/json',
          ...(workspaceHeader ? { 'x-qg-redirect-workspace': workspaceHeader } : {}),
        },
        body: JSON.stringify({ clickId: selectedClick, ...extra }),
      });
      const result = await response.json();
      if (response.status >= 400) await db.exec('ROLLBACK TO SAVEPOINT native_signup_http');
      assert.equal(response.status, expected, JSON.stringify(result));
      await db.exec('RELEASE SAVEPOINT native_signup_http');
      return result;
    } catch (error) {
      await db.exec(
        'ROLLBACK TO SAVEPOINT native_signup_http; RELEASE SAVEPOINT native_signup_http',
      );
      throw error;
    }
  }
  try {
    await db.query('INSERT INTO auth.users(id,email_confirmed_at) VALUES($1,now())', [owner]);
    await db.exec('RESET ROLE');
    await db.query(
      "UPDATE auth.users SET email_confirmed_at=now(),created_at=now()-interval '1 hour' WHERE id=$1",
      [actor],
    );
    await db.exec('SET LOCAL ROLE service_role');
    await db.query(
      "INSERT INTO public.redirect_workspaces(id,name,slug) VALUES($1,'Signup HTTP source','signup-http-source')",
      [workspace],
    );
    await db.query(
      'INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES($1,$2)',
      [workspace, owner],
    );
    await db.query("UPDATE public.redirect_workspaces SET status='active' WHERE id=$1", [
      workspace,
    ]);
    await db.query(
      "INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES($1,$2,'SHORT','signup-http-source','https://example.org/signup')",
      [link, workspace],
    );
    await db.query(
      "INSERT INTO public.redirect_events(workspace_id,redirect_id,click_id,ts,path,status) VALUES($1,$2,$3,now()-interval '2 hours','/signup-http',302)",
      [workspace, link, click],
    );
    setVerified(false);
    await signup(403);
    setVerified(true);
    await signup(201);
    await signup(200);
    await signup(200, 'malformed-visitor-workspace');
    await signup(200, randomUUID());
    await signup(400, undefined, { customerExternalId: 'forged' });
    await signup(404, undefined, {}, randomUUID());
    await db.exec('RESET ROLE');
    await db.query('UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1', [actor]);
    await db.exec('SET LOCAL ROLE service_role');
    await signup(403);
    await db.exec('RESET ROLE');
    await db.query('UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', [actor]);
    await db.exec('SET LOCAL ROLE service_role');
    await db.query("UPDATE public.redirect_workspaces SET status='provisioning' WHERE id=$1", [
      workspace,
    ]);
    await signup(404);
    const counts = (
      await db.query(
        'SELECT (SELECT count(*)::int FROM public.redirect_events WHERE workspace_id=$1) AS visits,(SELECT count(*)::int FROM public.redirect_link_conversions WHERE workspace_id=$1) AS conversions,(SELECT count(*)::int FROM public.redirect_link_conversions WHERE workspace_id<>$1 AND provider_event_id=$2) AS leaked',
        [workspace, 'native:signup:' + actor],
      )
    ).rows[0];
    assert.deepEqual(counts, { visits: 1, conversions: 1, leaked: 0 });
    console.log(
      'Native signup HTTP: source workspace, trusted registration, verified session, replay, visitor-header independence, inactive/unknown-click denial and no extra visits pass.',
    );
  } finally {
    setVerified(false);
    await db.exec('ROLLBACK');
  }
}
