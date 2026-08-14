import { useState } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DiscoveryResult {
  proposed: number;
  inserted: number;
  skipped?: { title: string; reason: string }[];
  circuit_open?: boolean;
  capped?: boolean;
}

/**
 * "AI suggestions" trigger for the milestones admin. Invokes the
 * milestone-discovery edge function on demand (same function the weekly cron
 * calls). The function stages proposals as review_status='pending' — nothing is
 * published — so this only ever fills the review queue. onComplete refreshes the
 * list so the new pending rows show up.
 */
export function MilestoneDiscoveryButton({ onComplete }: { onComplete?: () => void }) {
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<DiscoveryResult>(
        'milestone-discovery',
        { body: { count: 8 } },
      );
      if (error) throw error;
      const r = data ?? { proposed: 0, inserted: 0 };
      if (r.circuit_open) {
        toast.warning('AI temporarily unavailable', {
          description: 'Circuit breaker is open — try again later.',
        });
      } else if (r.capped) {
        toast.info('Daily limit reached', {
          description: 'Enough suggestions have already been generated today.',
        });
      } else if (r.inserted > 0) {
        toast.success(`${r.inserted} suggestions staged for review`, {
          description: 'Staged as "pending" — not public. Review and publish them below.',
        });
      } else {
        toast.info('No new suggestions', {
          description: `${r.proposed} proposed, all were duplicates or invalid.`,
        });
      }
      onComplete?.();
    } catch (e) {
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={run} disabled={loading}>
      {loading ? <TrackLoader size={16} className="me-2" /> : <Sparkles className="me-2 h-4 w-4" />}
      Find AI suggestions
    </Button>
  );
}
