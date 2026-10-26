#!/usr/bin/env node
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const endpoint = process.argv[2] ?? 'https://mcp.queer.guide/mcp';
const proxyOnly = process.argv.includes('--proxy-only');
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
let sequence = 0;
async function rpc(method, params, notification = false) {
  const id = notification ? undefined : ++sequence;
  const response = await fetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(id ? { id } : {}) }),
    signal: AbortSignal.timeout(25000),
  });
  assert(response.ok, `${method}: HTTP ${response.status}`);
  if (response.headers.has('mcp-session-id')) headers['mcp-session-id'] = response.headers.get('mcp-session-id');
  const text = await response.text();
  if (!text) return null;
  return text.split('\n').filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6))).find((event) => event.id === id) ?? JSON.parse(text);
}
const initialize = await rpc('initialize', {
  protocolVersion: '2025-06-18', capabilities: {},
  clientInfo: { name: 'queer-guide-public-tool-verifier', version: '1.0.0' },
});
assert(initialize.result?.protocolVersion);
headers['MCP-Protocol-Version'] = initialize.result.protocolVersion;
await rpc('notifications/initialized', undefined, true);
const checks = [];
async function call(name, args, field, array = true) {
  const result = await rpc('tools/call', { name, arguments: args });
  assert(!result.error && !result.result?.isError, `${name}: ${JSON.stringify(result)}`);
  const text = result.result?.content?.find((item) => item.type === 'text')?.text;
  assert(text, `${name}: missing JSON text`);
  const data = JSON.parse(text)[field];
  assert(array ? Array.isArray(data) : data && typeof data === 'object', `${name}: invalid ${field}`);
  checks.push({ tool: name, passed: true, ...(array ? { rows: data.length } : {}) });
  return data;
}
const hits = await call('search', { query: 'Zurich', types: ['city'], limit: 1 }, 'hits');
assert(hits.length && typeof hits[0].objectID === 'string' && hits[0].type === 'city', 'Expected a public city seed');
await call('autocomplete', { prefix: 'Zur', types: ['city'], limit: 1 }, 'suggestions');
await call('recommendations', { types: ['city'], limit: 1 }, 'recommendations');
await call('find_related', { entity_type: 'city', entity_id: hits[0].objectID, types: ['city'], limit: 1 }, 'related');
if (!proxyOnly) {
  await call('get_entity', { type: 'city', id: hits[0].objectID }, 'entity', false);
  const now = new Date();
  await call('events_in_window', {
    start: now.toISOString(), end: new Date(now.getTime() + 7 * 86400000).toISOString(), limit: 1,
  }, 'events');
  await call('on_this_day', { date: now.toISOString().slice(0, 10), limit: 1 }, 'people');
  await call('knowledge', { query: 'LGBTQ+ travel in Switzerland' }, 'passages');
  const list = await rpc('resources/list', {});
  for (const type of ['city', 'country']) {
    const resource = list.result?.resources?.find((item) => item.uri.startsWith(`queerguide://${type}/`));
    assert(resource, `No public ${type} template resource listed`);
    const result = await rpc('resources/read', { uri: resource.uri });
    assert(!result.error, `${type} resource read: ${JSON.stringify(result.error)}`);
    const content = result.result?.contents?.find((item) => item.uri === resource.uri);
    assert.equal(content?.mimeType, 'application/json');
    assert(content.text.length > 20 && JSON.parse(content.text));
    checks.push({ resource: type, passed: true });
  }
}
const report = {
  endpoint, checkedAt: new Date().toISOString(), proxyOnly, passed: true, checks,
  scope: 'Anonymous public reads only; no member actions, OAuth registration, sign-in email or data writes.',
};
if (process.argv[3] && !process.argv[3].startsWith('--'))
  writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
