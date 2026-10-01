import { useRef, useEffect } from 'react';
import { TriageItemRow } from './TriageItemRow';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

interface TriageListProps {
  items: TriageItem[];
  activeId: string | null;
  selectedIds: Set<string>;
  total: number;
  page: number;
  perPage: number;
  onSelect: (id: string) => void;
  onToggleCheck: (id: string) => void;
  onPageChange: (page: number) => void;
  slaHoursByQueue?: Record<string, number>;
}

export function TriageList({
  items,
  activeId,
  selectedIds,
  total,
  page,
  perPage,
  onSelect,
  onToggleCheck,
  onPageChange,
  slaHoursByQueue = {},
}: TriageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  useEffect(() => {
    if (!activeId || !containerRef.current) return;
    const el = containerRef.current.querySelector(`[data-item-id="${activeId}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-container bg-muted text-foreground">
          <CheckCircle2 className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-13 font-semibold text-foreground">No items to review</p>
          <p className="mt-1 max-w-64 text-xs leading-relaxed text-muted-foreground">
            This scope is clear. Choose another queue or remove filters to keep reviewing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border-hairline bg-muted/30 px-4 py-2">
        <span className="text-2xs font-medium uppercase tracking-label text-muted-foreground">
          Work queue
        </span>
        <span className="text-2xs tabular-nums text-muted-foreground">
          {total.toLocaleString()} {total === 1 ? 'item' : 'items'}
        </span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto overscroll-contain">
        {items.map((item) => (
          <div key={item.id} data-item-id={item.id}>
            <TriageItemRow
              item={item}
              isActive={activeId === item.id}
              isSelected={selectedIds.has(item.id)}
              onSelect={() => onSelect(item.id)}
              onToggleCheck={() => onToggleCheck(item.id)}
              slaHours={slaHoursByQueue[item.queue_type]}
            />
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Review queue pages"
          className="flex items-center justify-between border-t border-border-hairline bg-background px-4 py-2 text-xs text-muted-foreground"
        >
          <span className="tabular-nums">
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 min-h-8 w-8 p-0"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-12 text-center tabular-nums">
              {page}/{totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 min-h-8 w-8 p-0"
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
