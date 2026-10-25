import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export async function verifyPublicCapabilityWorkspaces(db, requestHttp, base, hashPassword) {
  await db.exec(`BEGIN; RESET ROLE;
    ALTER TABLE public.redirects DROP CONSTRAINT redirects_pending_tenant_fence;
    ALTER TABLE public.redirect_events DROP CONSTRAINT redirect_events_pending_tenant_fence;
    ALTER TABLE public.redirect_qr_image_links DROP CONSTRAINT redirect_qr_image_links_pending_tenant_fence;
    ALTER TABLE public.redirect_qr_image_creation_log DROP CONSTRAINT redirect_qr_image_creation_log_pending_tenant_fence;
    ALTER TABLE public.redirect_saved_reports DROP CONSTRAINT redirect_saved_reports_pending_tenant_fence;
    ALTER TABLE public.redirect_report_shares DROP CONSTRAINT redirect_report_shares_pending_tenant_fence;
    DO $$ DECLARE fence text; BEGIN
      SELECT conname INTO fence FROM pg_constraint WHERE conrelid='public.redirect_workspaces'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%provisioning%is_legacy%';
      IF fence IS NULL THEN RAISE EXCEPTION 'Missing activation fixture fence';END IF;
      EXECUTE format('ALTER TABLE public.redirect_workspaces DROP CONSTRAINT %I',fence);
    END $$; SET LOCAL ROLE service_role;`);
  // Production RPC calls have independent transactions. Savepoints give expected
  // error responses the same isolation inside this rolled-back fixture.
  async function request(...args) {
    await db.exec('SAVEPOINT public_capability_http_call');
    try {
      const result = await requestHttp(...args);
      if ((args[4] ?? 200) >= 400)
        await db.exec('ROLLBACK TO SAVEPOINT public_capability_http_call');
      await db.exec('RELEASE SAVEPOINT public_capability_http_call');
      return result;
    } catch (error) {
      await db.exec('ROLLBACK TO SAVEPOINT public_capability_http_call');
      await db.exec('RELEASE SAVEPOINT public_capability_http_call');
      throw error;
    }
  }
  try {
    const owner = randomUUID(),
      workspace = randomUUID(),
      link = randomUUID(),
      report = randomUUID(),
      share = randomUUID();
    const capability = 'qg_qr_' + randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(capability).digest('hex');
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner]);
    await db.query(
      "INSERT INTO public.redirect_workspaces(id,name,slug) VALUES($1,'Public capability HTTP','public-capability-http')",
      [workspace],
    );
    await db.query(
      'INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES($1,$2)',
      [workspace, owner],
    );
    await db.query(
      "INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES($1,$2,'SHORT','public-capability-http','https://example.org/future-capability')",
      [link, workspace],
    );
    await db.query(
      "INSERT INTO public.redirect_qr_image_links(workspace_id,token_hash,creator_user_id,principal_key,link_id) VALUES($1,$2,$3,'owner:'||$3::uuid::text,$4)",
      [workspace, hash, owner, link],
    );
    await db.query(
      "INSERT INTO public.redirect_saved_reports(id,workspace_id,owner_user_id,name,filters) VALUES($1,$2,$3,'Future private report','{}')",
      [report, workspace, owner],
    );
    await db.query(
      "INSERT INTO public.redirect_report_shares(id,workspace_id,report_id,owner_user_id,title,filters,link_ids,requires_workspace_owner,password_hash) VALUES($1,$2,$3,$4,'Future HTTP dashboard','{}',ARRAY[$5::uuid],true,$6::jsonb)",
      [
        share,
        workspace,
        report,
        owner,
        link,
        JSON.stringify(await hashPassword('future-capability-password')),
      ],
    );
    const reportCapability = 'qg_report_' + share;
    await request('/public-qr-image', 'GET', undefined, capability, 404);
    await request('/public-report', 'GET', undefined, reportCapability, 404);
    await db.query("UPDATE public.redirect_workspaces SET status='active' WHERE id=$1", [
      workspace,
    ]);
    const click = (
      await db.query(
        "SELECT public.record_redirect_visit($1,'/go/public-capability-http',NULL,NULL,'Fixture browser','CH',NULL,302,NULL,'https://example.org/future-capability','{}') AS value",
        [link],
      )
    ).rows[0].value;
    assert.ok(click);
    const profile = await request('/public-qr-image', 'GET', undefined, capability);
    assert.equal(profile.url, 'https://queer.guide/go/public-capability-http');
    assert.equal(profile.tracked, true);
    await request('/public-report', 'GET', undefined, reportCapability, 401);
    await request('/public-report', 'POST', { password: 'incorrect' }, reportCapability, 401);
    const dashboard = await request(
      '/public-report',
      'POST',
      { password: 'future-capability-password' },
      reportCapability,
    );
    assert.equal(dashboard.title, 'Future HTTP dashboard');
    assert.equal(dashboard.report.totals.clicks, 1);
    for (const [path, credential, body] of [
      ['/public-qr-image', capability, undefined],
      ['/public-report', reportCapability, { password: 'future-capability-password' }],
    ]) {
      const response = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: 'Bearer ' + credential,
          'x-qg-redirect-workspace': 'not-a-workspace',
          'x-qg-redirect-session-actor': randomUUID(),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(
        response.status,
        200,
        'Visitor workspace headers changed public capability access',
      );
    }
    await db.exec('SAVEPOINT private_capability_http_call');
    const privateResponse = await fetch(base + '/session', {
      headers: {
        Authorization: 'Bearer fixture-account-session',
        'x-qg-redirect-workspace': workspace,
      },
    });
    await db.exec('ROLLBACK TO SAVEPOINT private_capability_http_call');
    await db.exec('RELEASE SAVEPOINT private_capability_http_call');
    assert.equal(
      privateResponse.status,
      403,
      'Public capability support activated private tenant access',
    );
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM public.redirect_events WHERE redirect_id=$1',
          [link],
        )
      ).rows[0].n,
      1,
    );
    await db.query("UPDATE public.redirect_workspaces SET status='provisioning' WHERE id=$1", [
      workspace,
    ]);
    await request('/public-qr-image', 'GET', undefined, capability, 404);
    await request(
      '/public-report',
      'POST',
      { password: 'future-capability-password' },
      reportCapability,
      404,
    );
    await db.query("UPDATE public.redirect_workspaces SET status='active' WHERE id=$1", [
      workspace,
    ]);
    await db.query(
      'UPDATE public.redirect_qr_image_links SET revoked_at=now() WHERE token_hash=$1',
      [hash],
    );
    await request('/public-qr-image', 'GET', undefined, capability, 404);
    await db.query('UPDATE public.redirect_report_shares SET revoked_at=now() WHERE id=$1', [
      share,
    ]);
    await request(
      '/public-report',
      'POST',
      { password: 'future-capability-password' },
      reportCapability,
      404,
    );
    console.log(
      'Public workspace capabilities: actual HTTP → SQL serves saved QR/report identity for an isolated active second workspace, enforces passwords/current status/revocation, ignores visitor workspace claims and records no extra clicks. Private activation remains denied.',
    );
  } finally {
    await db.exec('ROLLBACK');
  }
}
