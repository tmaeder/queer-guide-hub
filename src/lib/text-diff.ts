/**
 * Word-level diff for the news quality before/after view.
 * Pure LCS-based — no external dependency. Outputs a sequence of segments
 * tagged 'eq' | 'add' | 'del' that callers can render with chip styling.
 */

export type DiffSegmentKind = 'eq' | 'add' | 'del';

export interface DiffSegment {
  kind: DiffSegmentKind;
  text: string;
}

/** Tokenise into runs of word-chars OR runs of non-word-chars (whitespace, punctuation). */
function tokenise(s: string): string[] {
  if (!s) return [];
  // Match either word-ish runs or any single non-word run.
  return s.match(/[\p{L}\p{N}_'']+|[^\p{L}\p{N}_]+/gu) ?? [];
}

/** Build the LCS table (Hirschberg/space-optimised would be nicer, but article bodies fit). */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

/** Diff two strings by word, collapse adjacent same-kind segments. */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = tokenise(before);
  const b = tokenise(after);
  const dp = lcsTable(a, b);

  const out: DiffSegment[] = [];
  const push = (kind: DiffSegmentKind, text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('eq', a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('del', a[i]);
      i++;
    } else {
      push('add', b[j]);
      j++;
    }
  }
  while (i < a.length) push('del', a[i++]);
  while (j < b.length) push('add', b[j++]);
  return out;
}

/** Convenience metric: how much of `after` is new vs `before`. 0..1 */
export function diffChangeRatio(before: string, after: string): number {
  const segs = diffWords(before, after);
  let kept = 0;
  let total = 0;
  for (const s of segs) {
    total += s.text.length;
    if (s.kind === 'eq') kept += s.text.length;
  }
  return total === 0 ? 0 : 1 - kept / total;
}
