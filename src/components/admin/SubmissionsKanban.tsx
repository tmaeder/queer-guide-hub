import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { listFrom } from '@/hooks/usePageFetchers';
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
  const field = config?.titleField || 'name';
  return String(
    row.data?.[field] || row.data?.title || row.data?.name || row.data?.subject || row.content_type || 'Untitled',
  );
}

interface Props {
  onCardClick: (row: KanbanRow) => void;
}

const KANBAN_LIMIT = 500;

export function SubmissionsKanban({ onCardClick }: Props) {
  const { data: rows = [], isLoading } = useQuery<KanbanRow[]>({
    queryKey: ['admin-table', 'community_submissions', 'kanban'],
    queryFn: () =>
      listFrom<KanbanRow>(
        'community_submissions',
        SELECT,
        { col: 'submitted_at', ascending: false },
        KANBAN_LIMIT,
      ),
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
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length >= KANBAN_LIMIT && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {rows.length} most recent items. Switch to table view for full pagination.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
      {LANES.map((lane) => {
        const laneRows = byLane[lane.key] ?? [];
        return (
          <div key={lane.key} className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2 px-1">
              <div
                className="rounded-full"
                style={{ width: 8, height: 8, backgroundColor: lane.color }}
              />
              <p className="text-sm font-semibold">{lane.label}</p>
              <span className="text-xs text-muted-foreground">{laneRows.length}</span>
            </div>
            <div className="flex flex-col gap-2" style={{ minHeight: 80 }}>
              {laneRows.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground text-center border border-dashed border-border">
                  Empty
                </div>
              ) : (
                laneRows.map((row) => (
                  <KanbanCard key={row.id} row={row} onClick={() => onCardClick(row)} />
                ))
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function KanbanCard({ row, onClick }: { row: KanbanRow; onClick: () => void }) {
  const config = submissionRegistry[row.content_type];
  const Icon = config?.icon;
  const score = row.queer_relevance_score;
  const hasHighSeverity = (row.safety_flags ?? []).some((f) => f.severity === 'high');
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="p-2 bg-background cursor-pointer flex flex-col gap-1.5 hover:bg-muted"
      style={{
        border: `1px solid ${hasHighSeverity ? '#ef4444' : 'hsl(var(--border))'}`,
      }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {Icon && (
          <Icon style={{ width: 14, height: 14, color: config?.color, flexShrink: 0 }} />
        )}
        <p className="text-sm font-medium truncate">{getTitle(row)}</p>
      </div>
      <div className="flex gap-1 flex-wrap">
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
      </div>
    </div>
  );
}

export type { KanbanRow };
