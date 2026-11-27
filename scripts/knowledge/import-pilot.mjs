import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
const file = process.argv[2] ?? 'docs/knowledge/pilot-manifest.json';
const manifest = JSON.parse(await readFile(file, 'utf8'));
if (manifest.entries?.length !== 30) throw new Error('Expected a frozen thirty-entry manifest');
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify({ name: manifest.name, entries: manifest.entries.length, drafts: manifest.entries.filter((e) => e.patch).length, action: 'dry run; add --apply to stage drafts. This never publishes.' }, null, 2));
} else {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('knowledge_editorial_import', { p_manifest: manifest });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data));
}
