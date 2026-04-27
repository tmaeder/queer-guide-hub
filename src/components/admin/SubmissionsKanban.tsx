import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { submissionRegistry } from '@/config/submissionRegistry';

interface KanbanRow {
  id: string;
  content_type: string;
  status: string;
  feedback_status: string;
  data: Record<string, unknown>;
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  promoted_to_id: string | null;
  promoted_to_table: string | null;
  platform: string | null;
  media_processing_status: string | null;
  media_urls: string[] | null;
  queer_relevance_score: number | null;
  confidence_score: number | null;
  safety_flags: Array<{ type: string; severity: string; reason?: string }> | null;
  raw_text: string | null;
  ocr_text: string | null;
  vision_summary: string | null;
  transcript_text: string | null;
}

const LANES: Array<{ key: string; label: string; color: string }> = [
  { key: 'pending', label: 'Pending', color: '#f59e0b' },
  { key: 'approved', label: 'Approved', color: '#22c55e' },
  { key: 'rejected', label: 'Rejected', color: '#ef4444' },
  { key: 'merged', label: 'Merged', color: '#6366f1' },
];

const SELECT =
  'id,content_type,status,feedback_status,data,submitted_by,submitted_at,reviewed_by,reviewed_at,reviewer_notes,promoted_to_id,promoted_to_table,platform,media_processing_status,media_urls,queer_relevance_score,confidence_score,safety_flags,raw_text,ocr_text,vision_summary,transcript_text';

function getTitle(row: KanbanRow): string {
  const config = submissionRegistry[row.content_type];
  return String(row.data?.[config?.titleField || 'name'] || 'Untitled');
}

interface Props {
  onCardClick: (row: KanbanRow) => void;
}

export function SubmissionsKanban({ onCardClick }: Props) {
  const { data: rows = [], isLoading } = useQuery<KanbanRow[]>({
    queryKey: ['admin-table', 'community_submissions', 'kanban'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_submissions')
        .select(SELECT)
        .order('submitted_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as KanbanRow[];
    },
  });

  const byLane = useMemo(() => {
    const map: Record<string, KanbanRow[]> = {};
    for (const lane of LANES) map[lane.key] = [];
    for (const row of rows) {
      const key = map[row.status] ? row.status : 'pending';
      map[key].push(row);
    }
    return map;
  }, [rows]);

  if (isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', color: 'var(--muted-foreground)' }}>Loading…</Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: `repeat(${LANES.length}, 1fr)` },
        gap: 2,
      }}
    >
      {LANES.map((lane) => {
        const laneRows = byLane[lane.key] ?? [];
        return (
          <Box
            key={lane.key}
            sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: lane.color }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {lane.label}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--muted-foreground)' }}>
                {laneRows.length}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 80 }}>
              {laneRows.length === 0 ? (
                <Box
                  sx={{
                    p: 2,
                    fontSize: 12,
                    color: 'var(--muted-foreground)',
                    border: '1px dashed',
                    borderColor: 'divider',
                    textAlign: 'center',
                  }}
                >
                  Empty
                </Box>
              ) : (
                laneRows.map((row) => (
                  <KanbanCard key={row.id} row={row} onClick={() => onCardClick(row)} />
                ))
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function KanbanCard({ row, onClick }: { row: KanbanRow; onClick: () => void }) {
  const config = submissionRegistry[row.content_type];
  const Icon = config?.icon;
  const score = row.queer_relevance_score;
  const hasHighSeverity = (row.safety_flags ?? []).some((f) => f.severity === 'high');
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        p: 1.25,
        border: '1px solid',
        borderColor: hasHighSeverity ? '#ef4444' : 'divider',
        bgcolor: 'background.paper',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        {Icon && (
          <Icon style={{ width: 14, height: 14, color: config?.color, flexShrink: 0 }} />
        )}
        <Typography
          variant="body2"
          sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {getTitle(row)}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {row.platform && (
          <Badge variant="outline" style={{ fontSize: 10 }}>
            {row.platform}
          </Badge>
        )}
        {typeof score === 'number' && (
          <Badge variant="secondary" style={{ fontSize: 10 }}>
            rel {score.toFixed(2)}
          </Badge>
        )}
        {hasHighSeverity && (
          <Badge variant="destructive" style={{ fontSize: 10 }}>
            risk
          </Badge>
        )}
      </Box>
    </Box>
  );
}

export type { KanbanRow };
