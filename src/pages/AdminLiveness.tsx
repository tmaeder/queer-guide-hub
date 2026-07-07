import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, RotateCcw, Flag, Archive, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useExistenceEngine, type ExistenceAuditRow } from '@/hooks/useExistenceEngine';

const TYPES = ['venue', 'event', 'marketplace'] as const;

/**
 * Liveness & Closure — the Existence Truth Engine admin surface. Shows per-type
 * health counts, the single-signal review queue (cited evidence), recent auto-archives
 * with one-click reopen, and the un-probeable blind-spot list. The conservative
 * >=2-signal auto-archive happens in run_existence_decision; this is the human gate.
 */
export default function AdminLiveness() {
  const { overview, reviewQueue, recentArchives, blindSpots, approve, reject, reopen } = useExistenceEngine();
  const [busy, setBusy] = useState<string | null>(null);

  const wrap = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); }
    catch (e) { toast.error(`Error: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };

  const sig = (r: ExistenceAuditRow) => {
    const s = r.signals ?? {};
    const parts: string[] = [];
    if (s.strong_dead != null) parts.push(`${s.strong_dead} strong dead`);
    if (s.guarded) parts.push('guarded');
    return parts.join(' · ');
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-headline">Liveness & closure</h1>
        <p className="text-13 text-muted-foreground">
          Auto-detection of venues, events and products that no longer exist. Archiving needs ≥2 independent dead
          signals and is always reversible. Single-signal cases wait for review here.
        </p>
      </div>

      {/* overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {TYPES.map((t) => {
          const o = overview.data?.[t];
          return (
            <Card key={t}>
              <CardHeader className="pb-2"><CardTitle className="text-title capitalize">{t}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-1 text-13">
                <Row label="Flagged for review" value={o?.flagged} />
                <Row label="Auto-archived (7d)" value={o?.auto_archived_7d} />
                <Row label="Currently archived" value={o?.open_archives} />
                <Row label="Dead signals (120d)" value={o?.dead_signal_entities} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* review queue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-title"><Flag size={16} /> Review queue</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-13 text-muted-foreground">
            Single dead signal, or a strong-dead match on a featured / saved entity. Approve to archive (reversible),
            or dismiss as still-alive.
          </p>
          {reviewQueue.isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
          {!reviewQueue.isLoading && (reviewQueue.data ?? []).length === 0 && (
            <p className="text-13 text-muted-foreground">Nothing awaiting review.</p>
          )}
          {(reviewQueue.data ?? []).map((r) => (
            <div key={r.audit_id} className="flex items-center justify-between gap-4 rounded-element border p-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.label ?? r.entity_id.slice(0, 8)}</span>
                  <Badge variant="outline" className="font-normal capitalize">{r.entity_type}</Badge>
                  <Badge variant="outline" className="font-normal">{r.reason}</Badge>
                </div>
                <span className="text-13 text-muted-foreground">{sig(r)}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy === `r${r.audit_id}`}
                  onClick={() => wrap(`r${r.audit_id}`, () => reject.mutateAsync(r.audit_id), 'Dismissed — kept live')}>
                  <X size={14} className="mr-1" /> Still here
                </Button>
                <Button size="sm" disabled={busy === `a${r.audit_id}`}
                  onClick={() => wrap(`a${r.audit_id}`, () => approve.mutateAsync(r.audit_id), 'Archived (reversible)')}>
                  <Check size={14} className="mr-1" /> Archive
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* recent auto-archives */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-title"><Archive size={16} /> Recently archived</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!recentArchives.isLoading && (recentArchives.data ?? []).length === 0 && (
            <p className="text-13 text-muted-foreground">No archived entities.</p>
          )}
          {(recentArchives.data ?? []).map((r) => (
            <div key={r.audit_id} className="flex items-center justify-between gap-4 rounded-element border p-4">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.label ?? r.entity_id.slice(0, 8)}</span>
                <Badge variant="outline" className="font-normal capitalize">{r.entity_type}</Badge>
                <span className="text-13 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <Button size="sm" variant="outline" disabled={busy === `o${r.audit_id}`}
                onClick={() => wrap(`o${r.audit_id}`, () => reopen.mutateAsync({ entityType: r.entity_type, entityId: r.entity_id }), 'Reopened')}>
                <RotateCcw size={14} className="mr-1" /> Reopen
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* blind spots */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-title"><EyeOff size={16} /> Blind spots</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-13 text-muted-foreground">
            Live entities the engine cannot verify — no website, no coordinates, no source link. Add a reference to make
            them checkable.
          </p>
          {(blindSpots.data ?? []).length === 0 && !blindSpots.isLoading && (
            <p className="text-13 text-muted-foreground">No blind spots.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {(blindSpots.data ?? []).map((b) => (
              <Badge key={`${b.entity_type}:${b.entity_id}`} variant="outline" className="font-normal">
                <span className="capitalize">{b.entity_type}</span>: {b.label ?? b.entity_id.slice(0, 8)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value ?? 0}</span>
    </div>
  );
}
