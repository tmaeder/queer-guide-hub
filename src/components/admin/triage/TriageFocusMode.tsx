/**
 * TriageFocusMode — full-screen, one-item-at-a-time review for fast queue
 * burns. Wraps TriageDetailPanel (image gallery, score chips, dedup compare,
 * actions) in a dialog with a progress header and prev/next controls. The
 * parent TriageView owns the active item + action handling, so keyboard
 * shortcuts (j/k/a/r/s/f/u) keep working while the dialog is open.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TriageDetailPanel } from './TriageDetailPanel';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';
import type { TriageAction, TriageAnswers } from './resolveDecision';

interface TriageFocusModeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: TriageItem[];
  activeItem: TriageItem | null;
  total: number;
  page: number;
  perPage: number;
  onNavigate: (id: string) => void;
  /**
   * Forwarded verbatim to `TriageDetailPanel`.
   *
   * This used to declare `(action, notes?, cannedSlug?)` while the real handler took
   * five arguments — `payload` and `confirm` were silently dropped. Every parameter
   * was optional, so it typechecked in BOTH directions and worked only because the
   * real handler was passed straight through; the first person to wrap or memoise
   * the prop would have deleted the outing-safety confirmation with no type error.
   * The action carries one argument now, so there is nothing left to drop.
   */
  onAction: (action: TriageAction) => void;
  answers: TriageAnswers;
  onAnswersChange: (patch: Partial<TriageAnswers>) => void;
  isActionLoading: boolean;
}

export function TriageFocusMode({
  open,
  onOpenChange,
  items,
  activeItem,
  total,
  page,
  perPage,
  onNavigate,
  onAction,
  answers,
  onAnswersChange,
  isActionLoading,
}: TriageFocusModeProps) {
  const idx = activeItem ? items.findIndex((i) => i.id === activeItem.id) : -1;
  const position = idx >= 0 ? (page - 1) * perPage + idx + 1 : 0;

  const goPrev = () => idx > 0 && onNavigate(items[idx - 1].id);
  const goNext = () => idx >= 0 && idx < items.length - 1 && onNavigate(items[idx + 1].id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Focus review</DialogTitle>
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <span className="text-xs text-muted-foreground tabular-nums">
            {position > 0 ? `${position} of ${total}` : 'Queue empty'}
          </span>
          <div className="flex items-center gap-1 mr-8">
            <Button size="sm" variant="ghost" onClick={goPrev} disabled={idx <= 0} aria-label="Previous item">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={goNext}
              disabled={idx < 0 || idx >= items.length - 1}
              aria-label="Next item"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {activeItem ? (
            <TriageDetailPanel
              item={activeItem}
              answers={answers}
              onAnswersChange={onAnswersChange}
              onAction={onAction}
              isActionLoading={isActionLoading}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No items left in this queue.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
