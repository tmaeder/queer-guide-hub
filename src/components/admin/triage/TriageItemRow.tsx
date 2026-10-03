import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { splitQualityTitle, fieldBadgeLabel } from '@/lib/qualityQueue';
import { queueByKey, queueImpact, queueRisk } from '@/config/adminQueues';
import type { TriageItem } from '@/hooks/useUnifiedTriageQueue';

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

function formatAge(dateStr: string, nowMs: number): string {
  const ms = nowMs - new Date(dateStr).getTime();
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
  slaHours?: number;
}

export function TriageItemRow({
  item,
  isActive,
  isSelected,
  onSelect,
  onToggleCheck,
  slaHours,
}: TriageItemRowProps) {
  const [renderedAt] = useState(Date.now);
  const conf = confidenceLabel(item.confidence_score);
  const { name, field } = splitQualityTitle(item.title, item.meta?.field);
  const requiresConfirm = Boolean(
    (item.risk_flags as { confirm_may_be_required?: boolean } | undefined)?.confirm_may_be_required,
  );
  const contentLabel = CONTENT_TYPE_LABELS[item.content_type] ?? humanize(item.content_type);
  const queue = queueByKey(item.queue_type);
  const queueLabel = item.queue_type.startsWith('quality-')
    ? 'Quality'
    : (queue?.label ?? humanize(item.queue_type));
  const flags = item.risk_flags as
    | {
        confirm_may_be_required?: boolean;
        requires_confirm?: boolean;
        safety?: boolean;
        namesake?: boolean;
      }
    | undefined;
  const safety = Boolean(
    flags?.confirm_may_be_required ||
    flags?.requires_confirm ||
    flags?.safety ||
    flags?.namesake ||
    (queue && queueRisk(queue) === 'safety'),
  );
  const publicImpact = Boolean(queue && queueImpact(queue) === 'public');
  const ageHours = (renderedAt - new Date(item.created_at).getTime()) / 3_600_000;
  const overdue = slaHours != null && Number.isFinite(ageHours) && ageHours > slaHours;

  return (
    // The row is a plain container with an overlay button as its LAST child —
    // the "overlay siblings, never wrappers" rule this repo applies to cards.
    // It used to be `role="button" tabIndex={0}` wrapping the Checkbox, which
    // is axe `nested-interactive` (serious, WCAG 4.1.2): a button may not have
    // focusable descendants. The a11y suite could not see it, because until the
    // triage UNION was fixed /admin/inbox rendered an error banner and this
    // component never mounted in CI.
    <div
      className={cn(
        'group relative flex min-h-16 items-start gap-4 border-b border-border-hairline px-4 py-4 transition-colors',
        isActive
          ? 'border-l-4 border-l-foreground bg-muted/80'
          : 'border-l-4 border-l-transparent hover:bg-muted/45',
        isSelected && !isActive && 'bg-muted/60',
      )}
    >
      {/* h-6 w-6 (24px) rather than the primitive's 16px: this checkbox stands
          alone, so WCAG 2.5.8 target size cannot come from a surrounding label
          row the way the primitive's comment assumes. z-10 keeps it ABOVE the
          overlay below, which otherwise swallows the click. */}
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggleCheck()}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${item.title}`}
        className="relative z-10 mt-0.5 h-6 w-6 shrink-0"
      />

      <div className="min-w-0 flex-1 space-y-1">
        {/* Title row */}
        <p className="truncate text-13 font-semibold leading-snug text-foreground">{name}</p>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="shrink-0 text-2xs font-normal normal-case px-1.5 py-0 h-4"
          >
            {queueLabel}
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
          {safety && (
            <Badge
              variant="outline"
              className="shrink-0 text-2xs font-medium normal-case px-1.5 py-0 h-4"
            >
              Safety
            </Badge>
          )}
          {overdue && (
            <Badge
              variant="destructive"
              className="shrink-0 text-2xs font-medium normal-case px-1.5 py-0 h-4"
              title={`SLA ${slaHours}h`}
            >
              Overdue
            </Badge>
          )}
          {publicImpact && (
            <Badge
              variant="secondary"
              className="shrink-0 text-2xs font-medium normal-case px-1.5 py-0 h-4"
            >
              Public
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
      <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
        <span className="text-2xs font-medium tabular-nums text-muted-foreground" title="Age">
          {formatAge(item.created_at, renderedAt)}
        </span>
        {conf && (
          <span
            className={cn('text-2xs tabular-nums', conf.className)}
            aria-label={`${conf.text} confidence`}
            title="Confidence"
          >
            {conf.text}
          </span>
        )}
      </div>

      {/* Covers the whole row, so a click anywhere still opens the item — and a
          real <button> brings Enter AND Space for free, where the old div
          handled only Enter. Last child so it paints over the text; the
          Checkbox above opts out with z-10. */}
      {/* min-h-0 is load-bearing, not tidying: `@layer base` in index.css gives
          every <button> min-height:44px, and min-height beats the height an
          `inset-0` box resolves to. A row shorter than 44px would leave this
          overlay hanging past its own row and swallowing clicks on the next
          one. Today's rows are ~58px so it does not bite — which is exactly
          what would make the regression baffling later. The utilities layer
          wins over base, the same opt-out the Checkbox primitive uses. */}
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Open ${item.title}`}
        aria-current={isActive ? 'true' : undefined}
        className="absolute inset-0 min-h-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
    </div>
  );
}
