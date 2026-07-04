import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Flag, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type EntityType = 'venue' | 'event' | 'marketplace';

/**
 * "Report this no longer exists" — sends a low-weight community signal to the
 * Existence Truth Engine. A single report never archives anything; it needs
 * corroboration (≥2 strong signals or an admin). Sign-in required.
 */
export function ReportClosedButton({ entityType, entityId }: { entityType: EntityType; entityId: string }) {
  const { user } = useAuth();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-13 text-muted-foreground">
        <Check size={14} /> Thanks — we’ll check.
      </span>
    );
  }

  const report = async () => {
    if (!user) { toast.error('Sign in to report this.'); return; }
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('report-existence', {
        body: { entity_type: entityType, entity_id: entityId },
      });
      if (error) throw error;
      setDone(true);
    } catch (e) {
      toast.error(`Could not send: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy} onClick={report}>
      <Flag size={14} className="mr-1" /> Report as closed
    </Button>
  );
}
