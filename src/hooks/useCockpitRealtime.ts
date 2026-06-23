/**
 * useCockpitRealtime — invalidate cockpit queries when watched tables change.
 * Each mount gets a UNIQUE channel topic (useId suffix) — two cockpit instances
 * (or a cockpit + another page) must never share a static topic, or the second
 * .subscribe() clobbers the first and throws inside the effect (the
 * realtime-channel-collision bug, see queerguide_realtime_channel_topic_collision).
 */

import { useEffect, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const WATCHED: Array<{ table: string; keys: string[][] }> = [
  { table: 'admin_automation_runs', keys: [['cockpit', 'automation-summary'], ['admin-automations'], ['admin-automation-runs']] },
  { table: 'import_jobs', keys: [['cockpit', 'imports']] },
  { table: 'moderation_flags', keys: [['cockpit', 'review'], ['admin-counts']] },
  { table: 'workflow_runs', keys: [['cockpit', 'pipeline-errors']] },
];

export function useCockpitRealtime(enabled = true) {
  const qc = useQueryClient();
  const instanceId = useId();

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel(`cockpit:${instanceId}`);

    for (const { table, keys } of WATCHED) {
      channel.on(
        // @ts-expect-error — supabase-js realtime filter typing is looser than its generics
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          for (const key of keys) qc.invalidateQueries({ queryKey: key });
        },
      );
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, instanceId, qc]);
}
