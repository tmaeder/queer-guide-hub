import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyMemberIntegrationHttp(db, request, membership) {
  const account = 'fixture-other-account-session';
  const setupIds = [],
    tokenIds = [];
  const folder = await request(
    '/folders',
    'POST',
    { name: 'Integration HTTP folder' },
    undefined,
    201,
  );
  const { link } = await request(
    '/links',
    'POST',
    {
      slug: 'integration-http-fixture',
      target: 'https://example.org/integration-http',
      folderId: folder.id,
    },
    undefined,
    201,
  );
  const { link: other } = await request(
    '/links',
    'POST',
    {
      slug: 'integration-http-other',
      target: 'https://example.org/integration-other',
      folderId: folder.id,
    },
    undefined,
    201,
  );
  const setup = {
    requestId: randomUUID(),
    provider: 'segment',
    name: 'Member HTTP adapter',
    linkIds: [link.id],
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  };
  const event = {
    clickId: '',
    customerExternalId: 'integration-http-customer',
    eventId: 'integration-http-' + randomUUID(),
    eventName: 'Sign up',
  };
  try {
    await request('/integrations', 'POST', setup, account, 403);
    await request('/members/' + membership, 'PATCH', { role: 'billing' });
    await request('/integrations', 'POST', setup, account, 403);
    await request('/integrations', 'GET', undefined, account);
    await request('/members/' + membership, 'PATCH', { role: 'member' });
    await db.query(
      "INSERT INTO public.redirect_folder_members(folder_id,member_id,permission) VALUES($1,$2,'edit')",
      [folder.id, membership],
    );
    const created = await request('/integrations', 'POST', setup, account, 201);
    setupIds.push(created.installation.id);
    assert.match(created.credential, /^qg_redirect_[a-f0-9]{64}$/);
    const key = (
      await db.query(
        'SELECT t.* FROM public.redirect_api_tokens t JOIN redirect_internal.integration_installations i ON i.key_id=t.id AND i.workspace_id=t.workspace_id WHERE i.id=$1',
        [created.installation.id],
      )
    ).rows[0];
    tokenIds.push(key.id);
    assert.deepEqual(key.scopes, ['conversions:write']);
    assert.deepEqual(key.redirect_ids, [link.id]);
    assert.equal(key.member_id, membership);
    const replay = await request('/integrations', 'POST', setup, account);
    assert.equal(replay.created, false);
    assert.equal(replay.credential, null);
    assert.equal(replay.installation.id, created.installation.id);
    await request('/integrations', 'POST', { ...setup, name: 'Changed replay' }, account, 409);
    await request(
      '/integrations',
      'POST',
      { ...setup, requestId: randomUUID(), scopes: ['workspace:write'] },
      account,
      400,
    );
    await request(
      '/integrations',
      'POST',
      { ...setup, requestId: randomUUID(), linkIds: [randomUUID()] },
      account,
      403,
    );
    assert.equal(
      (await request('/integrations?requestId=' + setup.requestId, 'GET', undefined, account))
        .installation.id,
      created.installation.id,
    );
    const page = await request('/integrations', 'GET', undefined, account);
    assert.ok(page.data.some((row) => row.id === created.installation.id));
    for (const row of page.data)
      for (const field of ['credential', 'token_hash', 'key_id', 'member_id', 'created_by'])
        assert.equal(field in row, false);
    await request('/integrations', 'GET', undefined, created.credential, 403);
    await request('/links', 'GET', undefined, created.credential, 403);
    await request('/tokens', 'POST', {}, account, 403);
    await request('/integrations?limit=0', 'GET', undefined, account, 400);
    await request('/integrations?limit=1&limit=2', 'GET', undefined, account, 400);
    await request('/integrations', 'PATCH', {}, account, 405);
    const click = async (id, path) =>
      (
        await db.query(
          "SELECT public.record_redirect_visit($1,$2,NULL,NULL,'Fixture browser','CH',NULL,302,NULL,'https://example.org/integration','{}') AS id",
          [id, path],
        )
      ).rows[0].id;
    event.clickId = await click(link.id, '/go/integration-http-fixture');
    const otherClick = await click(other.id, '/go/integration-http-other');
    const conversion = await request('/track/lead', 'POST', event, created.credential, 201);
    assert.equal(conversion.duplicate, false);
    assert.equal((await request('/track/lead', 'POST', event, created.credential)).duplicate, true);
    await request(
      '/track/lead',
      'POST',
      {
        ...event,
        clickId: otherClick,
        eventId: randomUUID(),
        customerExternalId: 'integration-http-other',
      },
      created.credential,
      403,
    );
    await db.query(
      "UPDATE public.redirect_folder_members SET permission='view' WHERE folder_id=$1 AND member_id=$2",
      [folder.id, membership],
    );
    await request(
      '/track/lead',
      'POST',
      { ...event, eventId: randomUUID() },
      created.credential,
      403,
    );
    await db.query(
      "UPDATE public.redirect_folder_members SET permission='edit' WHERE folder_id=$1 AND member_id=$2",
      [folder.id, membership],
    );
    await request('/members/' + membership, 'PATCH', { role: 'billing' });
    await request(
      '/track/lead',
      'POST',
      { ...event, eventId: randomUUID() },
      created.credential,
      403,
    );
    assert.equal(
      (await request('/integrations', 'GET', undefined, account)).data.find(
        (row) => row.id === created.installation.id,
      ).canRevoke,
      false,
    );
    await request('/members/' + membership, 'PATCH', { role: 'member' });
    const revoked = await request(
      '/integrations/' + created.installation.id,
      'DELETE',
      undefined,
      account,
    );
    assert.equal(revoked.status, 'revoked');
    await request(
      '/track/lead',
      'POST',
      { ...event, eventId: randomUUID() },
      created.credential,
      403,
    );
    assert.ok(
      (await db.query('SELECT revoked_at FROM public.redirect_api_tokens WHERE id=$1', [key.id]))
        .rows[0].revoked_at,
    );
    console.log(
      'Member integrations: actual HTTP → SQL creates one-time purpose/selected-link/member-bound conversion credentials, replays stable setup IDs without new keys, records idempotent attributed conversions, denies read-only roles/generic key administration/unselected or newly forbidden links, and atomically revokes. No external provider installation is claimed.',
    );
  } finally {
    for (const id of setupIds)
      await db.query('DELETE FROM redirect_internal.integration_installations WHERE id=$1', [id]);
    for (const id of tokenIds)
      await db.query('DELETE FROM public.redirect_api_tokens WHERE id=$1', [id]);
    await request('/links/' + link.id, 'DELETE');
    await request('/links/' + other.id, 'DELETE');
    await request('/folders/' + folder.id, 'DELETE');
    await request('/members/' + membership, 'PATCH', { role: 'viewer' });
  }
}
