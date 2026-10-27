import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queerGuideMemberMetadata } from './member-metadata.mjs';

test('RFC 9728 metadata describes the existing member capability and bearer transport', () => {
  assert.deepEqual(queerGuideMemberMetadata('https://mcp.queer.guide'), {
    resource: 'https://mcp.queer.guide/authed',
    resource_name: 'Queer Guide member MCP',
    authorization_servers: ['https://mcp.queer.guide'],
    scopes_supported: ['member'],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://queer.guide/docs',
  });
});
