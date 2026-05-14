import { useRef, useEffect } from 'react';
import { TriageItemRow } from './TriageItemRow';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No items to review.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} data-item-id={item.id}>
            <TriageItemRow
              item={item}
              isActive={activeId === item.id}
              isSelected={selectedIds.has(item.id)}
              onSelect={() => onSelect(item.id)}
              onToggleCheck={() => onToggleCheck(item.id)}
            />
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t text-xs text-muted-foreground">
          <span>
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span>
              {page}/{totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
