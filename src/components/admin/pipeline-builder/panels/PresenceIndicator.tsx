import { useEffect, useState } from 'react';
import { Users, Eye, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Presence {
  user_id: string;
  email: string | null;
  activity: 'viewing' | 'editing';
  last_seen: string;
}

interface PresenceIndicatorProps {
  pipelineId: string | undefined;
  isDirty: boolean;
}

function colorForUserId(id: string): string {
  // Deterministic pastel from user id hash
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/**
 * Lightweight realtime presence via Supabase Realtime channel.
 * Shows other admins currently viewing/editing the same pipeline.
 * Not OT/CRDT — just awareness. Last-save-wins on conflicts (the existing
 * version number + diff dialog surface any stale-edit collisions).
 */
export default function PresenceIndicator({ pipelineId, isDirty }: PresenceIndicatorProps) {
  const [others, setOthers] = useState<Presence[]>([]);

  useEffect(() => {
    if (!pipelineId) { setOthers([]); return; }

    let channel: RealtimeChannel | null = null;
    let cleanup: (() => void) | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;

      const myPresence: Presence = {
        user_id: user.id,
        email: user.email ?? null,
        activity: isDirty ? 'editing' : 'viewing',
        last_seen: new Date().toISOString(),
      };

      channel = supabase.channel(`pipeline-presence:${pipelineId}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel!.presenceState<Presence>();
          const list: Presence[] = [];
          for (const [uid, presences] of Object.entries(state)) {
            if (uid === user.id) continue;
            if (presences && presences[0]) list.push(presences[0]);
          }
          setOthers(list);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel!.track(myPresence);
          }
        });

      // Heartbeat to refresh last_seen and reflect dirty→editing transitions
      const heartbeat = window.setInterval(() => {
        if (channel) {
          channel.track({ ...myPresence, activity: isDirty ? 'editing' : 'viewing', last_seen: new Date().toISOString() });
        }
      }, 15_000);

      cleanup = () => {
        window.clearInterval(heartbeat);
        if (channel) void supabase.removeChannel(channel);
      };
    })();

    return () => cleanup?.();
  }, [pipelineId, isDirty]);

  if (others.length === 0) return null;

  const editorCount = others.filter(p => p.activity === 'editing').length;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 border border-border rounded-md px-1.5 py-0.5 bg-background h-8 cursor-help">
            <Users className="h-3 w-3 text-muted-foreground" />
            <div className="flex -space-x-1">
              {others.slice(0, 3).map(p => (
                <div
                  key={p.user_id}
                  className="w-5 h-5 rounded-full border-2 border-background flex items-center justify-center text-3xs font-semibold text-white"
                  style={{ backgroundColor: colorForUserId(p.user_id) }}
                  title={p.email || p.user_id.slice(0, 8)}
                >
                  {(p.email || p.user_id)[0]?.toUpperCase()}
                </div>
              ))}
              {others.length > 3 && (
                <div className="w-5 h-5 rounded-full border-2 border-background bg-muted text-muted-foreground flex items-center justify-center text-3xs font-semibold">
                  +{others.length - 3}
                </div>
              )}
            </div>
            {editorCount > 0 && (
              <Pencil className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400 ml-0.5" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-xs max-w-[280px]">
          <div className="font-medium mb-1">{others.length} other{others.length === 1 ? '' : 's'} here</div>
          <div className="space-y-1">
            {others.map(p => (
              <div key={p.user_id} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: colorForUserId(p.user_id) }}
                />
                <span className="truncate flex-1">{p.email || p.user_id.slice(0, 12)}</span>
                {p.activity === 'editing' ? (
                  <Pencil className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
          {editorCount > 1 && (
            <div className="mt-2 pt-2 border-t border-border text-2xs text-amber-600 dark:text-amber-400">
              ⚠ Multiple editors — last save wins
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
