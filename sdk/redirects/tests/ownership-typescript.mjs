import assert from 'node:assert/strict';
import { RedirectsClient } from '../../../tmp/sdk-tests/typescript.mjs';
const client = new RedirectsClient(process.env.REDIRECT_TEST_SESSION, {
  baseUrl: process.env.REDIRECT_TEST_BASE,
  workspaceId: process.env.REDIRECT_OWNER_WORKSPACE,
});
assert.equal(
  (await client.listWorkspaceOwners()).workspace.id,
  process.env.REDIRECT_OWNER_WORKSPACE,
);
assert.ok(
  (await client.listOwnerCandidates()).data.some(
    (row) => row.memberId === process.env.REDIRECT_OWNER_MEMBER,
  ),
);
const grant = await client.admitWorkspaceOwner(process.env.REDIRECT_OWNER_MEMBER, 'viewer');
assert.equal(grant.userId, process.env.REDIRECT_OWNER_USER);
assert.ok(grant.version);
assert.equal(grant.canRemove, true);
assert.ok((await client.removeWorkspaceOwner(grant.userId, grant.version)).removed);
