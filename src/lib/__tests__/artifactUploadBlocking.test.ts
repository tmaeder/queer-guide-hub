import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One rule for every `actions/upload-artifact` step in the repo:
 *
 *   A REPORT is non-blocking. A DELIVERABLE is not.
 *
 * A report is a diagnostic written after the assertions have already run — a
 * coverage summary, a Playwright HTML report, a Lighthouse JSON dump. If
 * GitHub cannot store it, the job still learned everything it was there to
 * learn, so failing the check reports a green test run as red. That is not
 * hypothetical: on 2026-09-08 the artifact service returned
 * `403 Forbidden: Error from intermediary` on FinalizeArtifact three times
 * across two jobs — after `19 passed`, and after a Lighthouse score of 100
 * against a >= 95 gate — and blocked a PR with auto-merge enabled. A re-run
 * reproduced it, so it was not a flake.
 *
 * A deliverable is the opposite: another job downloads it (`dist`,
 * `dist-static`) or the artifact IS the output the workflow exists to produce
 * (the extension zips, generated visual baselines, a POI match result).
 * Tolerating a failed upload there hides a real breakage — a downstream job
 * that finds nothing to download, or a "successful" run that shipped nothing.
 *
 * THE DELIVERABLE HALF IS THE LOAD-BEARING ONE. Making reports non-blocking is
 * easy to get right; quietly extending it to `dist` is the change that would
 * turn a broken build into a green tick, so this asserts BOTH directions.
 */

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');

/** Artifacts that are consumed downstream, or that ARE the workflow's output. */
const DELIVERABLES = [
  'dist',
  'dist-static',
  'extension-dist',
  'queer-guide-extension',
  'linux-visual-baselines',
  'poi-match-', // templated with the country input
];

interface Upload {
  file: string;
  name: string;
  nonBlocking: boolean;
}

/**
 * Text-scan rather than a YAML parse: this repo's guard tests all read their
 * source as text, and `yaml` is only a transitive dependency here — taking a
 * hard dep on it to lint four lines would be the more fragile choice.
 */
function uploadSteps(): Upload[] {
  const out: Upload[] = [];
  for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    const lines = readFileSync(join(WORKFLOWS, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/uses:\s*actions\/upload-artifact@/.test(line)) return;
      const indent = line.search(/\S/);
      // The step runs to the next line at or below this step's indentation
      // that opens a new list item.
      let end = i + 1;
      while (end < lines.length) {
        const l = lines[end];
        if (l.trim() && l.search(/\S/) <= indent && /^\s*-\s/.test(l)) break;
        if (l.trim() && l.search(/\S/) < indent) break;
        end++;
      }
      // Include the two lines above: `- if:` / `- uses:` may carry the dash.
      const block = lines.slice(Math.max(0, i - 2), end).join('\n');
      const nameMatch = /^\s*name:\s*(.+)$/m.exec(block);
      out.push({
        file,
        name: nameMatch ? nameMatch[1].trim() : '(unnamed)',
        nonBlocking: /^\s*continue-on-error:\s*true\s*$/m.test(block),
      });
    });
  }
  return out;
}

const isDeliverable = (name: string) => DELIVERABLES.some((d) => name.startsWith(d));

describe('upload-artifact blocking policy', () => {
  const uploads = uploadSteps();

  it('finds every upload step in the repo', () => {
    // A guard that silently matches nothing passes forever.
    expect(uploads.length).toBeGreaterThanOrEqual(10);
    expect(uploads.some((u) => u.file === 'a11y.yml')).toBe(true);
  });

  it('covers both sides of the rule, so neither branch is vacuous', () => {
    expect(uploads.filter((u) => isDeliverable(u.name)).length).toBeGreaterThan(0);
    expect(uploads.filter((u) => !isDeliverable(u.name)).length).toBeGreaterThan(0);
  });

  it('never blocks a job on storing a diagnostic report', () => {
    const blocking = uploads.filter((u) => !isDeliverable(u.name) && !u.nonBlocking);
    expect(
      blocking.map((u) => `${u.file}:${u.name}`),
      'report uploads must carry continue-on-error: true',
    ).toEqual([]);
  });

  it('never tolerates a failed upload of a deliverable', () => {
    // The direction that matters: `dist` going non-blocking would let a broken
    // build report success while every downstream a11y job finds nothing.
    const tolerated = uploads.filter((u) => isDeliverable(u.name) && u.nonBlocking);
    expect(
      tolerated.map((u) => `${u.file}:${u.name}`),
      'deliverable uploads must stay blocking',
    ).toEqual([]);
  });

  it('keeps the dist artifact the a11y jobs consume blocking', () => {
    const dist = uploads.find((u) => u.file === 'a11y.yml' && u.name === 'dist');
    expect(dist).toBeDefined();
    expect(dist!.nonBlocking).toBe(false);
  });
});
