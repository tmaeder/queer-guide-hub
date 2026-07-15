import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, ArrowRight, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { useTwentyInboundReview, type TwentyInboundRow } from '@/hooks/useTwentyInboundReview';

const ENTITY_LABEL: Record<TwentyInboundRow['entity_type'], string> = {
  organization: 'Organization',
  merchant: 'Merchant',
  contact: 'Contact',
};

function ChangeRow({ field, from, to }: { field: string; from: unknown; to: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-element border p-4">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">{field}</span>
      <div className="flex items-start gap-2 text-15">
        <span className="text-muted-foreground line-through">{String(from ?? '—')}</span>
        <ArrowRight size={14} className="mt-1 shrink-0 text-muted-foreground" />
        <span className="font-medium">{to ?? '—'}</span>
      </div>
    </div>
  );
}

export default function AdminTwentyCrm() {
  const { data: rows, isLoading, decide } = useTwentyInboundReview();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await decide.mutateAsync({ id, action });
      toast.success(action === 'approve' ? 'Applied to the live record' : 'Discarded');
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-headline">Twenty CRM sync</h1>
        <p className="text-13 text-muted-foreground">
          Edits made in Twenty land here as proposals. Approving applies only the shown fields to
          the live record; nothing reaches public content until you approve.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-title">
            <Inbox size={16} /> Pending from Twenty
            {rows && rows.length > 0 && <Badge variant="secondary">{rows.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
          {!isLoading && (!rows || rows.length === 0) && (
            <p className="text-13 text-muted-foreground">No edits awaiting review.</p>
          )}
          {rows?.map((r) => (
            <div key={r.id} className="flex flex-col gap-4 rounded-element border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{ENTITY_LABEL[r.entity_type]}</Badge>
                  <span className="font-mono text-13 text-muted-foreground">{r.external_id}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy === r.id}
                    onClick={() => act(r.id, 'reject')}>
                    <X size={14} className="mr-1" /> Reject
                  </Button>
                  <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, 'approve')}>
                    <Check size={14} className="mr-1" /> Approve
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {Object.entries(r.changes).map(([field, d]) => (
                  <ChangeRow key={field} field={field} from={d.from} to={d.to} />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
