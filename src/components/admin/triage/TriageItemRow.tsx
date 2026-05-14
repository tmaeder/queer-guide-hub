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

const CONTENT_TYPE_LABELS: Record<string, string> = {
  venues: 'Venue',
  events: 'Event',
  news_articles: 'News',
  personalities: 'Person',
  marketplace_products: 'Product',
  cities: 'City',
  countries: 'Country',
  queer_villages: 'Village',
};

function humanize(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function confidenceLabel(score: number | null): { text: string; className: string } | null {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  if (score >= 0.8) return { text: `${pct}%`, className: 'text-foreground' };
  if (score >= 0.5) return { text: `${pct}%`, className: 'text-muted-foreground' };
  return { text: `${pct}%`, className: 'text-muted-foreground font-medium' };
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
  const conf = confidenceLabel(item.confidence_score);
  const contentLabel = CONTENT_TYPE_LABELS[item.content_type] ?? humanize(item.content_type);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
      className={cn(
        'flex items-start gap-2.5 px-3 py-2.5 border-b cursor-pointer transition-colors',
        isActive
          ? 'bg-foreground/[0.06] border-l-2 border-l-foreground'
          : 'hover:bg-muted/50 border-l-2 border-l-transparent',
        isSelected && !isActive && 'bg-muted/30',
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleCheck()}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 mt-0.5"
      />

      <div className="min-w-0 flex-1 space-y-0.5">
        {/* Title row */}
        <p className={cn('text-sm truncate', isActive && 'font-medium')}>
          {item.title}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal normal-case px-1.5 py-0 h-4">
            {QUEUE_LABELS[item.queue_type] ?? humanize(item.queue_type)}
          </Badge>
          <Badge variant="secondary" className="shrink-0 text-[10px] font-normal normal-case px-1.5 py-0 h-4">
            {contentLabel}
          </Badge>
          {item.has_diff && (
            <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 h-4">
              diff
            </Badge>
          )}
          {item.subtitle && (
            <span className="text-[10px] text-muted-foreground truncate">
              {humanize(item.subtitle)}
            </span>
          )}
        </div>
      </div>

      {/* Right side: confidence + age */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatAge(item.created_at)}
        </span>
        {conf && (
          <span className={cn('text-[10px] tabular-nums', conf.className)}>
            {conf.text}
          </span>
        )}
      </div>
    </div>
  );
}
