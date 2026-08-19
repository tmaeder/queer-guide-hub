import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { UNGROUPED } from './boardGrouping';
import { getStatusColor, getStatusLabel, getStatusTint, type ListItem } from './types';

/**
 * Board view for any content type.
 *
 * Groups by a column rather than requiring per-type config: the caller picks
 * one of the type's `select`/`boolean` fields, and `groupableFields` supplies
 * the candidates. Types with no groupable column fall back to `status`, which
 * every ListItem carries.
 *
 * Records with no value land in one "Ungrouped" column placed last, so an
 * incomplete-data bucket never pushes real columns off-screen.
 */

interface ContentListBoardProps {
  items: ListItem[];
  loading: boolean;
  config: ContentTypeConfig | null;
  /** Field name to group by. Falls back to workflow status when absent. */
  groupBy: string | null;
  /**
   * Server-computed groups with TRUE totals. When present these win: deriving
   * columns from `items` only ever describes the loaded page, which is
   * meaningless on a large type. Absent (no groupBy, or status grouping) the
   * page-derived fallback below still applies.
   */
  serverGroups?: { key: string; label: string; count: number; items: ListItem[] }[] | null;
  onEdit: (contentType: string, id: string) => void;
}

interface Column {
  key: string;
  label: string;
  items: ListItem[];
  /** True total when known; otherwise the loaded-page count is used. */
  total?: number;
}

function labelFor(field: FieldConfig | undefined, value: unknown): string {
  if (field?.type === 'boolean') return value ? 'Yes' : 'No';
  const opt = field?.options?.find((o) => o.value === value);
  return opt?.label ?? String(value);
}

export function ContentListBoard({
  items,
  loading,
  config,
  groupBy,
  serverGroups,
  onEdit,
}: ContentListBoardProps) {
  const field = config?.fields.find((f) => f.name === groupBy);

  const columns = useMemo<Column[]>(() => {
    if (serverGroups) {
      return serverGroups.map((g) => ({
        key: g.key,
        label: g.label,
        items: g.items,
        total: g.count,
      }));
    }
    const map = new Map<string, Column>();
    const ungrouped: ListItem[] = [];

    for (const item of items) {
      const raw = item.raw as Record<string, unknown> | undefined;
      const value = groupBy ? raw?.[groupBy] : item.status;

      if (value === null || value === undefined || value === '') {
        ungrouped.push(item);
        continue;
      }
      const key = String(value);
      const existing = map.get(key);
      if (existing) existing.items.push(item);
      else {
        map.set(key, {
          key,
          label: groupBy ? labelFor(field, value) : getStatusLabel(String(value)),
          items: [item],
        });
      }
    }

    // First-appearance order, not alphabetical, so columns do not jump between
    // renders. Ungrouped always last.
    const out = [...map.values()];
    if (ungrouped.length) out.push({ key: UNGROUPED, label: 'Ungrouped', items: ungrouped });
    return out;
  }, [items, groupBy, field, serverGroups]);

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[320px] w-[280px] flex-shrink-0 rounded-container" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <div key={col.key} className="flex-shrink-0 w-[280px] rounded-container bg-muted p-2">
          <div className="flex items-center justify-between px-2 py-1 mb-2">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">
              {col.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {(col.total ?? col.items.length).toLocaleString()}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {col.items.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-1">None.</p>
            )}
            {col.items.map((item) => {
              const statusColor = getStatusColor(item.status);
              return (
                <button
                  key={`${item.contentType}:${item.id}`}
                  type="button"
                  onClick={() => onEdit(item.contentType, item.id)}
                  className="text-left border border-border rounded-element p-2 transition-colors hover:bg-muted/50"
                >
                  <p className="text-sm font-medium leading-tight line-clamp-2">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  {item.status && groupBy && (
                    <Badge
                      className="mt-2 h-5 text-xs2 font-semibold"
                      style={{ backgroundColor: getStatusTint(item.status), color: statusColor }}
                    >
                      {getStatusLabel(item.status)}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
