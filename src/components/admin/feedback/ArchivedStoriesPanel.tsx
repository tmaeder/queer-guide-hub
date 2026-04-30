import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
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
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
        <Archive size={20} style={{ opacity: 0.4 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          No archived stories.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} data-testid="archived-stories">
      <Typography variant="overline" color="text.secondary">
        Archived ({archived.length})
      </Typography>
      {archived.map((s) => {
        const archivedBy = s.archived_by ? adminById[s.archived_by] : null;
        return (
          <Paper
            key={s.id}
            variant="outlined"
            sx={{
              p: 1.25,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
              opacity: 0.85,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {s.brief_title || s.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Archived {s.archived_at ? timeAgo(s.archived_at) : ''}
                {archivedBy?.display_name ? ` · by ${archivedBy.display_name}` : ''}
                {s.member_count > 0 ? ` · ${s.member_count} member(s)` : ''}
              </Typography>
              {s.archive_reason && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                  Reason: {s.archive_reason}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Tooltip title="Open">
                <Button
                  size="small"
                  onClick={() => onOpen(s.id)}
                  startIcon={<ExternalLink size={12} />}
                >
                  Open
                </Button>
              </Tooltip>
              <Tooltip title="Restore to Open">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<RotateCcw size={12} />}
                  disabled={pending === s.id}
                  onClick={() => {
                    setPending(s.id);
                    unarchive.mutate({ storyId: s.id }, { onSettled: () => setPending(null) });
                  }}
                  data-testid={`unarchive-${s.id}`}
                >
                  Unarchive
                </Button>
              </Tooltip>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
