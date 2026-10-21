#!/usr/bin/env node
// Publishes lexicons/guide/queer/*.json as com.atproto.lexicon.schema records
// (rkey = NSID) on the official account, so other atproto apps can resolve the
// guide.queer.* schemas. Resolution also needs the DNS TXT record
//   _lexicon.queer.guide  "did=<the account DID>"
// Run via scripts/bluesky/publish-lexicons.sh (prompts for the app password).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AtpAgent } from '@atproto/api';

const handle = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;
if (!handle || !password) {
  console.error('Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD (an app password).');
  process.exit(2);
}

const agent = new AtpAgent({ service: 'https://bsky.social' });
await agent.login({ identifier: handle, password });
const dir = new URL('../../lexicons/guide/queer/', import.meta.url).pathname;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const lex = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const res = await agent.com.atproto.repo.putRecord({
    repo: agent.session.did,
    collection: 'com.atproto.lexicon.schema',
    rkey: lex.id,
    record: { $type: 'com.atproto.lexicon.schema', ...lex },
  });
  console.log('Published', lex.id, res.data.uri);
}
console.log('DNS: _lexicon.queer.guide TXT "did=' + agent.session.did + '"');
