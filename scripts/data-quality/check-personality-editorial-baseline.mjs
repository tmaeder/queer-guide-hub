import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { assertEditorialBaselineRatchet } from './audit-personality-editorial.ts';
const path = 'docs/editorial/personality-editorial-baseline.json';
const next = JSON.parse(readFileSync(path, 'utf8'));
const base = process.env.BASE_SHA || 'HEAD^';
if (process.env.BASE_SHA && !/^[a-f0-9]{40}$/i.test(base))
  throw Error('Invalid baseline comparison commit');
const exists =
  spawnSync('git', ['cat-file', '-e', `${base}:${path}`], { stdio: 'ignore' }).status === 0;
if (exists) {
  const previous = JSON.parse(
    execFileSync('git', ['show', `${base}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  assertEditorialBaselineRatchet(previous, next);
  console.log(
    `Legacy exceptions only decreased: ${Object.keys(previous.allowed).length} → ${Object.keys(next.allowed).length}`,
  );
} else
  console.log(
    `Bootstrapped ${Object.keys(next.allowed).length} legacy exceptions; future updates may only remove them.`,
  );
