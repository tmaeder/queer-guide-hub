import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Archive, RotateCcw, ExternalLink } from 'lucide-react';
import { timeAgo } from '@/utils/timezone';
import { useUnarchiveStory } from '@/hooks/useStoryRoutine';
import type { AdminProfile, StoryWithCounts } from './types';

interface Props {
  archived: StoryWithCounts[];
  adminById: Record<string, AdminProfile>;
  onOpen: (storyId: string) => void;
}

export function ArchivedStoriesPanel({ archived, adminById, onOpen }: Props) {
  const unarchive = useUnarchiveStory();
  const [pending, setPending] = useState<string | null>(null);

  if (archived.length === 0) {
    return (
      <div className="border border-border p-6 text-center">
        <Archive size={20} style={{ opacity: 0.4 }} />
        <span className="block mt-2 text-xs text-muted-foreground">
          No archived stories.
        </span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2" data-testid="archived-stories">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Archived ({archived.length})
        </p>
        {archived.map((s) => {
          const archivedBy = s.archived_by ? adminById[s.archived_by] : null;
          return (
            <div
              key={s.id}
              className="border border-border p-3 flex items-start gap-3 opacity-90"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {s.brief_title || s.title}
                </p>
                <span className="block text-xs text-muted-foreground">
                  Archived {s.archived_at ? timeAgo(s.archived_at) : ''}
                  {archivedBy?.display_name ? ` · by ${archivedBy.display_name}` : ''}
                  {s.member_count > 0 ? ` · ${s.member_count} member(s)` : ''}
                </span>
                {s.archive_reason && (
                  <span className="block mt-0.5 text-xs text-muted-foreground">
                    Reason: {s.archive_reason}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" onClick={() => onOpen(s.id)}>
                      <ExternalLink size={12} className="mr-1" />
                      Open
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending === s.id}
                      onClick={() => {
                        setPending(s.id);
                        unarchive.mutate({ storyId: s.id }, { onSettled: () => setPending(null) });
                      }}
                      data-testid={`unarchive-${s.id}`}
                    >
                      <RotateCcw size={12} className="mr-1" />
                      Unarchive
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Restore to Open</TooltipContent>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
