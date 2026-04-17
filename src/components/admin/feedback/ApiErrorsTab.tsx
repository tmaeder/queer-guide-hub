import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Server, Hash, Zap, Copy, Github, MessageSquarePlus, Check } from 'lucide-react';
import { timeAgo } from '@/utils/timezone';
import { kanbanColumns, type KanbanStatus } from './constants';
import { SERVICE_COLORS, type ApiErrorSubmission } from './claudePrompts';
import { SparklineCell } from './analytics/SparklineCell';
import { toDailySeries, type ApiErrorDailyRow } from '@/hooks/useFeedbackAnalytics';

interface Props {
  errors: ApiErrorSubmission[];
  dailySeries: ApiErrorDailyRow[];
  onCopyPrompt: (item: ApiErrorSubmission) => void;
  onForward: (id: string) => void;
  onStatusChange: (id: string, status: KanbanStatus) => void;
  forwardingIds: Set<string>;
}

export function ApiErrorsTab({
  errors,
  dailySeries,
  onCopyPrompt,
  onForward,
  onStatusChange,
  forwardingIds,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Group rows of the same daily-series to avoid repeated filters in render.
  const seriesBySubmission = useMemo(() => {
    const map: Record<string, ApiErrorDailyRow[]> = {};
    for (const r of dailySeries) {
      (map[r.submission_id] ??= []).push(r);
    }
    return map;
  }, [dailySeries]);

  // Impact sort = occurrence_count × days-active (bounded) so chronic errors
  // float above one-off spikes.
  function impactScore(e: ApiErrorSubmission): number {
    const firstSeen = new Date(e.submitted_at).getTime();
    const lastSeen = new Date(e.last_seen_at).getTime();
    const daysActive = Math.max(1, Math.min(30, (lastSeen - firstSeen) / 86400_000));
    return e.occurrence_count * daysActive;
  }

  const groupedByStatus = useMemo(() => {
    const map: Record<string, ApiErrorSubmission[]> = {
      new: [],
      under_review: [],
      in_progress: [],
      done: [],
    };
    for (const e of errors) {
      const s = e.feedback_status || 'new';
      if (map[s]) map[s].push(e);
      else map.new.push(e);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => impactScore(b) - impactScore(a));
    }
    return map;
  }, [errors]);

  if (errors.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No API errors recorded
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {(['new', 'under_review', 'in_progress', 'done'] as const).map((status) => {
        const group = groupedByStatus[status] || [];
        if (group.length === 0) return null;
        const col = kanbanColumns.find((c) => c.id === status);
        return (
          <Box key={status} sx={{ mb: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 1,
                pb: 0.5,
                borderBottom: 2,
                borderColor: col?.color || '#888',
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {col?.label || status}
              </Typography>
              <Badge variant="secondary" style={{ fontSize: '0.65rem' }}>
                {group.length}
              </Badge>
            </Box>
            {group.map((item) => (
              <Box
                key={item.id}
                sx={{
                  p: 1.5,
                  mb: 1,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  cursor: 'pointer',
                  '&:hover': { borderColor: 'primary.main' },
                }}
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Badge
                    variant="outline"
                    style={{
                      borderColor: SERVICE_COLORS[item.data.service] || '#888',
                      color: SERVICE_COLORS[item.data.service] || '#888',
                      fontSize: '0.6rem',
                      padding: '1px 5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <Server style={{ width: 9, height: 9 }} />
                    {item.data.service}
                  </Badge>
                  <Badge
                    variant="outline"
                    style={{
                      fontSize: '0.6rem',
                      padding: '1px 5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <Zap style={{ width: 9, height: 9 }} />
                    {item.data.function_name}
                  </Badge>
                  <Box sx={{ flex: 1 }} />
                  <Box sx={{ opacity: 0.8 }}>
                    <SparklineCell
                      data={toDailySeries(seriesBySubmission[item.id] ?? [], 14)}
                      color={SERVICE_COLORS[item.data.service] || '#888'}
                    />
                  </Box>
                  <Badge
                    variant="secondary"
                    style={{
                      fontSize: '0.6rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <Hash style={{ width: 9, height: 9 }} />
                    {item.occurrence_count}x
                  </Badge>
                </Box>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.75rem' }}
                >
                  {item.data.message}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  Last seen {timeAgo(item.last_seen_at)}
                  {item.data.status_code ? ` · ${item.data.status_code}` : ''}
                  {item.data.endpoint ? ` · ${item.data.endpoint}` : ''}
                </Typography>

                <Collapse in={expanded === item.id}>
                  <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                    {item.data.stack && (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}
                        >
                          Stack trace
                        </Typography>
                        <Box
                          sx={{
                            p: 1,
                            bgcolor: 'action.hover',
                            fontFamily: 'monospace',
                            fontSize: '0.6rem',
                            maxHeight: 200,
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {item.data.stack}
                        </Box>
                      </Box>
                    )}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="outline"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          onCopyPrompt(item);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <Copy style={{ width: 14, height: 14 }} />
                        Copy Prompt
                      </Button>
                      {item.feedback_status !== 'done' && (
                        <Button
                          variant="outline"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            onStatusChange(item.id, 'done');
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                          title="Mark resolved (auto-reopens if it recurs)"
                        >
                          <Check style={{ width: 14, height: 14 }} />
                          Resolve
                        </Button>
                      )}
                      {item.github_issue_url ? (
                        <Button
                          variant="outline"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            window.open(item.github_issue_url!, '_blank');
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <Github style={{ width: 14, height: 14 }} />
                          Issue #{item.github_issue_number}
                        </Button>
                      ) : (
                        <Button
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            onForward(item.id);
                          }}
                          disabled={forwardingIds.has(item.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            backgroundColor: '#DB2777',
                            color: '#fff',
                          }}
                        >
                          <MessageSquarePlus style={{ width: 14, height: 14 }} />
                          {forwardingIds.has(item.id) ? 'Forwarding…' : 'Fix with Claude'}
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Collapse>
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
