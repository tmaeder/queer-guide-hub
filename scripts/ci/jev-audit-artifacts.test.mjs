import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

test('Jev audit exports omit credentials, lease capabilities and private account identifiers', () => {
  const failures = [];
  const forbidden = /^(?:(?:p_)?lease_token|api_?key|access_token|refresh_token|client_secret|private_key|password|x-internal-secret|x-api-key|submitted_by|reporter_id|account_id|user_id)$/i;
  const walk = (value, path) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.test(key)) failures.push(`${path}.${key}`);
      if (/^authorization$/i.test(key) && typeof child === 'string' && /^(?:Bearer|Basic)\s+/i.test(child)) failures.push(`${path}.${key}`);
      walk(child, `${path}.${key}`);
    }
  };
  for (const file of readdirSync('docs/audits').filter(name => name.includes('jev-') && name.endsWith('.json'))) {
    walk(JSON.parse(readFileSync(`docs/audits/${file}`, 'utf8')), file);
  }
  // Report locations only, never a credential value, even when this check fails.
  assert.deepEqual(failures, [], 'Forbidden data in Jev audit artifacts');
});
