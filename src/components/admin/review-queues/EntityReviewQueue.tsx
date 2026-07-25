import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, ExternalLink, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

/** Minimal shape every *_review_queue row shares. */
export interface ReviewQueueRowBase {
  id: string;
  citations?: { url?: string; quote?: string }[] | null;
  confidence?: number | null;
}

export interface EntityReviewQueueConfig<Row extends ReviewQueueRowBase> {
  /** Card title after the shield icon, e.g. "Review queue — accessibility claims". */
  title: string;
  /** Intro paragraph explaining what lands here and why it is gated. */
  description: string;
  rows: Row[] | undefined;
  isLoading: boolean;
  /** Entity display name (joined relation differs per queue). */
  entityName: (row: Row) => string;
  /** Field badge label; return null to omit the badge. */
  fieldLabel?: (row: Row) => string | null;
  /** Extra badges next to the name (risk tier, model, …). */
  headerExtras?: (row: Row) => ReactNode;
  /** Proposed-value display. */
  renderBody: (row: Row) => ReactNode;
  rationale?: (row: Row) => string | null | undefined;
  approveLabel?: string;
  rejectLabel?: string;
  /**
   * Safety gate: return a confirm message to require explicit confirmation
   * before approving this row (e.g. criminalizing destinations), null to
   * approve directly. The boolean passed to onDecide records whether the
   * admin confirmed.
   */
  approveGuard?: (row: Row) => string | null;
  onDecide: (row: Row, action: 'approve' | 'reject', confirmed: boolean) => Promise<void>;
  decideSuccess?: (action: 'approve' | 'reject') => string;
  /** Optional one-click bulk approve of provably-safe rows. */
  batch?: {
    count: number;
    label: (n: number) => string;
    run: () => Promise<number>;
    successMessage: (n: number) => string;
  };
}

/**
 * Shared shell for the Truth Engine review gates (city / venue / village /
 * personality / marketplace). Each queue keeps its own table, RPCs, and RLS —
 * this only unifies the list UI, busy/toast handling, citations block, and
 * makes each queue's safety gate an explicit named config field instead of
 * five divergent inline copies.
 */
export function EntityReviewQueue<Row extends ReviewQueueRowBase>({
  title,
  description,
  rows,
  isLoading,
  entityName,
  fieldLabel,
  headerExtras,
  renderBody,
  rationale,
  approveLabel = 'Approve',
  rejectLabel = 'Reject',
  approveGuard,
  onDecide,
  decideSuccess,
  batch,
}: EntityReviewQueueConfig<Row>) {
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (row: Row, action: 'approve' | 'reject') => {
    let confirmed = false;
    if (action === 'approve' && approveGuard) {
      const message = approveGuard(row);
      if (message) {
        if (!window.confirm(message)) return;
        confirmed = true;
      }
    }
    setBusy(row.id);
    try {
      await onDecide(row, action, confirmed);
      toast.success(
        decideSuccess?.(action) ?? (action === 'approve' ? 'Approved — value published' : 'Rejected'),
      );
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const runBatch = async () => {
    if (!batch) return;
    setBusy('batch');
    try {
      const n = await batch.run();
      toast.success(batch.successMessage(n));
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-title">
            <ShieldAlert size={16} />
            {title}
          </CardTitle>
          {batch && batch.count > 0 && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={runBatch}>
              <Check size={14} className="mr-1" /> {batch.label(batch.count)}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-13 text-muted-foreground">{description}</p>
        {isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
        {!isLoading && (!rows || rows.length === 0) && (
          <p className="text-13 text-muted-foreground">No items awaiting review.</p>
        )}
        {rows?.map((r) => {
          const field = fieldLabel?.(r);
          const note = rationale?.(r);
          return (
            <div key={r.id} className="flex flex-col gap-2 rounded-element border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{entityName(r)}</span>
                  {field && (
                    <Badge variant="outline" className="font-normal">
                      {field}
                    </Badge>
                  )}
                  {headerExtras?.(r)}
                  {r.confidence != null && (
                    <span className="text-13 text-muted-foreground tabular-nums">
                      conf {Math.round(r.confidence * 100)}%
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === r.id}
                    onClick={() => act(r, 'reject')}
                  >
                    <X size={14} className="mr-1" /> {rejectLabel}
                  </Button>
                  <Button size="sm" disabled={busy === r.id} onClick={() => act(r, 'approve')}>
                    <Check size={14} className="mr-1" /> {approveLabel}
                  </Button>
                </div>
              </div>

              <div>{renderBody(r)}</div>
              {note && <p className="text-13 text-muted-foreground">{note}</p>}

              {(r.citations ?? []).length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-element bg-muted/40 p-2">
                  <span className="text-13 font-medium">Citations</span>
                  {(r.citations ?? []).map((c, i) => (
                    <div key={i} className="text-13 text-muted-foreground">
                      {c.quote && <span>“{c.quote}” </span>}
                      {c.url && (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1"
                        >
                          source <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
