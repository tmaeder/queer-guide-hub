/**
 * ChangeDetailDialog — Shows old vs new diff for a proposed content change.
 */

import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import type { ContentChange } from '@/hooks/useAutomation';

interface Props {
  change: ContentChange | null;
  open: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRevert: (id: string) => void;
}

function formatValue(value: unknown): string {
  if (value == null) return '(empty)';
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

export function ChangeDetailDialog({
  change,
  open,
  onClose,
  onApprove,
  onReject,
  onRevert,
}: Props) {
  if (!change) return null;

  const isApplied = change.status === 'applied' || change.status === 'auto_approved';
  const isPending = change.status === 'pending';
  const isFlag = change.change_type === 'flag';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogTitle>
          <span className="flex items-center gap-2">
            Change Detail
            <Badge variant="secondary" className="ml-2">{change.change_type}</Badge>
            <Badge
              variant={isPending ? 'secondary' : isApplied ? 'default' : 'outline'}
            >
              {change.status}
            </Badge>
          </span>
        </DialogTitle>

        <div className="border-t border-b py-4">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <span className="text-xs text-muted-foreground">Content</span>
              <p className="text-sm font-semibold">{change.content_name}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Type</span>
              <p className="text-sm">{change.content_type}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Field</span>
              <p className="text-sm font-semibold">{change.field_name}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Confidence</span>
              <p className="text-sm font-semibold">{Math.round(change.confidence * 100)}%</p>
            </div>
          </div>

          {change.reasoning && (
            <div className="mb-6">
              <span className="text-xs text-muted-foreground">Reasoning</span>
              <p className="text-sm mt-1 p-3 bg-muted rounded-badge">{change.reasoning}</p>
            </div>
          )}

          {!isFlag && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground mb-1 block">Old Value</span>
                <div className="p-3 rounded-badge font-mono text-xs whitespace-pre-wrap break-words max-h-[300px] overflow-auto" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                  {formatValue(change.old_value)}
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground mb-1 block">New Value</span>
                <div className="p-3 rounded-badge font-mono text-xs whitespace-pre-wrap break-words max-h-[300px] overflow-auto" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  {formatValue(change.new_value)}
                </div>
              </div>
            </div>
          )}

          {isFlag && (
            <div className="p-4 rounded-badge" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
              <p className="text-sm">
                This is a <strong>flag-only</strong> change. No data modification proposed — review
                the issue described above.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {isPending && (
            <>
              <Button variant="outline" onClick={() => onReject(change.id)}>
                <XCircle size={14} className="mr-1" />
                Reject
              </Button>
              {!isFlag && (
                <Button onClick={() => onApprove(change.id)}>
                  <CheckCircle2 size={14} className="mr-1" />
                  Approve & Apply
                </Button>
              )}
              {isFlag && (
                <Button variant="outline" onClick={() => onReject(change.id)}>
                  Dismiss Flag
                </Button>
              )}
            </>
          )}
          {isApplied && (
            <Button variant="outline" onClick={() => onRevert(change.id)}>
              <RotateCcw size={14} className="mr-1" />
              Revert
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
