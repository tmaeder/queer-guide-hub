import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accessibility, ShieldCheck, AlertTriangle, Sparkles, Play } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAmenityQualitySummary } from '@/hooks/useAmenityQualitySummary';

/**
 * Compact health summary for the Amenity Truth Engine: amenity + accessibility
 * coverage, pending accessibility reviews, needs-attention, and the emptiest
 * venues to backfill (from venues_due_for_amenity_backfill).
 */
export function AmenityQualityPanel() {
  const { data } = useAmenityQualitySummary();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('amenity-truth-backfill', {
        body: { sources: ['extract', 'llm'], batch_limit: 30, only_fillable: true },
      });
      if (error) throw error;
      const r = res as { processed?: number; filled?: number; gated?: number; circuit_open?: boolean };
      if (r?.circuit_open) toast.warning('LLM circuit open — try again later');
      else toast.success(`Processed ${r?.processed ?? 0} · filled ${r?.filled ?? 0} · gated ${r?.gated ?? 0}`);
      queryClient.invalidateQueries({ queryKey: ['amenity-quality-summary'] });
      queryClient.invalidateQueries({ queryKey: ['venue-review-queue'] });
    } catch (e) {
      toast.error(`Error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  if (!data) return null;
  const { total, withAmenities, withAccessibility, needsAttention, reviewOpen, gaps, lastRun } = data;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const lastRunLabel = lastRun?.finished_at
    ? `Last run ${new Date(lastRun.finished_at).toLocaleString()} · ${lastRun.summary?.filled ?? 0} filled, ${lastRun.summary?.gated ?? 0} gated${lastRun.summary?.circuit_open ? ' · circuit open' : ''}`
    : 'No runs recorded yet';

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-title">
            <ShieldCheck size={16} />
            Amenity & accessibility quality
          </CardTitle>
          <Button size="sm" variant="outline" disabled={running} onClick={runNow}>
            <Play size={14} className="mr-1" /> {running ? 'Running…' : 'Run now'}
          </Button>
        </div>
        <p className="text-13 text-muted-foreground">{lastRunLabel}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Stat label={`Amenity coverage (${pct(withAmenities)}%)`} value={withAmenities} />
          <Stat label={`Accessibility coverage (${pct(withAccessibility)}%)`} value={withAccessibility} icon={<Accessibility size={12} />} />
          <Stat label="Pending accessibility approvals" value={reviewOpen} hardFail={reviewOpen > 0} />
          <Stat label="Needs review" value={needsAttention} />
        </div>

        {gaps.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-13 text-muted-foreground">
              <Sparkles size={12} />
              Emptiest venues to backfill
            </div>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g) => (
                <Badge key={g.id} variant="outline" className="font-normal" title={g.category ?? ''}>
                  {g.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hardFail, icon }: { label: string; value: number; hardFail?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-element border bg-muted/40 px-4 py-2">
      <span className="text-headline tabular-nums" style={hardFail && value > 0 ? { color: 'hsl(var(--destructive))' } : undefined}>
        {value}
      </span>
      <span className="flex items-center gap-1 text-13 text-muted-foreground">
        {hardFail && value > 0 && <AlertTriangle size={12} style={{ color: 'hsl(var(--destructive))' }} />}
        {icon}
        {label}
      </span>
    </div>
  );
}
