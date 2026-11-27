// Execute the actual migration and behavioral tests on disposable PostgreSQL.
// Needs PostgreSQL 17 binaries on PATH, or PG_BIN pointing to their directory.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = mkdtempSync(join(tmpdir(), 'qg-dating-tests-'));
const bin = (name) => (process.env.PG_BIN ? join(process.env.PG_BIN, name) : name);
const run = (name, args) =>
  execFileSync(bin(name), args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
let started = false;
try {
  run('initdb', ['-D', join(directory, 'data'), '-A', 'trust', '--no-locale', '-E', 'UTF8']);
  run('pg_ctl', [
    '-D',
    join(directory, 'data'),
    '-l',
    join(directory, 'server.log'),
    '-o',
    `-p 55484 -k ${directory} -h ''`,
    '-w',
    'start',
  ]);
  started = true;
  const psql = [
    '-h',
    directory,
    '-p',
    '55484',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-X',
    '-q',
    '-A',
    '-t',
  ];
  const migration = readdirSync(join(root, 'supabase/migrations')).find((f) =>
    f.endsWith('_strict_mutual_dating_matching.sql'),
  );
  for (const file of [
    'supabase/tests/fixtures/dating_matching_schema.sql',
    `supabase/migrations/${migration}`,
    'supabase/tests/strict_mutual_dating_matching.sql',
  ]) {
    process.stdout.write(run('psql', [...psql, '-f', file]));
  }
  process.stdout.write('Strict mutual matching PostgreSQL checks passed.\n');
} catch (error) {
  process.stderr.write(error.stderr?.toString() ?? error.message);
  process.exitCode = 1;
} finally {
  if (started) run('pg_ctl', ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop']);
  rmSync(directory, { recursive: true, force: true });
}
