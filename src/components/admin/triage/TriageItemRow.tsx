import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

const QUEUE_LABELS: Record<string, string> = {
  staging: 'Staging',
  moderation: 'Report',
  submissions: 'Submission',
  content: 'CMS',
  automation: 'Auto',
  tags: 'Tag',
  duplicates: 'Dedup',
  'news-quality': 'News QA',
  'entity-links': 'Link',
};

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function confidenceDot(score: number | null): string {
  if (score === null) return 'bg-muted';
  if (score >= 0.8) return 'bg-foreground';
  if (score >= 0.5) return 'bg-muted-foreground';
  return 'bg-muted-foreground/40';
}

interface TriageItemRowProps {
  item: TriageItem;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
}

export function TriageItemRow({
  item,
  isActive,
  isSelected,
  onSelect,
  onToggleCheck,
}: TriageItemRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
      className={cn(
        'flex items-center gap-2 px-3 py-2 border-b cursor-pointer transition-colors',
        isActive ? 'bg-accent' : 'hover:bg-muted/50',
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleCheck()}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />

      <div className={cn('w-2 h-2 shrink-0', confidenceDot(item.confidence_score))} />

      <Badge variant="outline" className="shrink-0 text-[10px] font-normal px-1.5 py-0">
        {QUEUE_LABELS[item.queue_type] ?? item.queue_type}
      </Badge>

      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{item.title}</p>
      </div>

      {item.has_diff && (
        <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0">
          diff
        </Badge>
      )}

      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
        {formatAge(item.created_at)}
      </span>
    </div>
  );
}
