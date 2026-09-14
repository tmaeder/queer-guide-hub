import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { splitQualityTitle, fieldBadgeLabel } from '@/lib/qualityQueue';
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
  // The five quality keys were missing, so every one of the ~4,000 quality
  // rows fell through to humanize() and rendered "Quality Personality" — the
  // queue name repeated on every row, which is the one thing it cannot help a
  // reviewer distinguish. The entity is already on the content badge, so the
  // queue badge says only what kind of queue this is.
  'quality-city': 'Quality',
  'quality-venue': 'Quality',
  'quality-village': 'Quality',
  'quality-personality': 'Quality',
  'quality-marketplace': 'Quality',
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
  const { name, field } = splitQualityTitle(item.title, item.meta?.field);
  const requiresConfirm = Boolean(
    (item.risk_flags as { confirm_may_be_required?: boolean } | undefined)?.confirm_may_be_required,
  );
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
        'flex items-start gap-2.5 px-4 py-2.5 border-b cursor-pointer transition-colors',
        isActive
          ? 'bg-foreground/[0.06] border-l border-l-foreground'
          : 'hover:bg-muted/50 border-l border-l-transparent',
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
        <p className={cn('text-sm truncate', isActive && 'font-medium')}>{name}</p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className="shrink-0 text-2xs font-normal normal-case px-1.5 py-0 h-4"
          >
            {QUEUE_LABELS[item.queue_type] ?? humanize(item.queue_type)}
          </Badge>
          <Badge
            variant="secondary"
            className="shrink-0 text-2xs font-normal normal-case px-1.5 py-0 h-4"
          >
            {contentLabel}
          </Badge>
          {field && (
            <Badge
              variant="outline"
              className="shrink-0 text-2xs font-normal normal-case px-1.5 py-0 h-4"
            >
              {fieldBadgeLabel(field)}
            </Badge>
          )}
          {/*
            The safety gate, surfaced on the LIST and not only in the detail
            panel. `confirm_may_be_required` has been emitted by
            triage_src_quality_city since that view existed and no component
            ever read it — the same way `namesake` sat unread on the dedup
            rows. A reviewer scanning the list should see which rows will ask
            them to take responsibility for an outing-safety claim before they
            open one.
          */}
          {requiresConfirm && (
            <Badge
              variant="outline"
              className="shrink-0 text-2xs font-normal normal-case px-1.5 py-0 h-4 gap-0.5"
            >
              <ShieldAlert className="h-2.5 w-2.5" aria-hidden="true" />
              confirm
            </Badge>
          )}
          {item.has_diff && (
            <Badge variant="outline" className="shrink-0 text-2xs px-1 py-0 h-4">
              diff
            </Badge>
          )}
          {item.subtitle && (
            <span className="text-2xs text-muted-foreground truncate">
              {humanize(item.subtitle)}
            </span>
          )}
        </div>
      </div>

      {/* Right side: confidence + age */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-2xs text-muted-foreground tabular-nums">
          {formatAge(item.created_at)}
        </span>
        {conf && <span className={cn('text-2xs tabular-nums', conf.className)}>{conf.text}</span>}
      </div>
    </div>
  );
}
