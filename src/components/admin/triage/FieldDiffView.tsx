/* eslint-disable react-refresh/only-export-components -- intentionally co-locates helpers/constants with the primary component */

import { cn } from '@/lib/utils';

interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface FieldDiffViewProps {
  diffs: FieldDiff[];
}

/**
 * Bookkeeping columns that differ on EVERY row and therefore tell a reviewer nothing.
 *
 * `computeFieldDiffs` had no such set while `EntityPreviewCard.HIDDEN_KEYS` and
 * `TriageDetailPanel.META_HIDDEN_KEYS` both existed a few lines away — so
 * `updated_at` and `id` always differed and LED the `Changes` section, burying the
 * fields a decision actually turns on under machine noise.
 *
 * Exported so a caller can extend rather than replace it; both call sites
 * (`TriageDetailPanel`, `StagingPreview`) want exactly this default.
 */
export const DIFF_HIDDEN_KEYS: ReadonlySet<string> = new Set([
  'id',
  'created_at',
  'updated_at',
  'embedding',
  'search_vector',
  'tsv',
]);

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

/** Human-readable column name — `accessibility_attributes` reads as machine output. */
function formatFieldName(field: string): string {
  return field.replace(/_/g, ' ');
}

export function FieldDiffView({ diffs }: FieldDiffViewProps) {
  if (diffs.length === 0) {
    return <p className="text-xs text-muted-foreground px-4 py-2">No changes detected.</p>;
  }

  return (
    <div className="divide-y">
      {diffs.map((d) => (
        <div key={d.field} className="px-4 py-2 bg-muted/30">
          <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {formatFieldName(d.field)}
          </p>
          {/* <pre>, not <p>. `formatValue` pretty-prints an object with
              `JSON.stringify(v, null, 2)`, and HTML collapses those newlines inside a
              <p> — so a nested object rendered as one run-on line of
              `{ "a": 1, "b": [ ... ] }`. `whitespace-pre-wrap` keeps the indentation
              and still wraps rather than forcing a horizontal scroll. */}
          {d.oldValue !== undefined && d.oldValue !== null && (
            <pre className="text-xs text-muted-foreground line-through mb-0.5 whitespace-pre-wrap break-words font-sans">
              {formatValue(d.oldValue)}
            </pre>
          )}
          <pre
            className={cn(
              'text-xs font-semibold border-l border-border-hairline pl-2',
              'whitespace-pre-wrap break-words font-sans',
            )}
          >
            {formatValue(d.newValue)}
          </pre>
        </div>
      ))}
    </div>
  );
}

export function computeFieldDiffs(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  hiddenKeys: ReadonlySet<string> = DIFF_HIDDEN_KEYS,
): FieldDiff[] {
  if (!newData) return [];
  if (!oldData) {
    return Object.entries(newData)
      .filter(([field]) => !hiddenKeys.has(field))
      .map(([field, newValue]) => ({
        field,
        oldValue: undefined,
        newValue,
      }));
  }

  const diffs: FieldDiff[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of allKeys) {
    if (hiddenKeys.has(key)) continue;
    const ov = oldData[key];
    const nv = newData[key];
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      diffs.push({ field: key, oldValue: ov, newValue: nv });
    }
  }
  return diffs;
}
