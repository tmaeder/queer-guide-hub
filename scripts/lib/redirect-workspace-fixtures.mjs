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
    '/links',
    '/inventory',
    '/reports?view=all',
  ];
  const before = new Map();
  for (const path of paths) before.set(path, (await request(path)).count);
  const inboxBefore = (
    await request('/invitations/received', 'GET', undefined, 'fixture-other-account-session')
  ).count;
  const facetsBefore = await request('/linked-domains');
  const imagesBefore = await request('/qr-images');
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
      'redirects',
      'redirect_domains',
      'redirect_link_metadata',
      'redirect_link_tag_assignments',
      'redirect_link_policies',
      'redirect_qr_image_links',
      'redirect_qr_image_creation_log',
      'redirect_qr_assets',
      'redirect_qr_styles',
      'redirect_saved_reports',
      'redirect_report_shares',
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
      access = randomUUID(),
      link = randomUUID(),
      domain = randomUUID();
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
    // Producers are a separate conversion boundary. The existing native SDK
    // tests archive their subscriptions; this fixture must never hide a live
    // cross-tenant webhook by disabling its trigger or weakening its assertions.
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM public.redirect_webhooks WHERE deleted_at IS NULL AND enabled',
        )
      ).rows[0].n,
      0,
    );
    const foreignSlug = 'foreign-scope-' + link.slice(0, 8);
    await db.query(
      "INSERT INTO public.redirect_domains(id,workspace_id,hostname,created_by) VALUES($1,$2,'foreign-scope.example.com',$3)",
      [domain, workspace, owner],
    );
    await db.query(
      "INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES($1,$2,'SHORT',$3,'https://example.org/foreign-private-http-link')",
      [link, workspace, foreignSlug],
    );
    const foreignMetadata = (
      await db.query(
        "INSERT INTO public.redirect_link_metadata(workspace_id,redirect_key,folder_id,comment) VALUES($1,$2,$3,'Foreign private HTTP link comment') RETURNING metadata_revision",
        [workspace, 'redirects:' + link, folder],
      )
    ).rows[0].metadata_revision;
    await db.query(
      'INSERT INTO public.redirect_link_tag_assignments(workspace_id,redirect_key,tag_id) VALUES($1,$2,$3)',
      [workspace, 'redirects:' + link, tag],
    );
    await db.query(
      'INSERT INTO public.redirect_link_policies(workspace_id,redirect_id,policy) VALUES($1,$2,\'{"preview":{"title":"Foreign private HTTP preview"}}\')',
      [workspace, link],
    );
    const image = randomUUID(),
      draft = randomUUID(),
      asset = randomUUID(),
      report = randomUUID(),
      share = randomUUID();
    const qrToken = 'qg_qr_' + randomBytes(32).toString('hex');
    await db.query(
      "INSERT INTO public.redirect_qr_image_links(id,workspace_id,token_hash,creator_user_id,principal_key,link_id,label) VALUES($1,$2,$3,$4::uuid,'owner:'||$4::uuid::text,$5,'Foreign private HTTP QR')",
      [image, workspace, createHash('sha256').update(qrToken).digest('hex'), owner, link],
    );
    await db.query(
      "INSERT INTO public.redirect_qr_image_links(id,workspace_id,token_hash,creator_user_id,principal_key,encoded_url,label,publication_state,draft_expires_at,logo_mode) VALUES($1,$2,$3,$4::uuid,'owner:'||$4::uuid::text,'https://example.org/foreign-draft','Foreign private HTTP draft','pending',clock_timestamp()+interval '15 minutes','custom')",
      [draft, workspace, randomBytes(32).toString('hex'), owner],
    );
    await db.query(
      "INSERT INTO public.redirect_qr_assets(id,workspace_id,target_scope,domain_id,requested_by,mime,bytes,width,height,sha256,state) VALUES($1,$2,'domain:'||$3::uuid::text,$3::uuid,$4,'image/png',8,1,1,$5,'active')",
      [asset, workspace, domain, owner, randomBytes(32).toString('hex')],
    );
    await db.query(
      "INSERT INTO public.redirect_qr_styles(workspace_id,scope,domain_id,style,logo_mode,logo_asset_id) VALUES($1,'domain:'||$2::uuid::text,$2::uuid,'{\"dots\":\"circle\"}','custom',$3)",
      [workspace, domain, asset],
    );
    const reportVersion = (
      await db.query(
        "INSERT INTO public.redirect_saved_reports(id,workspace_id,owner_user_id,name,filters,visibility) VALUES($1,$2,$3,'Foreign private HTTP report','{}','team') RETURNING version",
        [report, workspace, owner],
      )
    ).rows[0].version;
    await db.query(
      "INSERT INTO public.redirect_report_shares(id,workspace_id,report_id,owner_user_id,title,filters,link_ids,requires_workspace_owner) VALUES($1,$2,$3,$4,'Foreign private HTTP share','{}',ARRAY[$5::uuid],true)",
      [share, workspace, report, owner, link],
    );
    async function qrReportSnapshot() {
      const results = {};
      for (const table of [
        'redirect_qr_image_links',
        'redirect_qr_assets',
        'redirect_qr_styles',
        'redirect_saved_reports',
        'redirect_report_shares',
      ])
        results[table] = (
          await db.query(
            'SELECT to_jsonb(r) AS row FROM public.' +
              table +
              ' r WHERE workspace_id=$1 ORDER BY to_jsonb(r)::text',
            [workspace],
          )
        ).rows;
      return results;
    }
    const qrReportsBefore = await qrReportSnapshot();
    const foreignSnapshot = (
      await db.query(
        'SELECT to_jsonb(r) AS link,(SELECT to_jsonb(m) FROM public.redirect_link_metadata m WHERE redirect_key=$2) AS metadata,(SELECT to_jsonb(p) FROM public.redirect_link_policies p WHERE redirect_id=$1) AS policy FROM public.redirects r WHERE id=$1',
        [link, 'redirects:' + link],
      )
    ).rows[0];
    const budgetSnapshot = (
      await db.query(
        "SELECT 'preview' AS kind,bucket,attempts FROM public.redirect_preview_requests UNION ALL SELECT 'password',bucket,attempts FROM public.redirect_policy_password_limits ORDER BY kind,bucket",
      )
    ).rows;
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
    assert.deepEqual(await call('/linked-domains'), facetsBefore);
    await call('/links/' + link, 'GET', undefined, undefined, 404);
    for (const endpoint of ['policy', 'presentation', 'variants', 'password-branding'])
      await call('/links/' + link + '/' + endpoint, 'GET', undefined, undefined, 404);
    await call(
      '/links/' + link,
      'PATCH',
      { target: 'https://example.org/denied-change' },
      undefined,
      404,
    );
    await call('/links/' + link, 'DELETE', undefined, undefined, 404);
    await call(
      '/links/upsert',
      'PUT',
      { slug: foreignSlug, target: 'https://example.org/denied-upsert' },
      undefined,
      409,
    );
    await call(
      '/links/' + link + '/policy',
      'PATCH',
      { password: 'fixture-private-password' },
      undefined,
      404,
    );
    await call(
      '/links/' + link + '/presentation',
      'PATCH',
      { preview: { title: 'Denied preview' } },
      undefined,
      404,
    );
    await call('/links/' + link + '/preview-generate', 'POST', {}, undefined, 404);
    await call(
      '/links/' + link + '/preview-image',
      'POST',
      { image: 'invalid-image' },
      undefined,
      404,
    );
    await call(
      '/links',
      'POST',
      { target: 'https://example.org/denied-domain', domainId: domain },
      undefined,
      404,
    );
    await call(
      '/inventory/metadata?id=' + encodeURIComponent('redirects:' + link),
      'GET',
      undefined,
      undefined,
      404,
    );
    await call(
      '/inventory/organization',
      'POST',
      [
        {
          id: 'redirects:' + link,
          version: foreignMetadata,
          values: { comment: 'Denied metadata' },
        },
      ],
      undefined,
      404,
    );
    const own = (
      await db.query(
        "SELECT id FROM public.redirects WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01' AND type='SHORT' ORDER BY id LIMIT 1",
      )
    ).rows[0].id;
    await call('/links/' + own, 'PATCH', { folderId: folder }, undefined, 403);
    await call('/links/' + own, 'PATCH', { tagIds: [tag] }, undefined, 400);
    const afterSnapshot = (
      await db.query(
        'SELECT to_jsonb(r) AS link,(SELECT to_jsonb(m) FROM public.redirect_link_metadata m WHERE redirect_key=$2) AS metadata,(SELECT to_jsonb(p) FROM public.redirect_link_policies p WHERE redirect_id=$1) AS policy FROM public.redirects r WHERE id=$1',
        [link, 'redirects:' + link],
      )
    ).rows[0];
    assert.deepEqual(afterSnapshot, foreignSnapshot);
    assert.deepEqual(
      (
        await db.query(
          "SELECT 'preview' AS kind,bucket,attempts FROM public.redirect_preview_requests UNION ALL SELECT 'password',bucket,attempts FROM public.redirect_policy_password_limits ORDER BY kind,bucket",
        )
      ).rows,
      budgetSnapshot,
    );
    const reportBudgetsBefore = (
      await db.query('SELECT * FROM public.redirect_report_budgets ORDER BY bucket')
    ).rows;
    assert.deepEqual(await call('/qr-images'), imagesBefore);
    await call('/qr-images', 'POST', { linkId: link }, undefined, 404);
    await call('/qr-images/' + image, 'DELETE', { version: randomUUID() }, undefined, 404);
    await call(
      '/qr-images',
      'POST',
      {
        linkId: link,
        logo: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmfEAAAAASUVORK5CYII=',
      },
      undefined,
      404,
    );
    await call('/qr-styles/links/' + link, 'GET', undefined, undefined, 404);
    await call('/qr-styles/domains/' + domain, 'GET', undefined, undefined, 404);
    await call(
      '/qr-styles/domains/' + domain,
      'PATCH',
      { version: null, style: { dots: 'circle' } },
      undefined,
      404,
    );
    await call('/public-qr-image', 'GET', undefined, qrToken, 404);
    for (const action of ['GET', 'PATCH', 'DELETE'])
      await call(
        '/reports/' + report,
        action,
        action === 'PATCH' ? { version: reportVersion, name: 'Denied' } : undefined,
        undefined,
        404,
      );
    await call('/reports/' + report + '/run', 'GET', undefined, undefined, 404);
    await call('/reports/' + report + '/shares', 'GET', undefined, undefined, 404);
    await call(
      '/reports/' + report + '/shares',
      'POST',
      { reportVersion, title: 'Denied' },
      undefined,
      404,
    );
    await call('/reports/' + report + '/shares/' + share, 'DELETE', undefined, undefined, 404);
    await call('/public-report', 'GET', undefined, 'qg_report_' + share, 404);
    assert.deepEqual(await qrReportSnapshot(), qrReportsBefore);
    assert.deepEqual(
      (await db.query('SELECT * FROM public.redirect_report_budgets ORDER BY bucket')).rows,
      reportBudgetsBefore,
    );
    console.log(
      'Workspace QR/report isolation: actual owner HTTP hides foreign QR images, branding and personal/team reports; foreign creation/revocation/style/report/run/share and public-token requests are denied, preserving foreign records and report budgets.',
    );
    console.log(
      'Workspace link isolation: actual owner HTTP -> managed links/counts/inventory/facets excludes foreign data; foreign edit/delete/upsert/metadata/policy/branding/variants/preview work is denied before budgets/provider calls and leaves exact foreign snapshots unchanged.',
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
