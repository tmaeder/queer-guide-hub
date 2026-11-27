import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile as rawExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import path from 'node:path';
const execFile = promisify(rawExecFile);
const pgBin =
  process.env.PG_BIN ??
  (existsSync('/opt/homebrew/opt/postgresql@17/bin/initdb')
    ? '/opt/homebrew/opt/postgresql@17/bin'
    : '');
const binary = (name) => (pgBin ? path.join(pgBin, name) : name);
const directory = await mkdtemp('/tmp/qg-knowledge-test-');
const socketServer = createServer();
await new Promise((resolve) => socketServer.listen(0, '127.0.0.1', resolve));
const port = socketServer.address().port;
await new Promise((resolve) => socketServer.close(resolve));
let started = false;
async function run(name, args) {
  return execFile(binary(name), args, { maxBuffer: 8 * 1024 * 1024 });
}
try {
  await run('initdb', ['-D', `${directory}/data`, '-A', 'trust']);
  await run('pg_ctl', [
    '-w',
    '-D',
    `${directory}/data`,
    '-l',
    `${directory}/server.log`,
    '-o',
    `-p ${port} -k ${directory}`,
    'start',
  ]);
  started = true;
  const args = ['-h', directory, '-p', String(port), '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
  await run('psql', [
    ...args,
    '-f',
    'supabase/tests/fixtures/knowledge_editorial_schema.sql',
    '-f',
    'supabase/migrations/20261127175349_knowledge_editorial_workflow.sql',
    '-f',
    'supabase/tests/knowledge_editorial.sql',
    '-f',
    'supabase/tests/knowledge_editorial_automation.sql',
  ]);
  const manifest = JSON.parse(await readFile('docs/knowledge/pilot-manifest.json', 'utf8'));
  const literal = (value) =>
    value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
  const sql = ['BEGIN;'];
  for (const entry of manifest.entries) {
    const snapshot = entry.base_snapshot;
    const body = entry.entity_type === 'unified_tags' ? 'long_description' : 'bio';
    const columns = ['id', 'name', 'slug', 'description', body];
    const values = [entry.entity_id, entry.name, entry.slug, snapshot.description, snapshot[body]];
    if (entry.entity_type === 'unified_tags') {
      columns.push('category');
      values.push(entry.pilot_group);
    }
    sql.push(
      `INSERT INTO public.${entry.entity_type}(${columns.join(',')}) VALUES(${values.map(literal).join(',')});`,
    );
  }
  sql.push(
    "SELECT set_config('request.jwt.claim.role','service_role',true);",
    `SELECT public.knowledge_editorial_import(${literal(JSON.stringify(manifest))}::jsonb);`,
    `SELECT public.knowledge_editorial_import(${literal(JSON.stringify(manifest))}::jsonb);`,
    "DO $$ BEGIN IF (SELECT count(*) FROM public.knowledge_editorial_entries)<>30 OR (SELECT count(*) FROM public.knowledge_editorial_proposals)<>30 THEN RAISE EXCEPTION 'pilot import not complete or idempotent'; END IF; END $$;",
    'ROLLBACK;',
  );
  await writeFile(`${directory}/import.sql`, sql.join('\n'));
  await run('psql', [...args, '-f', `${directory}/import.sql`]);
  console.log(
    'PostgreSQL integration and thirty-entry idempotent import passed. No hosted database was contacted.',
  );
} catch (error) {
  console.error(error.stderr ?? error.message);
  process.exitCode = 1;
} finally {
  if (started) await run('pg_ctl', ['-w', '-D', `${directory}/data`, 'stop', '-m', 'fast']);
  await rm(directory, { recursive: true, force: true });
}
