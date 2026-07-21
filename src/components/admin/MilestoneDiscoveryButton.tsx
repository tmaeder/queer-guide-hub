import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
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
        toast.warning('KI vorübergehend gesperrt', {
          description: 'Circuit breaker offen — später erneut versuchen.',
        });
      } else if (r.capped) {
        toast.info('Tageslimit erreicht', {
          description: 'Heute wurden bereits genug Vorschläge erzeugt.',
        });
      } else if (r.inserted > 0) {
        toast.success(`${r.inserted} Vorschläge zur Prüfung angelegt`, {
          description:
            'Als "pending" gestaged (nicht öffentlich). Unten prüfen und freigeben.',
        });
      } else {
        toast.info('Keine neuen Vorschläge', {
          description: `${r.proposed} vorgeschlagen, alle waren Duplikate oder ungültig.`,
        });
      }
      onComplete?.();
    } catch (e) {
      toast.error(`Fehler: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={run} disabled={loading}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
      KI-Vorschläge suchen
    </Button>
  );
}
