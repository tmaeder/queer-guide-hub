import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import { MessageSquare, AlertTriangle, User as UserIcon } from 'lucide-react';
import { storyColumns, priorityFor } from './constants';
import type { AdminProfile, StoryStatus, StoryWithCounts } from './types';

interface Props {
  grouped: Record<StoryStatus, StoryWithCounts[]>;
  adminById: Record<string, AdminProfile>;
  onStoryClick: (story: StoryWithCounts) => void;
}

export function StoriesKanban({ grouped, adminById, onStoryClick }: Props) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0,1fr))' },
        gap: 2,
        mt: 2,
      }}
    >
      {storyColumns.map((col) => {
        const items = grouped[col.id] ?? [];
        return (
          <Box key={col.id} sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  bgcolor: col.color,
                  borderRadius: '50%',
                }}
              />
              <Typography variant="body2" sx={{ fontWeight: 600, letterSpacing: 0.3 }}>
                {col.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {items.length}
              </Typography>
            </Box>

            {items.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', py: 2 }}>
                No stories here.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {items.map((story) => {
                  const prio = priorityFor(story.priority);
                  const assignee = story.assignee_id ? adminById[story.assignee_id] : null;
                  return (
                    <Paper
                      key={story.id}
                      elevation={0}
                      onClick={() => onStoryClick(story)}
                      sx={{
                        p: 1.25,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'start', gap: 1 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, flex: 1, lineHeight: 1.3 }}
                        >
                          {story.title}
                        </Typography>
                        <Chip
                          size="small"
                          label={prio.short}
                          sx={{
                            bgcolor: prio.color,
                            color: 'white',
                            height: 18,
                            fontSize: '0.65rem',
                            '& .MuiChip-label': { px: 0.75 },
                          }}
                        />
                      </Box>

                      <Box
                        sx={{
                          mt: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          flexWrap: 'wrap',
                        }}
                      >
                        {story.feedback_count > 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <MessageSquare size={12} />
                            <Typography variant="caption" color="text.secondary">
                              {story.feedback_count}
                            </Typography>
                          </Box>
                        )}
                        {story.error_count > 0 && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AlertTriangle size={12} />
                            <Typography variant="caption" color="text.secondary">
                              {story.error_count}
                            </Typography>
                          </Box>
                        )}
                        {assignee && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <UserIcon size={12} />
                            <Typography variant="caption" color="text.secondary">
                              {assignee.display_name ?? assignee.user_id.slice(0, 8)}
                            </Typography>
                          </Box>
                        )}
                        {story.origin === 'ai_suggested' && (
                          <Chip
                            size="small"
                            label="AI"
                            sx={{ height: 16, fontSize: '0.6rem' }}
                          />
                        )}
                      </Box>

                      {story.labels.length > 0 && (
                        <Box sx={{ mt: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {story.labels.slice(0, 3).map((l) => (
                            <Chip
                              key={l}
                              size="small"
                              label={l}
                              sx={{ height: 16, fontSize: '0.6rem' }}
                            />
                          ))}
                        </Box>
                      )}
                    </Paper>
                  );
                })}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
