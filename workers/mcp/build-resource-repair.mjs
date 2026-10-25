import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerQueerGuideAgentResources } from './agent-resources.mjs';

// The MCP service predates this repository's Worker tree. Repair its recovered
// deployed bundle without rebuilding OAuth, tools or Durable Object code with
// different dependency versions. Abort if the deployed baseline has changed.
const baseline = process.argv[2];
const destination = process.argv[3];
if (!baseline || !destination)
  throw new Error(
    'Usage: node workers/mcp/build-resource-repair.mjs <downloaded-index.js> <output-directory>',
  );
const source = readFileSync(baseline, 'utf8');
const recovery = JSON.parse(readFileSync(new URL('./recovery.json', import.meta.url), 'utf8'));
const sha256 = createHash('sha256').update(source).digest('hex');
if (sha256 !== recovery.sha256)
  throw new Error('MCP baseline changed; inspect the new deployment before repairing it.');
const anchor = 'function registerResources(agent) {\n  const { server, env: env2 } = agent;';
if (source.split(anchor).length !== 2)
  throw new Error('Expected exactly one existing resource registration function.');
const documents = [
  {
    name: 'agent-guide',
    uri: 'queerguide://docs/agent-guide',
    mimeType: 'text/markdown',
    description:
      'Queer Guide onboarding, best-fit use cases, public access, source attribution and privacy boundaries.',
    text: readFileSync(new URL('../../public/llms.txt', import.meta.url), 'utf8'),
  },
  {
    name: 'public-api-schema',
    uri: 'queerguide://docs/openapi',
    mimeType: 'application/json',
    description:
      'OpenAPI 3.1 specification for the Queer Guide public read-only introductory content API.',
    text: readFileSync(new URL('../../public/openapi.json', import.meta.url), 'utf8'),
  },
];
const injection =
  '\n  registerQueerGuideAgentResources(server, ' + JSON.stringify(documents) + ');';
const repaired =
  registerQueerGuideAgentResources.toString() + '\n' + source.replace(anchor, anchor + injection);
mkdirSync(destination, { recursive: true });
writeFileSync(
  destination + '/index.js',
  repaired.replace(/\n\/\/# sourceMappingURL=index.js.map\s*$/, '\n'),
);
console.log(
  JSON.stringify(
    {
      baselineSha256: sha256,
      resources: documents.map(({ text, ...resource }) => resource),
      output: destination + '/index.js',
    },
    null,
    2,
  ),
);
