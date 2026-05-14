import { cn } from '@/lib/utils';

interface FieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface FieldDiffViewProps {
  diffs: FieldDiff[];
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

export function FieldDiffView({ diffs }: FieldDiffViewProps) {
  if (diffs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-3 py-2">No changes detected.</p>
    );
  }

  return (
    <div className="divide-y">
      {diffs.map((d) => (
        <div key={d.field} className="px-3 py-2 bg-muted/30">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            {d.field}
          </p>
          {d.oldValue !== undefined && d.oldValue !== null && (
            <p className="text-xs text-muted-foreground line-through mb-0.5">
              {formatValue(d.oldValue)}
            </p>
          )}
          <p
            className={cn(
              'text-xs font-semibold border-l-2 border-foreground pl-2',
            )}
          >
            {formatValue(d.newValue)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function computeFieldDiffs(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): FieldDiff[] {
  if (!newData) return [];
  if (!oldData) {
    return Object.entries(newData).map(([field, newValue]) => ({
      field,
      oldValue: undefined,
      newValue,
    }));
  }

  const diffs: FieldDiff[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of allKeys) {
    const ov = oldData[key];
    const nv = newData[key];
    if (JSON.stringify(ov) !== JSON.stringify(nv)) {
      diffs.push({ field: key, oldValue: ov, newValue: nv });
    }
  }
  return diffs;
}
