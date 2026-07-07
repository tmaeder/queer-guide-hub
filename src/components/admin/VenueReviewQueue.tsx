import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useVenueReviewQueue } from '@/hooks/useVenueReviewQueue';

const FIELD_LABEL: Record<string, string> = {
  accessibility_attributes: 'Accessibility features',
  accessibility_notes: 'Accessibility notes',
  amenities: 'Amenities',
};

function renderValue(value: unknown) {
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <Badge key={i} variant="outline" className="font-normal">{String(v)}</Badge>
        ))}
      </div>
    );
  }
  return <span className="text-body">{String(value ?? '')}</span>;
}

/**
 * The Amenity Truth Engine safety gate. LLM-proposed accessibility features /
 * notes are never written to a venue until an admin approves here — a wrong
 * accessibility claim is a real-world harm.
 */
export function VenueReviewQueue() {
  const { data: rows, isLoading, decide, batchApproveSafe } = useVenueReviewQueue();
  const [busy, setBusy] = useState<string | null>(null);

  const safeCount = (rows ?? []).filter(
    (r) => (r.confidence ?? 0) >= 0.8 && (r.citations ?? []).length > 0,
  ).length;

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await decide.mutateAsync({ id, action });
      toast.success(action === 'approve' ? 'Approved — applied to venue' : 'Rejected');
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const approveSafe = async () => {
    setBusy('batch');
    try {
      const n = await batchApproveSafe.mutateAsync(0.8);
      toast.success(`Approved ${n} safe ${n === 1 ? 'claim' : 'claims'}`);
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
            Review queue — accessibility claims
          </CardTitle>
          <Button size="sm" variant="outline" disabled={busy !== null || safeCount === 0} onClick={approveSafe}>
            <Check size={14} className="mr-1" /> Approve safe ({safeCount})
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-13 text-muted-foreground">
          LLM-proposed accessibility features and notes. These are never applied to a venue until approved here.
        </p>
        {isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
        {!isLoading && (!rows || rows.length === 0) && (
          <p className="text-13 text-muted-foreground">No items awaiting review.</p>
        )}
        {rows?.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-element border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.venues?.name ?? 'Unknown venue'}</span>
                <Badge variant="outline" className="font-normal">{FIELD_LABEL[r.field] ?? r.field}</Badge>
                {r.confidence != null && (
                  <span className="text-13 text-muted-foreground tabular-nums">conf {Math.round(r.confidence * 100)}%</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => act(r.id, 'reject')}>
                  <X size={14} className="mr-1" /> Reject
                </Button>
                <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, 'approve')}>
                  <Check size={14} className="mr-1" /> Approve
                </Button>
              </div>
            </div>

            <div>{renderValue(r.proposed_value?.value)}</div>

            {(r.citations ?? []).length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-element bg-muted/40 p-2">
                <span className="text-13 font-medium">Citations</span>
                {(r.citations ?? []).map((c, i) => (
                  <div key={i} className="text-13 text-muted-foreground">
                    {c.quote && <span>“{c.quote}”</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
