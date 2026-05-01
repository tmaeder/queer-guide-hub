#!/usr/bin/env node
/**
 * Local feedback routine runner daemon.
 *
 * Polls Supabase for runs claimed for runner='local', shells out to the
 * `claude` CLI headless, opens a PR via `gh`, and posts results back via
 * the SECURITY DEFINER RPCs.
 *
 * Required env (load via .env or shell):
 *   SUPABASE_URL                 — project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — service-role key (sensitive)
 *   FEEDBACK_RUNNER_REPO_PATH    — absolute path to a git checkout of the repo;
 *                                  the daemon clones a worktree from here per run
 *   FEEDBACK_RUNNER_REMOTE       — git remote to push branches to (default: 'origin')
 *
 * Optional:
 *   FEEDBACK_RUNNER_POLL_MS=30000     — poll interval (default 30s)
 *   FEEDBACK_RUNNER_BRANCH_PREFIX     — defaults to 'feat/claude-fix-'
 *   FEEDBACK_RUNNER_CLAUDE_BIN        — path to claude CLI (default 'claude')
 *   FEEDBACK_RUNNER_GH_BIN            — path to gh CLI (default 'gh')
 *   FEEDBACK_RUNNER_BASE_BRANCH       — base branch for PRs (default 'main')
 *   FEEDBACK_RUNNER_MAX_TURNS         — claude --max-turns value (default 30)
 *   FEEDBACK_RUNNER_DRY_RUN=1         — log everything, do not actually run claude / push / PR
 *
 * Usage:
 *   node scripts/feedback-runner-local.mjs
 *   # or in dry-run / oneshot mode:
 *   FEEDBACK_RUNNER_DRY_RUN=1 node scripts/feedback-runner-local.mjs --once
 */

import { createClient } from '@supabase/supabase-js';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REPO_PATH = process.env.FEEDBACK_RUNNER_REPO_PATH;
const REMOTE = process.env.FEEDBACK_RUNNER_REMOTE || 'origin';
const BRANCH_PREFIX = process.env.FEEDBACK_RUNNER_BRANCH_PREFIX || 'feat/claude-fix-';
const BASE_BRANCH = process.env.FEEDBACK_RUNNER_BASE_BRANCH || 'main';
const CLAUDE_BIN = process.env.FEEDBACK_RUNNER_CLAUDE_BIN || 'claude';
const GH_BIN = process.env.FEEDBACK_RUNNER_GH_BIN || 'gh';
const POLL_MS = Number.parseInt(process.env.FEEDBACK_RUNNER_POLL_MS ?? '30000', 10);
const MAX_TURNS = Number.parseInt(process.env.FEEDBACK_RUNNER_MAX_TURNS ?? '30', 10);
const DRY_RUN = process.env.FEEDBACK_RUNNER_DRY_RUN === '1';
const ONCE = process.argv.includes('--once');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}
if (!REPO_PATH) {
  console.error('FEEDBACK_RUNNER_REPO_PATH is required (absolute path to a queer-guide-hub clone)');
  process.exit(2);
}

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

function makeWorktree(runId) {
  const tmp = mkdtempSync(join(tmpdir(), 'feedback-runner-'));
  const wt = join(tmp, 'work');
  log(`creating worktree at ${wt}`);
  git(['fetch', REMOTE, BASE_BRANCH], REPO_PATH);
  const branchName = `${BRANCH_PREFIX}${runId}`;
  git(['worktree', 'add', '-b', branchName, wt, `${REMOTE}/${BASE_BRANCH}`], REPO_PATH);
  return { wt, tmp, branchName };
}

function dropWorktree(wt, tmp) {
  try {
    git(['worktree', 'remove', '--force', wt], REPO_PATH);
  } catch (e) {
    log('worktree remove failed (ignored):', e.message);
  }
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function runClaude(prompt, cwd) {
  return new Promise((resolve, reject) => {
    if (DRY_RUN) {
      log(`[dry-run] would run claude in ${cwd} with prompt of ${prompt.length} chars`);
      resolve({ stdout: '[dry-run] no changes', stderr: '' });
      return;
    }
    const proc = spawn(
      CLAUDE_BIN,
      ['-p', '--max-turns', String(MAX_TURNS), '--permission-mode', 'acceptEdits'],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr || stdout}`));
      else resolve({ stdout, stderr });
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

function detectChanges(cwd) {
  const files = git(['diff', '--name-only', 'HEAD', '--'], cwd);
  return files ? files.split('\n').filter(Boolean) : [];
}

function commitAndPush(cwd, branchName, runId, storyId) {
  if (DRY_RUN) {
    log(`[dry-run] would commit + push ${branchName}`);
    return { commitSha: 'dry-run-sha', pushed: false };
  }
  git(['config', 'user.name', 'claude-fix-bot'], cwd);
  git(['config', 'user.email', 'noreply@anthropic.com'], cwd);
  git(['add', '-A'], cwd);
  git(
    [
      'commit',
      '-m',
      `feat(claude-fix): automated fix for feedback story ${storyId}`,
      '-m',
      `Run: ${runId}`,
    ],
    cwd,
  );
  git(['push', '-u', REMOTE, branchName], cwd);
  return { commitSha: git(['rev-parse', 'HEAD'], cwd), pushed: true };
}

function openPr(cwd, branchName, storyId, runId) {
  if (DRY_RUN) return `https://github.com/dry-run/pr/${runId}`;
  const r = spawnSync(
    GH_BIN,
    [
      'pr',
      'create',
      '--base',
      BASE_BRANCH,
      '--head',
      branchName,
      '--title',
      `Claude fix: feedback story ${storyId.slice(0, 8)}`,
      '--body',
      `Automated fix produced by the local Claude routine runner for feedback story \`${storyId}\` (routine run \`${runId}\`). Review the diff before merging.`,
    ],
    { cwd, encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`gh pr create failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

async function handleRoutineRun(run) {
  log(`claiming routine run ${run.id} (story ${run.story_id})`);
  await supa.rpc('record_routine_progress', {
    p_run_id: run.id,
    p_status: 'in_progress',
    p_payload: { runner: 'local', phase: 'claiming' },
    p_external_ref: run.external_ref,
    p_actor_kind: 'runner',
  });

  let wt, tmp, branchName;
  try {
    ({ wt, tmp, branchName } = makeWorktree(run.id));

    log('running claude…');
    await runClaude(run.prompt, wt);

    const filesChanged = detectChanges(wt);
    if (filesChanged.length === 0) {
      log('no diff — marking failed');
      await supa.rpc('record_routine_progress', {
        p_run_id: run.id,
        p_status: 'failed',
        p_payload: { error: 'claude produced no diff' },
        p_external_ref: null,
        p_actor_kind: 'runner',
      });
      return;
    }

    const { commitSha } = commitAndPush(wt, branchName, run.id, run.story_id);
    const prUrl = openPr(wt, branchName, run.story_id, run.id);

    log(`fix proposed: ${prUrl} (${filesChanged.length} files)`);
    await supa.rpc('record_fix_proposed', {
      p_run_id: run.id,
      p_pr_url: prUrl,
      p_commit_sha: commitSha,
      p_files: filesChanged,
      p_summary: `Local Claude runner produced a fix touching ${filesChanged.length} file(s).`,
      p_confidence: 'medium',
      p_risks: 'Auto-generated by local runner. Review the diff before merging.',
      p_actor_kind: 'runner',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`run ${run.id} failed:`, msg);
    await supa.rpc('record_routine_progress', {
      p_run_id: run.id,
      p_status: 'failed',
      p_payload: { error: msg },
      p_external_ref: null,
      p_actor_kind: 'runner',
    });
  } finally {
    if (wt && tmp) dropWorktree(wt, tmp);
  }
}

async function handleRetest(retest) {
  log(`claiming retest ${retest.id} (kind=${retest.kind})`);
  // Pull the routine run + branch.
  const { data: run } = await supa
    .from('feedback_routine_runs')
    .select('id,story_id,files_changed')
    .eq('id', retest.routine_run_id)
    .single();
  if (!run) {
    await supa.rpc('record_retest_result', {
      p_retest_id: retest.id,
      p_status: 'error',
      p_result: { error: 'routine_run_not_found' },
      p_external_ref: null,
      p_actor_kind: 'runner',
    });
    return;
  }
  const branchName = `${BRANCH_PREFIX}${run.id}`;
  let wt, tmp;
  try {
    git(['fetch', REMOTE, branchName], REPO_PATH);
    const tmpDir = mkdtempSync(join(tmpdir(), 'feedback-retest-'));
    wt = join(tmpDir, 'work');
    tmp = tmpDir;
    git(['worktree', 'add', wt, `${REMOTE}/${branchName}`], REPO_PATH);

    if (DRY_RUN) {
      log('[dry-run] would npm ci + run', retest.kind);
      await supa.rpc('record_retest_result', {
        p_retest_id: retest.id,
        p_status: 'passed',
        p_result: { kind: retest.kind, dry_run: true },
        p_external_ref: null,
        p_actor_kind: 'runner',
      });
      return;
    }

    spawnSync('npm', ['ci'], { cwd: wt, stdio: 'inherit' });

    const cmd = pickRetestCommand(retest.kind, run.files_changed ?? []);
    const r = spawnSync(cmd.bin, cmd.args, { cwd: wt, encoding: 'utf8' });
    const passed = r.status === 0;
    const log_excerpt = (r.stdout + r.stderr).split('\n').slice(-80).join('\n');
    await supa.rpc('record_retest_result', {
      p_retest_id: retest.id,
      p_status: passed ? 'passed' : 'failed',
      p_result: { kind: retest.kind, exit_code: r.status, log_excerpt },
      p_external_ref: null,
      p_actor_kind: 'runner',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`retest ${retest.id} failed:`, msg);
    await supa.rpc('record_retest_result', {
      p_retest_id: retest.id,
      p_status: 'error',
      p_result: { error: msg },
      p_external_ref: null,
      p_actor_kind: 'runner',
    });
  } finally {
    if (wt && tmp) dropWorktree(wt, tmp);
  }
}

function pickRetestCommand(kind, filesChanged) {
  switch (kind) {
    case 'typecheck':
      return { bin: 'npm', args: ['run', 'typecheck'] };
    case 'lint':
      return { bin: 'npm', args: ['run', 'lint'] };
    case 'unit':
      return { bin: 'npm', args: ['test'] };
    case 'e2e':
      return { bin: 'npx', args: ['playwright', 'test', '--reporter=line'] };
    case 'targeted':
      if (filesChanged.length > 0) {
        return { bin: 'npx', args: ['vitest', 'run', '--related', ...filesChanged] };
      }
      return { bin: 'npm', args: ['test'] };
    default:
      return { bin: 'echo', args: [`unknown kind ${kind}`] };
  }
}

async function tick() {
  // 1) routine runs ready to claim
  const { data: runs, error: runErr } = await supa
    .from('feedback_routine_runs')
    .select('id,story_id,prompt,external_ref,status,runner')
    .eq('runner', 'local')
    .eq('status', 'dispatched')
    .order('created_at', { ascending: true })
    .limit(1);
  if (runErr) {
    log('poll fix runs error:', runErr.message);
  } else if (runs && runs.length > 0) {
    await handleRoutineRun(runs[0]);
  }

  // 2) retests ready to claim
  const { data: retests, error: retestErr } = await supa
    .from('feedback_retest_runs')
    .select('id,routine_run_id,kind,status,runner')
    .eq('runner', 'local')
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: true })
    .limit(1);
  if (retestErr) {
    log('poll retest error:', retestErr.message);
  } else if (retests && retests.length > 0) {
    await handleRetest(retests[0]);
  }
}

async function main() {
  log(`local feedback runner starting (dry_run=${DRY_RUN}, repo=${REPO_PATH})`);
  // Sanity: repo path is a git working tree.
  try {
    git(['rev-parse', '--git-dir'], REPO_PATH);
  } catch (e) {
    console.error(`FEEDBACK_RUNNER_REPO_PATH is not a git checkout: ${e.message}`);
    process.exit(2);
  }

  if (ONCE) {
    await tick();
    return;
  }
  for (;;) {
    try {
      await tick();
    } catch (e) {
      log('tick error:', e instanceof Error ? e.message : String(e));
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
