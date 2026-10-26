import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const fixture = `
function registerResources(agent) {
  const { server, env: env2 } = agent;
  server.originalResourcesPresent = true;
}
async function rpc(env2, fn, args) { return { original: fn }; }
async function originalSearch(query) {
  const p_query_vec = await embedQuery(env2, query);
  return p_query_vec;
}
//# sourceMappingURL=index.js.map
`;

function project(t, source = fixture) {
  const root = mkdtempSync(join(tmpdir(), 'qg-mcp-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'workers/mcp');
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(root, 'public'));
  for (const name of ['build-resource-repair.mjs', 'agent-resources.mjs', 'public-queries.mjs'])
    copyFileSync(new URL(name, import.meta.url), join(directory, name));
  writeFileSync(join(root, 'public/llms.txt'), '# Queer Guide\nWhen to use the guide.');
  writeFileSync(join(root, 'public/openapi.json'), '{"openapi":"3.1.0"}');
  writeFileSync(join(directory, 'recovery.json'), JSON.stringify({
    sha256: createHash('sha256').update(source).digest('hex'),
  }));
  const baseline = join(root, 'baseline.js');
  writeFileSync(baseline, source);
  return {
    baseline,
    build() {
      execFileSync(process.execPath, [join(directory, 'build-resource-repair.mjs'), baseline, join(root, 'built')],
        { stdio: 'pipe' });
      return readFileSync(join(root, 'built/index.js'), 'utf8');
    },
  };
}

test('built recovery bundle registers docs, dispatches only public reads and preserves other RPCs', async (t) => {
  const source = project(t).build();
  assert(!source.includes('sourceMappingURL='));
  const calls = [];
  const context = vm.createContext({
    AbortSignal, Uint8Array, TextDecoder,
    fetch: async (url, init) => {
      calls.push(url);
      assert(!('Authorization' in init.headers));
      return Response.json(url.endsWith('/search') ? { hits: [{ objectID: 'city' }] }
        : url.endsWith('/autocomplete') ? { suggestions: [] }
          : url.endsWith('/similar') ? { results: [] } : { recommendations: [] });
    },
    embedQuery() { assert.fail('search proxy owns embedding'); },
  });
  vm.runInContext(source, context);
  const server = { resource: (...args) => calls.push(args[1]) };
  context.registerResources({ server, env: {} });
  assert(server.originalResourcesPresent);
  assert(calls.includes('queerguide://docs/agent-guide'));
  assert(calls.includes('queerguide://docs/openapi'));
  const json = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(json(await context.rpc({}, 'search_hybrid', { p_query: 'city' })),
    { hits: [{ objectID: 'city' }] });
  assert.deepEqual(json(await context.rpc({}, 'search_autocomplete', { p_prefix: 'ci' })), []);
  assert.deepEqual(json(await context.rpc({}, 'get_recommendations', {})), []);
  assert.deepEqual(json(await context.rpc({}, 'related_entities', {})), []);
  const count = calls.length;
  assert.deepEqual(json(await context.rpc({}, 'get_entity_detail', {})), { original: 'get_entity_detail' });
  assert.equal(calls.length, count);
  assert.equal(await context.originalSearch('city'), null);
});

test('builder refuses code changed after the recorded fingerprint', (t) => {
  const fixtureProject = project(t);
  writeFileSync(fixtureProject.baseline, fixture + '\nchanged();');
  assert.throws(fixtureProject.build, /MCP baseline changed/);
});

test('builder refuses missing or ambiguous registration/RPC/embedding anchors', (t) => {
  for (const source of [
    fixture.replace('function registerResources(agent)', 'function renamed(agent)'),
    fixture + fixture,
    fixture.replace('async function rpc(env2, fn, args)', 'async function renamedRpc(env2, fn, args)'),
    fixture.replace('const p_query_vec = await embedQuery(env2, query);', 'const p_query_vec = null;'),
  ]) assert.throws(project(t, source).build, /Expected exactly one/);
});
