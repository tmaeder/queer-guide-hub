import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
// This fixture runs only in the isolated migrated database. The rollback restores
// every activation fence; no second workspace is enabled by the product migration.
export async function verifyRedirectWorkspaceMembershipHttp(
  db,
  request,
  owner,
  { cleanupAssets } = {},
) {
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
    '/domains?archive=all',
    '/webhooks',
    '/webhooks?archived=true',
    '/apps',
  ];
  const before = new Map();
  for (const path of paths) before.set(path, (await request(path)).count);
  const inboxBefore = (
    await request('/invitations/received', 'GET', undefined, 'fixture-other-account-session')
  ).count;
  const facetsBefore = await request('/linked-domains');
  const imagesBefore = await request('/qr-images');
  const analyticsBefore = await request('/analytics', 'POST', { filters: {} });
  const domainChoicesBefore = await request('/domain-choices');
  const associationBefore = await request(
    '/public-app-association?hostname=queer.guide&platform=ios',
  );
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
      'redirect_domain_preferences',
      'redirect_link_metadata',
      'redirect_link_tag_assignments',
      'redirect_link_policies',
      'redirect_qr_image_links',
      'redirect_qr_image_creation_log',
      'redirect_qr_assets',
      'redirect_qr_styles',
      'redirect_saved_reports',
      'redirect_report_shares',
      'redirect_events',
      'redirect_link_conversions',
      'redirect_link_customers',
      'redirect_customer_profiles',
      'redirect_domain_jobs',
      'redirect_domain_connect_operations',
      'redirect_domain_instruction_mail',
      'redirect_webhooks',
      'redirect_webhook_events',
      'redirect_webhook_deliveries',
      'redirect_webhook_attempts',
      'redirect_native_apps',
      'redirect_password_branding',
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
      'INSERT INTO redirect_internal.workspace_owners(workspace_id,user_id) VALUES($1,$2)',
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
    // The same authenticated account can hold independent tenant memberships.
    const foreignUser = owner;
    const human = randomUUID();
    await db.query(
      "INSERT INTO public.redirect_workspace_members(id,workspace_id,user_id,kind,label) VALUES($1,$2,$3,'user','Foreign private HTTP requester')",
      [human, workspace, foreignUser],
    );
    await db.query(
      "INSERT INTO public.redirect_access_requests(id,workspace_id,folder_id,member_id,message) VALUES($1,$2,$3,$4,'Foreign private HTTP request')",
      [access, workspace, folder, human],
    );
    // SDK subscriptions are archived before this fixture. Keep the trigger live
    // while seeding an active foreign receiver and its authoritative source rows.
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM public.redirect_webhooks WHERE deleted_at IS NULL AND enabled',
        )
      ).rows[0].n,
      0,
    );
    const foreignWebhook = randomUUID();
    const foreignWebhookVersion = (
      await db.query(
        "INSERT INTO public.redirect_webhooks(id,workspace_id,created_by,name,url,event_types,secret,include_customer_id) VALUES($1,$2,$3,'Foreign private HTTP webhook','https://foreign-receiver.example.org/events',ARRAY['link.created','link.updated','link.deleted','link.clicked','lead.created','sale.created'],$4,true) RETURNING version",
        [foreignWebhook, workspace, owner, 'whsec_' + 'Q'.repeat(43) + '='],
      )
    ).rows[0].version;
    const foreignSlug = 'foreign-scope-' + link.slice(0, 8);
    await db.query(
      "INSERT INTO public.redirect_domains(id,workspace_id,hostname,created_by) VALUES($1,$2,'foreign-scope.example.com',$3)",
      [domain, workspace, owner],
    );
    await db.query(
      "INSERT INTO public.redirects(id,workspace_id,type,slug,target) VALUES($1,$2,'SHORT',$3,'https://example.org/foreign-private-http-link')",
      [link, workspace, foreignSlug],
    );
    const providerId = randomUUID(),
      domainOperation = randomUUID(),
      domainMail = randomUUID(),
      domainRequest = randomUUID();
    const domainVersion = (
      await db.query(
        "UPDATE public.redirect_domains SET provider_id=$2,ownership_state='verified',verified_at=now(),verified_until=now()+interval '3 hours',routing_provider_id=$2,routing_protocol=1,routing_seen_at=now() WHERE id=$1 RETURNING version",
        [domain, providerId],
      )
    ).rows[0].version;
    await db.query(
      "INSERT INTO public.redirect_domain_jobs(workspace_id,domain_id,zone_id,cname_target,requested_by,state,provider_status,ssl_status,checked_at) VALUES($1,$2,$3,'links.queer.guide',$4,'ready','active','active',now())",
      [workspace, domain, 'a'.repeat(32), owner],
    );
    await db.query(
      'INSERT INTO public.redirect_domain_connect_operations(id,workspace_id,domain_id,actor_id,domain_version,configuration) VALUES($1,$2,$3,$4,$5,$6)',
      [domainOperation, workspace, domain, owner, domainVersion, 'b'.repeat(64)],
    );
    await db.query(
      "INSERT INTO public.redirect_domain_instruction_mail(id,workspace_id,domain_id,actor_id,request_id,domain_version,snapshot,hostname,cname_target,records,recipient_email) VALUES($1,$2,$3,$4,$5,$6,$7,'foreign-scope.example.com','links.queer.guide','[]','foreign-domain@example.org')",
      [domainMail, workspace, domain, owner, domainRequest, domainVersion, 'c'.repeat(64)],
    );
    async function domainSnapshot() {
      const state = {};
      for (const table of [
        'redirect_domains',
        'redirect_domain_jobs',
        'redirect_domain_connect_operations',
        'redirect_domain_instruction_mail',
      ])
        state[table] = (
          await db.query(
            'SELECT to_jsonb(r) AS row FROM public.' +
              table +
              ' r WHERE workspace_id=$1 ORDER BY to_jsonb(r)::text',
            [workspace],
          )
        ).rows;
      return state;
    }
    const domainsBefore = await domainSnapshot();
    const foreignApp = randomUUID(),
      foreignCleanupAsset = randomUUID(),
      foreignPasswordAsset = randomUUID();
    const foreignAppVersion = (
      await db.query(
        "INSERT INTO public.redirect_native_apps(id,workspace_id,domain_id,label,platform,app_id,app_clip_id,public_name,store_id,app_group_id,handoff_enabled,enabled,created_by,paths) VALUES($1,$2,$4,'Foreign private HTTP native app','ios','ABCDE12345.org.qg.ForeignHttp','ABCDE12345.org.qg.ForeignHttp.Clip','Foreign HTTP app','12345','group.org.qg.ForeignHttp',true,true,$3,ARRAY['/go/*']) RETURNING revision",
        [foreignApp, workspace, owner, domain],
      )
    ).rows[0].revision;
    await db.query(
      "INSERT INTO public.redirect_qr_assets(id,workspace_id,target_scope,requested_by,mime,bytes,width,height,sha256,state,next_cleanup_at) VALUES($1,$2,'workspace',$3,'image/png',8,1,1,$4,'active',now()-interval '1 day')",
      [foreignCleanupAsset, workspace, owner, 'a'.repeat(64)],
    );
    await db.query(
      "INSERT INTO public.redirect_qr_assets(id,workspace_id,target_scope,password_link_id,requested_by,mime,bytes,width,height,sha256,state) VALUES($1,$2,'password:'||$3::uuid::text,$3::uuid,$4,'image/png',8,1,1,$5,'active')",
      [foreignPasswordAsset, workspace, link, owner, 'b'.repeat(64)],
    );
    await db.query(
      "INSERT INTO public.redirect_password_branding(workspace_id,link_id,brand_name,logo_asset_id) VALUES($1,$2,'Foreign private HTTP brand',$3)",
      [workspace, link, foreignPasswordAsset],
    );
    async function nativeAssetSnapshot() {
      const state = {};
      for (const table of [
        'redirect_native_apps',
        'redirect_password_branding',
        'redirect_qr_assets',
      ])
        state[table] = (
          await db.query(
            'SELECT to_jsonb(r) AS row FROM public.' +
              table +
              ' r WHERE workspace_id=$1 ORDER BY to_jsonb(r)::text',
            [workspace],
          )
        ).rows;
      return state;
    }
    await db.query(
      'INSERT INTO public.redirect_domain_preferences(workspace_id,singleton,domain_id) VALUES($1,true,$2)',
      [workspace, domain],
    );
    await db.query(
      "INSERT INTO public.redirect_qr_styles(workspace_id,scope,style,logo_mode) VALUES($1,'workspace','{\"dots\":\"circle\"}','none')",
      [workspace],
    );
    const foreignDefaults = (
      await db.query(
        "SELECT (SELECT to_jsonb(p) FROM public.redirect_domain_preferences p WHERE workspace_id=$1) AS preference,(SELECT to_jsonb(s) FROM public.redirect_qr_styles s WHERE workspace_id=$1 AND scope='workspace') AS style",
        [workspace],
      )
    ).rows[0];
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
    const foreignClick = randomUUID(),
      foreignCustomer = 'foreign-http-customer:' + randomUUID(),
      foreignEvent = 'foreign-http-event:' + randomUUID();
    await db.query(
      "INSERT INTO public.redirect_events(workspace_id,redirect_id,click_id,ts,path,variant_id,status) VALUES($1,$2,$3,now()-interval '5 minutes','/foreign-private-http-customer','foreign-private-http-variant',302)",
      [workspace, link, foreignClick],
    );
    await db.query(
      "INSERT INTO public.redirect_link_conversions(workspace_id,click_id,kind,customer_key,provider_event_id,event_name) VALUES($1,$2,'lead',$3,$4,'Foreign private HTTP customer event')",
      [workspace, foreignClick, foreignCustomer, foreignEvent],
    );
    await db.query(
      'INSERT INTO public.redirect_link_customers(workspace_id,customer_key,click_id) VALUES($1,$2,$3)',
      [workspace, foreignCustomer, foreignClick],
    );
    const customerVersion = (
      await db.query(
        "INSERT INTO public.redirect_customer_profiles(workspace_id,customer_key,name,email) VALUES($1,$2,'Foreign private HTTP customer','foreign-customer@example.org') RETURNING version",
        [workspace, foreignCustomer],
      )
    ).rows[0].version;
    async function customerSnapshot() {
      const state = {};
      for (const table of [
        'redirect_events',
        'redirect_link_conversions',
        'redirect_link_customers',
        'redirect_customer_profiles',
      ])
        state[table] = (
          await db.query(
            'SELECT to_jsonb(r) AS row FROM public.' +
              table +
              ' r WHERE workspace_id=$1 ORDER BY to_jsonb(r)::text',
            [workspace],
          )
        ).rows;
      return state;
    }
    const customersBefore = await customerSnapshot();
    const foreignDelivery = (
      await db.query(
        'SELECT id,version FROM public.redirect_webhook_deliveries WHERE webhook_id=$1 ORDER BY sequence LIMIT 1',
        [foreignWebhook],
      )
    ).rows[0];
    assert.ok(foreignDelivery, 'Live source trigger did not enqueue the foreign event');
    async function webhookSnapshot() {
      const state = {};
      for (const table of [
        'redirect_webhooks',
        'redirect_webhook_events',
        'redirect_webhook_deliveries',
        'redirect_webhook_attempts',
      ])
        state[table] = (
          await db.query(
            'SELECT to_jsonb(r) AS row FROM public.' +
              table +
              ' r WHERE workspace_id=$1 ORDER BY to_jsonb(r)::text',
            [workspace],
          )
        ).rows;
      return state;
    }
    const webhooksBefore = await webhookSnapshot();
    const webhookBudgetsBefore = (
      await db.query('SELECT * FROM public.redirect_webhook_budgets ORDER BY bucket')
    ).rows;
    const nativeAssetsBefore = await nativeAssetSnapshot();
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
    const analyticsAfter = await call('/analytics', 'POST', { filters: {} });
    for (const key of ['totals', 'revenue', 'breakdowns'])
      assert.deepEqual(
        analyticsAfter[key],
        analyticsBefore[key],
        'Analytics ' + key + ' included foreign events',
      );
    const foreignAnalytics = await call('/analytics', 'POST', { filters: { linkIds: [link] } });
    assert.equal(foreignAnalytics.totals.clicks, 0);
    assert.equal(foreignAnalytics.totals.leads, 0);
    const eventsPage = await call('/events', 'POST', { filters: {}, limit: 100 });
    assert.ok(!JSON.stringify(eventsPage).includes('foreign-private-http'));
    await call(
      '/customers/profile?id=' + encodeURIComponent(foreignCustomer),
      'GET',
      undefined,
      undefined,
      404,
    );
    await call(
      '/customers/journey?id=' + encodeURIComponent(foreignCustomer),
      'GET',
      undefined,
      undefined,
      404,
    );
    await call(
      '/customers/profile',
      'PATCH',
      { customerExternalId: foreignCustomer, version: customerVersion, name: 'Denied' },
      undefined,
      404,
    );
    await call(
      '/customers/profile',
      'DELETE',
      { customerExternalId: foreignCustomer, version: customerVersion },
      undefined,
      404,
    );
    const ownClick = (
      await db.query(
        "SELECT click_id FROM public.redirect_events WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01' AND redirect_id IS NOT NULL LIMIT 1",
      )
    ).rows[0].click_id;
    const localConversionsBefore = (
      await db.query(
        "SELECT count(*)::int AS n FROM public.redirect_link_conversions WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'",
      )
    ).rows[0].n;
    await call(
      '/track/lead',
      'POST',
      { clickId: foreignClick, customerExternalId: 'denied-foreign-click', eventId: randomUUID() },
      undefined,
      404,
    );
    await call(
      '/track/lead',
      'POST',
      { customerExternalId: foreignCustomer, eventId: randomUUID() },
      undefined,
      404,
    );
    await db.exec('SAVEPOINT workspace_same_customer_keys');
    const independent = {
      clickId: ownClick,
      customerExternalId: foreignCustomer,
      eventId: foreignEvent,
    };
    const createdConversion = await call('/track/lead', 'POST', independent, undefined, 201);
    assert.equal(createdConversion.duplicate, false);
    assert.equal((await call('/track/lead', 'POST', independent)).duplicate, true);
    await call(
      '/track/lead',
      'POST',
      { ...independent, customerExternalId: 'different-local-customer' },
      undefined,
      409,
    );
    const independentProfile = await call(
      '/customers/profile?id=' + encodeURIComponent(foreignCustomer),
    );
    assert.equal(independentProfile.name, null);
    await call(
      '/customers/profile',
      'PATCH',
      {
        customerExternalId: foreignCustomer,
        version: customerVersion,
        name: 'Stale foreign version',
      },
      undefined,
      409,
    );
    const localProfile = await call('/customers/profile', 'PATCH', {
      customerExternalId: foreignCustomer,
      version: null,
      name: 'Independent local profile',
    });
    assert.equal(localProfile.name, 'Independent local profile');
    assert.notEqual(localProfile.version, customerVersion);
    assert.deepEqual(await customerSnapshot(), customersBefore);
    await db.exec('ROLLBACK TO SAVEPOINT workspace_same_customer_keys');
    await db.exec('RELEASE SAVEPOINT workspace_same_customer_keys');
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM public.redirect_link_conversions WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'",
        )
      ).rows[0].n,
      localConversionsBefore,
    );
    assert.deepEqual(await customerSnapshot(), customersBefore);
    const domainBudgetsBefore = (
      await db.query('SELECT * FROM public.redirect_report_budgets ORDER BY bucket')
    ).rows;
    assert.deepEqual(await call('/domain-choices'), domainChoicesBefore);
    await call('/domains/' + domain, 'GET', undefined, undefined, 404);
    await call(
      '/domains/' + domain,
      'PATCH',
      { version: domainVersion, archived: true },
      undefined,
      404,
    );
    await call('/domains/' + domain, 'DELETE', { version: domainVersion }, undefined, 404);
    await call(
      '/domains/' + domain + '/verify',
      'POST',
      { version: domainVersion },
      undefined,
      404,
    );
    for (const action of ['connect', 'refresh', 'disconnect', 'restart-validation'])
      await call(
        '/domains/' + domain + '/provider/' + action,
        'POST',
        { version: domainVersion },
        undefined,
        404,
      );
    const primary = await call('/domain-preference');
    await call(
      '/domain-preference',
      'PATCH',
      { version: primary.version, domainId: domain },
      undefined,
      400,
    );
    await call('/manual-records/' + link, 'GET', undefined, undefined, 404);
    const manualVersion = (
      await db.query('SELECT updated_at FROM public.redirects WHERE id=$1', [link])
    ).rows[0].updated_at.toISOString();
    await call(
      '/manual-records/' + link,
      'PATCH',
      { expectedUpdatedAt: manualVersion, values: { notes: 'Denied foreign manual edit' } },
      undefined,
      404,
    );
    await call(
      '/manual-records',
      'POST',
      {
        values: {
          type: 'SHORT',
          slug: 'denied-http-domain',
          target: 'https://example.org/denied',
          domain_id: domain,
        },
      },
      undefined,
      404,
    );
    await call(
      '/domains/' + domain + '/dns-setup/discover',
      'POST',
      { version: domainVersion },
      undefined,
      404,
    );
    await call('/domain-connect/' + domainOperation, 'GET', undefined, undefined, 404);
    await call('/domains/' + domain + '/instructions', 'GET', undefined, undefined, 404);
    await call(
      '/domains/' + domain + '/instructions',
      'POST',
      {
        version: domainVersion,
        snapshot: 'c'.repeat(64),
        email: 'foreign-domain@example.org',
        requestId: domainRequest,
      },
      undefined,
      404,
    );
    await call('/domains/' + domain + '/instruction-emails', 'GET', undefined, undefined, 404);
    await call(
      '/domains/' + domain + '/instruction-emails?requestId=' + domainRequest,
      'GET',
      undefined,
      undefined,
      404,
    );
    await call(
      '/domains/' + domain + '/instruction-emails/' + domainMail,
      'GET',
      undefined,
      undefined,
      404,
    );
    await call(
      '/domains/' + domain + '/instruction-emails/' + domainMail + '/cancel',
      'POST',
      {},
      undefined,
      404,
    );
    assert.deepEqual(await domainSnapshot(), domainsBefore);
    assert.deepEqual(
      (await db.query('SELECT * FROM public.redirect_report_budgets ORDER BY bucket')).rows,
      domainBudgetsBefore,
    );
    await call('/webhooks/' + foreignWebhook, 'GET', undefined, undefined, 404);
    await call(
      '/webhooks/' + foreignWebhook,
      'PATCH',
      { version: foreignWebhookVersion, name: 'Denied' },
      undefined,
      404,
    );
    await call(
      '/webhooks/' + foreignWebhook,
      'DELETE',
      { version: foreignWebhookVersion },
      undefined,
      404,
    );
    for (const action of ['test', 'rotate'])
      await call(
        '/webhooks/' + foreignWebhook + '/' + action,
        'POST',
        { version: foreignWebhookVersion },
        undefined,
        404,
      );
    await call(
      '/webhooks',
      'POST',
      {
        name: 'Denied foreign filter',
        url: 'https://local-receiver.example.org/events',
        linkIds: [link],
      },
      undefined,
      400,
    );
    await call('/webhooks/' + foreignWebhook + '/deliveries', 'GET', undefined, undefined, 404);
    await call(
      '/webhooks/' + foreignWebhook + '/deliveries/' + foreignDelivery.id,
      'GET',
      undefined,
      undefined,
      404,
    );
    await call(
      '/webhooks/' + foreignWebhook + '/deliveries/' + foreignDelivery.id + '/attempts',
      'GET',
      undefined,
      undefined,
      404,
    );
    await call(
      '/webhooks/' + foreignWebhook + '/deliveries/' + foreignDelivery.id + '/replay',
      'POST',
      { version: foreignDelivery.version },
      undefined,
      404,
    );
    assert.deepEqual(await webhookSnapshot(), webhooksBefore);
    assert.deepEqual(
      (await db.query('SELECT * FROM public.redirect_webhook_budgets ORDER BY bucket')).rows,
      webhookBudgetsBefore,
    );
    await call(
      '/apps/' + foreignApp,
      'PATCH',
      { version: foreignAppVersion, label: 'Denied foreign app' },
      undefined,
      404,
    );
    await call('/apps/' + foreignApp, 'DELETE', { version: foreignAppVersion }, undefined, 404);
    await call(
      '/apps',
      'POST',
      {
        label: 'Denied domain app',
        platform: 'ios',
        appId: 'ABCDE12345.org.qg.DeniedHttp',
        domainId: domain,
      },
      undefined,
      400,
    );
    assert.deepEqual(
      await call('/public-app-association?hostname=queer.guide&platform=ios'),
      associationBefore,
    );
    await call(
      '/public-app-association?hostname=foreign-scope.example.com&platform=ios',
      'GET',
      undefined,
      undefined,
      404,
    );
    await call(
      '/links/' + link + '/password-branding',
      'PATCH',
      { version: null, brandName: 'Denied foreign brand' },
      undefined,
      404,
    );
    await call(
      '/links/' + link + '/password-branding/logo',
      'POST',
      {
        version: null,
        image:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmfEAAAAASUVORK5CYII=',
      },
      undefined,
      404,
    );
    // Isolate maintenance from unrelated legacy tombstones. This transaction
    // rolls back the scheduling change; the positive cleanup suite still runs.
    await db.query(
      "UPDATE public.redirect_qr_assets SET next_cleanup_at=clock_timestamp()+interval '1 day' WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'",
    );
    assert.equal(typeof cleanupAssets, 'function');
    assert.deepEqual(await nativeAssetSnapshot(), nativeAssetsBefore);
    await cleanupAssets(foreignCleanupAsset);
    const retained = await nativeAssetSnapshot();
    const cleaned = retained.redirect_qr_assets.find(
      ({ row }) => row.id === foreignCleanupAsset,
    ).row;
    assert.equal(cleaned.state, 'deleted');
    assert.equal(cleaned.lease, null);
    assert.equal(cleaned.lease_until, null);
    assert.ok(cleaned.last_deleted_at);
    assert.ok(Date.parse(cleaned.next_cleanup_at) > Date.parse(cleaned.last_deleted_at));
    const expected = structuredClone(nativeAssetsBefore);
    const expectedAsset = expected.redirect_qr_assets.find(
      ({ row }) => row.id === foreignCleanupAsset,
    ).row;
    Object.assign(expectedAsset, {
      state: 'deleted',
      last_deleted_at: cleaned.last_deleted_at,
      next_cleanup_at: cleaned.next_cleanup_at,
    });
    assert.deepEqual(retained, expected);
    console.log(
      'Workspace native/asset isolation: actual owner HTTP hides foreign app counts and public associations; foreign app/domain/branding mutations deny before Storage. The actual internal cleanup dispatcher deletes exactly the due orphan in the provisioning workspace; referenced artwork and all private app/branding state remain unchanged.',
    );
    console.log(
      'Workspace webhook isolation: actual owner HTTP hides foreign active/archived counts and rejects foreign settings, secret rotation, test events, link filters, payload/attempt history and replay without changing foreign outbox state or budgets. Live source triggers remain enabled.',
    );
    console.log(
      'Workspace domain isolation: actual owner HTTP excludes foreign domain counts/choices and denies foreign registry/manual/provider/DNS discovery/mail receipt/recovery/cancellation before budgets or external work; exact foreign domain/job/operation/mail snapshots stay unchanged.',
    );
    console.log(
      'Workspace customer/analytics isolation: actual owner HTTP excludes foreign events and denies foreign-only profiles/journeys/updates/clear/click attribution; matching external customer/event IDs create independent local attribution with idempotent replay and private profiles; foreign snapshots remain unchanged.',
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
    for (const [kind, label] of [
      ['folders', 'folder'],
      ['tags', 'tag'],
      ['templates', 'template'],
    ]) {
      const name = 'Foreign private HTTP ' + label;
      const created = await call('/' + kind, 'POST', { name }, undefined, 201);
      assert.equal(created.workspace_id, '58aa4340-8f21-4b7f-9a10-90be2da89c01');
      assert.equal((await call('/' + kind + '/' + created.id)).name, name);
      await call('/' + kind, 'POST', { name: ' ' + name.toUpperCase() + ' ' }, undefined, 409);
      await call('/' + kind + '/' + created.id, 'DELETE');
      const foreignId = kind === 'folders' ? folder : kind === 'tags' ? tag : template;
      const table =
        kind === 'folders'
          ? 'redirect_link_folders'
          : kind === 'tags'
            ? 'redirect_link_tags'
            : 'redirect_utm_templates';
      const foreignRow = (
        await db.query('SELECT name,workspace_id FROM public.' + table + ' WHERE id=$1', [
          foreignId,
        ])
      ).rows[0];
      assert.deepEqual(foreignRow, { name, workspace_id: workspace });
    }
    console.log(
      'Workspace resource names: actual owner HTTP creates names already used by foreign folders/tags/templates, preserves within-workspace normalized uniqueness and keeps foreign rows unchanged.',
    );
    await db.exec('SAVEPOINT workspace_independent_defaults');
    const currentStyle = await call('/qr-styles/workspace');
    const updatedStyle = await call('/qr-styles/workspace', 'PATCH', {
      version: currentStyle.version,
      style: { dots: 'joined' },
    });
    assert.equal(updatedStyle.effectiveStyle.dots, 'joined');
    await db.query(
      "DELETE FROM public.redirect_domain_preferences WHERE workspace_id='58aa4340-8f21-4b7f-9a10-90be2da89c01'",
    );
    const missingPreference = await call('/domain-preference');
    assert.equal(missingPreference.version, null);
    await call('/domain-preference', 'PATCH', { domainId: null }, undefined, 400);
    const initializedPreference = await call('/domain-preference', 'PATCH', {
      version: null,
      domainId: null,
    });
    assert.equal(typeof initializedPreference.version, 'string');
    await call('/domain-preference', 'PATCH', { version: null, domainId: null }, undefined, 409);
    assert.deepEqual(
      (
        await db.query(
          "SELECT (SELECT to_jsonb(p) FROM public.redirect_domain_preferences p WHERE workspace_id=$1) AS preference,(SELECT to_jsonb(s) FROM public.redirect_qr_styles s WHERE workspace_id=$1 AND scope='workspace') AS style",
          [workspace],
        )
      ).rows[0],
      foreignDefaults,
    );
    await db.exec('ROLLBACK TO SAVEPOINT workspace_independent_defaults');
    await db.exec('RELEASE SAVEPOINT workspace_independent_defaults');
    console.log(
      'Workspace defaults: actual owner HTTP changes local QR appearance and initializes its primary preference while foreign defaults stay exact.',
    );
    const localHuman = await call(
      '/members',
      'POST',
      { kind: 'user', userId: owner, label: 'Local same-account membership', role: 'viewer' },
      undefined,
      201,
    );
    assert.equal(localHuman.workspace_id, '58aa4340-8f21-4b7f-9a10-90be2da89c01');
    assert.notEqual(localHuman.id, human);
    await call(
      '/members',
      'POST',
      { kind: 'user', userId: owner, label: 'Duplicate local membership' },
      undefined,
      409,
    );
    assert.equal((await call('/members/' + localHuman.id, 'DELETE')).deleted, true);
    const foreignHuman = (
      await db.query(
        'SELECT user_id,label,role,active FROM public.redirect_workspace_members WHERE id=$1 AND workspace_id=$2',
        [human, workspace],
      )
    ).rows[0];
    assert.deepEqual(foreignHuman, {
      user_id: owner,
      label: 'Foreign private HTTP requester',
      role: 'member',
      active: true,
    });
    console.log(
      'Workspace membership identity: actual owner HTTP creates an independent membership for the same account as a foreign workspace, rejects local duplicates and deletes only the local membership.',
    );
    console.log(
      'Workspace membership isolation: actual owner HTTP -> scoped SQL hides foreign members/credentials/resources/invitations/requests; foreign IDs cannot read/change/revoke/grant or authenticate, and foreign state stays unchanged. Temporary fixture fences roll back.',
    );
  } finally {
    await db.exec('ROLLBACK');
  }
}
