import assert from 'node:assert/strict';

export async function verifyBillingAndTagHttp(db, request, membership) {
  const credential = 'fixture-other-account-session';
  const folder = await request('/folders', 'POST', { name: 'Billing HTTP folder' }, undefined, 201);
  const { link } = await request(
    '/links',
    'POST',
    {
      slug: 'billing-http-fixture',
      target: 'https://example.org/billing-http',
      folderId: folder.id,
    },
    undefined,
    201,
  );
  async function information() {
    for (const kind of ['domains', 'tokens', 'webhooks']) {
      const page = await request(
        '/workspace-information?kind=' + kind,
        'GET',
        undefined,
        credential,
      );
      assert.ok(Array.isArray(page.data));
      assert.ok(page.count >= 0);
      for (const row of page.data) {
        for (const privateField of [
          'token_hash',
          'verification_token',
          'secret',
          'previous_secret',
          'url',
          'body',
          'created_by',
        ])
          assert.equal(privateField in row, false);
      }
    }
  }
  try {
    await db.query(
      "INSERT INTO public.redirect_folder_members(folder_id,member_id,permission) VALUES($1,$2,'owner')",
      [folder.id, membership],
    );
    await request('/members/' + membership, 'PATCH', { role: 'billing' });
    assert.equal((await request('/session', 'GET', undefined, credential)).role, 'billing');
    await information();
    await request(
      '/workspace-information?kind=domains&kind=tokens',
      'GET',
      undefined,
      credential,
      400,
    );
    await request('/workspace-information?kind=domains&after=', 'GET', undefined, credential, 400);
    await request('/workspace-information?kind=domains', 'POST', {}, credential, 405);
    assert.equal(
      (await request('/workspaces', 'GET', undefined, credential)).data[0].role,
      'billing',
    );
    assert.equal((await request('/links/' + link.id, 'GET', undefined, credential)).canEdit, false);
    assert.equal(
      (await request('/folders/' + folder.id, 'GET', undefined, credential)).canManage,
      false,
    );
    await request('/analytics', 'POST', { filters: {} }, credential);
    await request('/links/' + link.id, 'PATCH', { notes: 'Denied billing edit' }, credential, 403);
    await request(
      '/links',
      'POST',
      { target: 'https://example.org/denied-billing' },
      credential,
      403,
    );
    await request('/folders', 'POST', { name: 'Denied billing folder' }, credential, 403);
    await request('/tags', 'POST', { name: 'Denied billing tag' }, credential, 403);
    await request('/tokens', 'POST', {}, credential, 403);
    await request('/members', 'GET', undefined, credential, 403);
    await request('/members/' + membership, 'PATCH', { role: 'member' });
    await information();
    const tag = await request(
      '/tags',
      'POST',
      { name: 'Member HTTP tag', color: 'purple' },
      credential,
      201,
    );
    const changed = await request(
      '/tags/' + tag.id,
      'PATCH',
      { name: 'Member HTTP renamed tag', color: 'blue' },
      credential,
    );
    assert.equal(changed.name, 'Member HTTP renamed tag');
    assert.equal(changed.color, 'blue');
    assert.equal((await request('/tags/' + tag.id, 'DELETE', undefined, credential)).deleted, true);
    await request('/members/' + membership, 'PATCH', { role: 'viewer' });
    await information();
    await request('/tags', 'POST', { name: 'Denied viewer tag' }, credential, 403);
    console.log(
      'Billing and member tags: actual owner/member HTTP → migrated SQL proves owner-assigned/in-session Billing, read-only links/analytics despite folder-owner overrides, owner-admin denial, member tag CRUD and preserved viewer denial. No billing provider or payout authority is granted.',
    );
  } finally {
    await request('/links/' + link.id, 'DELETE');
    await request('/folders/' + folder.id, 'DELETE');
  }
}
