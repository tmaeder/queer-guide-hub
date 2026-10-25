#!/usr/bin/env node
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const endpoint = process.argv[2] ?? 'http://127.0.0.1:8791/mcp';
const headers = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};
async function rpc(method, params, id) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      ...(params === undefined ? {} : { params }),
      ...(id === undefined ? {} : { id }),
    }),
    signal: AbortSignal.timeout(25000),
  });
  assert(response.ok, `HTTP ${response.status} for ${method}`);
  if (response.headers.has('mcp-session-id'))
    headers['mcp-session-id'] = response.headers.get('mcp-session-id');
  const text = await response.text();
  if (!text) return null;
  const event = text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)))
    .find((data) => data.id === id);
  return event ?? JSON.parse(text);
}
const initialize = await rpc(
  'initialize',
  {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'queer-guide-readiness-verifier', version: '1.0.0' },
  },
  1,
);
assert(initialize.result?.capabilities?.resources);
headers['MCP-Protocol-Version'] = initialize.result.protocolVersion;
await rpc('notifications/initialized');
const list = await rpc('resources/list', {}, 2);
assert(list.result?.resources?.length >= 2, 'Expected at least two stable resources');
const verified = [];
for (const [index, uri] of [
  'queerguide://docs/agent-guide',
  'queerguide://docs/openapi',
].entries()) {
  const resource = list.result.resources.find((resource) => resource.uri === uri);
  assert(resource?.name && resource?.description && resource?.mimeType);
  const read = await rpc('resources/read', { uri }, 10 + index);
  const content = read.result?.contents?.find((content) => content.uri === uri);
  assert(content?.text?.length > 500);
  assert.equal(content.mimeType, resource.mimeType);
  if (resource.mimeType === 'application/json')
    assert.equal(JSON.parse(content.text).openapi, '3.1.0');
  else assert(content.text.startsWith('# Queer Guide') && content.text.includes('## When to use'));
  verified.push({ uri, mimeType: resource.mimeType, characters: content.text.length });
}
const invalid = await rpc('resources/read', { uri: 'queerguide://docs/missing' }, 20);
assert(invalid.error && typeof invalid.error.code === 'number');
const tools = await rpc('tools/list', {}, 21);
assert(tools.result?.tools?.length > 0, 'Existing tools must remain available');
const templates = await rpc('resources/templates/list', {}, 22);
assert(
  templates.result?.resourceTemplates?.some(
    (template) => template.uriTemplate === 'queerguide://city/{slug}',
  ),
);
assert(
  templates.result?.resourceTemplates?.some(
    (template) => template.uriTemplate === 'queerguide://country/{slug}',
  ),
);
const report = {
  endpoint,
  checkedAt: new Date().toISOString(),
  protocolVersion: initialize.result.protocolVersion,
  listedResources: list.result.resources.length,
  verified,
  existingTools: tools.result.tools.map((tool) => tool.name),
  existingTemplates: templates.result.resourceTemplates.map((template) => template.uriTemplate),
  unknownResourceError: invalid.error.code,
  passed: true,
};
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
