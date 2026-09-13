/**
 * Minimal line diff, for comparing two compiled styleguide prompts.
 *
 * Hand-rolled rather than adding a dependency: this is the only diff in the
 * product, it runs on two ~30 KB strings behind an admin click, and the repo
 * already carries hand-tuned manual chunks precisely because bundle weight is
 * watched.
 *
 * Standard LCS over LINES. A naive "lines in A but not in B" set difference was
 * the obvious cheaper option and is wrong in the way that matters here: a rule
 * moved between sections would show as both a deletion and an addition, so a
 * reordering would read as a rewrite — on a screen whose entire job is telling
 * an editor whether a rule was REVERSED before they publish a major version.
 */

export type DiffOp = 'add' | 'remove' | 'context';

export interface DiffLine {
  op: DiffOp;
  text: string;
}

/**
 * Longest-common-subsequence table over lines.
 *
 * O(n·m) in time and memory. Bounded by `maxLines`: two 30 KB prompts are
 * ~400 lines each, so the table is ~160k cells, which is fine. Past the bound
 * we refuse rather than locking the tab up — an honest "too large to diff"
 * beats a frozen browser.
 */
export function lineDiff(before: string, after: string, maxLines = 2_000): DiffLine[] | null {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length > maxLines || b.length > maxLines) return null;

  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: 'context', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: 'remove', text: a[i] });
      i++;
    } else {
      out.push({ op: 'add', text: b[j] });
      j++;
    }
  }
  while (i < a.length) out.push({ op: 'remove', text: a[i++] });
  while (j < b.length) out.push({ op: 'add', text: b[j++] });
  return out;
}

/**
 * Drop long runs of unchanged lines, keeping `pad` of context either side.
 * A 400-line prompt with a two-line change is unreadable otherwise.
 */
export function collapseContext(lines: DiffLine[], pad = 2): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.op === 'context') return;
    for (let k = Math.max(0, idx - pad); k <= Math.min(lines.length - 1, idx + pad); k++) {
      keep[k] = true;
    }
  });

  const out: DiffLine[] = [];
  let skipping = false;
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      out.push(l);
      skipping = false;
    } else if (!skipping) {
      out.push({ op: 'context', text: '…' });
      skipping = true;
    }
  });
  return out;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.op === 'add').length,
    removed: lines.filter((l) => l.op === 'remove').length,
  };
}
