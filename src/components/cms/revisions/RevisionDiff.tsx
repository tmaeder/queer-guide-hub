/**
 * RevisionDiff
 * Field-level diff display between two revisions.
 * Shows old (red) and new (green) values for each changed field.
 */

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { X } from 'lucide-react';

interface RevisionDiffProps {
  changes: Record<string, { old: unknown; new: unknown }>;
  onClose: () => void;
}

/** Format a value for display. JSON objects are pretty-printed. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

interface DiffSegment {
  text: string;
  type: 'same' | 'removed' | 'added';
}

function computeInlineDiff(oldStr: string, newStr: string): DiffSegment[] {
  const oldWords = oldStr.split(/(\s+)/);
  const newWords = newStr.split(/(\s+)/);

  const m = oldWords.length;
  const n = newWords.length;

  if (m > 500 || n > 500) {
    const segments: DiffSegment[] = [];
    if (oldStr) segments.push({ text: oldStr, type: 'removed' });
    if (newStr) segments.push({ text: newStr, type: 'added' });
    return segments;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const segments: DiffSegment[] = [];
  let i = m;
  let j = n;
  const stack: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      stack.push({ text: oldWords[i - 1], type: 'same' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ text: newWords[j - 1], type: 'added' });
      j--;
    } else {
      stack.push({ text: oldWords[i - 1], type: 'removed' });
      i--;
    }
  }

  stack.reverse();
  for (const seg of stack) {
    if (segments.length > 0 && segments[segments.length - 1].type === seg.type) {
      segments[segments.length - 1].text += seg.text;
    } else {
      segments.push({ ...seg });
    }
  }

  return segments;
}

function InlineDiff({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const segments = computeInlineDiff(oldStr, newStr);

  return (
    <div
      className="text-sm"
      style={{ fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
    >
      {segments.map((seg, idx) => {
        if (seg.type === 'removed') {
          return (
            <span
              key={idx}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#dc2626',
                textDecoration: 'line-through',
                borderRadius: '2px',
                padding: '0 2px',
              }}
            >
              {seg.text}
            </span>
          );
        }
        if (seg.type === 'added') {
          return (
            <span
              key={idx}
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#16a34a',
                borderRadius: '2px',
                padding: '0 2px',
              }}
            >
              {seg.text}
            </span>
          );
        }
        return <span key={idx}>{seg.text}</span>;
      })}
    </div>
  );
}

export function RevisionDiff({ changes, onClose }: RevisionDiffProps) {
  const fieldNames = Object.keys(changes);

  if (fieldNames.length === 0) {
    return (
      <div className="rounded-element border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-base font-semibold">Changes</span>
          <Button variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">No changes detected.</p>
      </div>
    );
  }

  return (
    <div className="rounded-element border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-base font-semibold">
          Changes ({fieldNames.length} field{fieldNames.length !== 1 ? 's' : ''})
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
                <X size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close diff</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex flex-col gap-4 divide-y divide-border">
        {fieldNames.map((field) => {
          const { old: oldVal, new: newVal } = changes[field];
          const oldStr = formatValue(oldVal);
          const newStr = formatValue(newVal);
          const isStringDiff =
            typeof oldVal === 'string' && typeof newVal === 'string';

          return (
            <div key={field} className="pt-4 first:pt-0">
              <span className="block mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {field.replace(/_/g, ' ')}
              </span>

              {isStringDiff ? (
                <InlineDiff oldStr={oldStr} newStr={newStr} />
              ) : (
                <div className="flex flex-col gap-2">
                  <div
                    className="rounded p-3"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                    }}
                  >
                    <span className="block mb-1 text-xs font-semibold text-destructive">
                      Removed
                    </span>
                    <div
                      className="text-sm"
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {oldStr}
                    </div>
                  </div>

                  <div
                    className="rounded p-3"
                    style={{
                      backgroundColor: 'rgba(34, 197, 94, 0.08)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                    }}
                  >
                    <span className="block mb-1 text-xs font-semibold" style={{ color: '#16a34a' }}>
                      Added
                    </span>
                    <div
                      className="text-sm"
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {newStr}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
