import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { dateOf, monthKey, monthLabel } from './dateFields';
import { getStatusColor, getStatusLabel, relativeTime, type ListItem } from './types';

/**
 * Timeline view for any content type.
 *
 * A chronological rail grouped by month rather than a gantt: admin records are
 * points in time (published, starts, updated), not spans, and a gantt would
 * invent durations the data does not have.
 *
 * Records whose chosen date is missing or unparseable collect in an "Undated"
 * group at the end. They are shown, not dropped — a missing date is usually the
 * reason someone opened this view.
 */

interface ContentListTimelineProps {
  items: ListItem[];
  loading: boolean;
  /** Field name to plot against. Null means the record's updated_at. */
  dateField: string | null;
  onEdit: (contentType: string, id: string) => void;
}

interface Group {
  key: string;
  label: string;
  items: { item: ListItem; date: Date | null }[];
}

export function ContentListTimeline({
  items,
  loading,
  dateField,
  onEdit,
}: ContentListTimelineProps) {
  const groups = useMemo<Group[]>(() => {
    const dated = items
      .map((item) => ({ item, date: dateOf(item, dateField) }))
      .filter((r) => r.date !== null)
      .sort((a, b) => (b.date as Date).getTime() - (a.date as Date).getTime());

    const undated = items
      .map((item) => ({ item, date: dateOf(item, dateField) }))
      .filter((r) => r.date === null);

    const map = new Map<string, Group>();
    for (const row of dated) {
      const key = monthKey(row.date as Date);
      const existing = map.get(key);
      if (existing) existing.items.push(row);
      else map.set(key, { key, label: monthLabel(row.date as Date), items: [row] });
    }

    const out = [...map.values()];
    if (undated.length) out.push({ key: '__undated__', label: 'Undated', items: undated });
    return out;
  }, [items, dateField]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-element" />
        ))}
      </div>
    );
  }

  if (!groups.length) {
    return <p className="text-sm text-muted-foreground py-8">No records yet.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.key}>
          <h6 className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
            {group.label}
            <span className="ml-2 normal-case tracking-normal">{group.items.length}</span>
          </h6>

          {/* The rail is a left border on the list, so no decorative elements
              are needed to draw it. */}
          <ul className="border-l border-border pl-4 flex flex-col gap-2">
            {group.items.map(({ item, date }) => {
              const statusColor = getStatusColor(item.status);
              return (
                <li key={`${item.contentType}:${item.id}`}>
                  <button
                    type="button"
                    onClick={() => onEdit(item.contentType, item.id)}
                    className="w-full text-left border border-border rounded-element p-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm font-medium leading-tight line-clamp-1">{item.title}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {date ? date.toLocaleDateString() : '—'}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {item.status && (
                        <Badge
                          className="h-5 text-xs2 font-semibold"
                          style={{ backgroundColor: `${statusColor}1A`, color: statusColor }}
                        >
                          {getStatusLabel(item.status)}
                        </Badge>
                      )}
                      {item.updatedAt && (
                        <span className="text-xs2 text-muted-foreground">
                          {relativeTime(item.updatedAt)}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
