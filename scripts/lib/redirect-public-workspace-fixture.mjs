import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyPublicWorkspaceRouting({ db, builtin, worker, values, hashPassword }) {
  await db.exec(`BEGIN; RESET ROLE;
    ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
    ALTER TABLE public.redirect_events DROP CONSTRAINT redirect_events_pending_tenant_fence;
    ALTER TABLE public.redirect_link_policies DROP CONSTRAINT redirect_link_policies_pending_tenant_fence;
    ALTER TABLE public.redirect_password_attempts DROP CONSTRAINT redirect_password_attempts_pending_tenant_fence;
    ALTER TABLE public.redirect_domains DROP CONSTRAINT redirect_domains_pending_tenant_fence;
    ALTER TABLE public.redirect_domain_jobs DROP CONSTRAINT redirect_domain_jobs_pending_tenant_fence;
    DO $$ DECLARE fence text; BEGIN
      SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
      IF fence IS NULL THEN RAISE EXCEPTION 'Missing activation fixture fence';END IF;
      EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
    END $$; SET LOCAL ROLE service_role;`);
  try {
    const workspace = randomUUID();
    const owner = randomUUID();
    const link = randomUUID();
    const domain = randomUUID();
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
    await db.query(
      "INSERT INTO public.redirect_workspaces(id,name,slug) VALUES($1,'HTTP workspace fixture','http-workspace-fixture')",
      [workspace],
    );
    await db.query(
      'INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES($1,$2)',
      [workspace, owner],
    );
    await db.query(
      "INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES($1,$2,'SHORT','multi-http-future','https://example.org/future?fixed=kept#test')",
      [link, workspace],
    );
    const openBuiltin = (method = 'GET', password) =>
      builtin.onRequest({
        request: new Request(
          'https://queer.guide/go/multi-http-future?utm_source=workspace-http&qg_qr=1',
          {
            method,
            headers: {
              'User-Agent': 'Fixture browser',
              'cf-connecting-ip': '192.0.2.99',
              'x-qg-redirect-workspace': workspace,
              'x-qg-redirect-session-actor': owner,
              ...(password ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            },
            ...(password ? { body: new URLSearchParams({ password }).toString() } : {}),
          },
        ),
        params: { slug: 'multi-http-future' },
        env: { ...values, SUPABASE_ANON_KEY: 'fixture-public' },
      });
    assert.equal((await openBuiltin()).status, 404);
    await db.query("UPDATE public.redirect_workspaces SET status='active' WHERE id=$1", [
      workspace,
    ]);
    assert.equal((await openBuiltin('HEAD')).status, 302);
    let response = await openBuiltin();
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get('Location'),
      'https://example.org/future?fixed=kept&utm_source=workspace-http#test',
    );
    await db.query(
      'INSERT INTO public.redirect_link_policies(workspace_id,redirect_id,policy,password_hash) VALUES($1,$2,$3,$4)',
      [workspace, link, '{}', JSON.stringify(await hashPassword('workspace-fixture-password'))],
    );
    assert.equal((await openBuiltin()).status, 401);
    response = await openBuiltin('POST', 'workspace-fixture-password');
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get('Location'),
      'https://example.org/future?fixed=kept&utm_source=workspace-http#test',
    );
    await db.query(
      "INSERT INTO public.redirect_domains(id,workspace_id,hostname,created_by,provider_id,ownership_state,verified_at,verified_until,routing_provider_id,routing_protocol,routing_seen_at) VALUES($1,$2,'future-http.example.com',$3,'fixture-future','verified',now(),now()+interval '1 day','fixture-future',1,now())",
      [domain, workspace, owner],
    );
    await db.query(
      "INSERT INTO public.redirect_domain_jobs(workspace_id,domain_id,zone_id,cname_target,requested_by,state,provider_status,ssl_status,checked_at) VALUES($1,$2,repeat('a',32),'links.queer.guide',$3,'ready','active','active',now())",
      [workspace, domain, owner],
    );
    const custom = randomUUID();
    await db.query(
      "INSERT INTO public.redirects(id,workspace_id,type,slug,target,domain_id) VALUES($1,$2,'SHORT','multi-http-custom','https://example.org/future-custom',$3)",
      [custom, workspace, domain],
    );
    response = await worker.fetch(
      new Request('https://future-http.example.com/multi-http-custom', {
        headers: {
          'User-Agent': 'Fixture browser',
          'cf-connecting-ip': '192.0.2.100',
          'x-qg-redirect-workspace': '58aa4340-8f21-4b7f-9a10-90be2da89c01',
        },
      }),
      { ...values, SUPABASE_ANON_KEY: 'fixture-public' },
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), 'https://example.org/future-custom');
    const events = (
      await db.query(
        'SELECT workspace_id,redirect_id,visitor FROM public.redirect_events WHERE redirect_id=ANY($1::uuid[])',
        [[link, custom]],
      )
    ).rows;
    assert.equal(events.length, 3);
    assert.ok(events.every((event) => event.workspace_id === workspace));
    assert.equal(events.filter((event) => event.visitor.is_qr).length, 2);
    await db.query("UPDATE public.redirect_workspaces SET status='provisioning' WHERE id=$1", [
      workspace,
    ]);
    assert.equal((await openBuiltin()).status, 404);
    console.log(
      'Public workspace routing: actual Pages and signed branded Worker → resolver → SQL derive workspace from slug/hostname, strip visitor workspace claims, preserve QR/query/password behavior, record exactly three source-bound visits, and deny provisioning workspaces. No production tenant was activated.',
    );
  } finally {
    await db.exec('ROLLBACK');
  }
}
