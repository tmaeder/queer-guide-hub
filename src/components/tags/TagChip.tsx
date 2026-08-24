import { useState } from 'react';
import { Tag as TagIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { normalizeTagName } from '@/utils/tagNormalization';
import { HoverCard, HoverCardTrigger } from '@/components/ui/hover-card';
import { TagChipHoverContent } from './TagChipHover';

export interface TagChipProps {
  /** Tag slug (the value stored in entity `tags[]` columns) — used for the link target. */
  tag: string;
  /** Optional explicit display name; otherwise derived from the slug. */
  name?: string;
  /** Optional usage / overlap count shown after the label. */
  count?: number;
  size?: 'sm' | 'default';
  /** Show a leading Tag icon. */
  icon?: boolean;
  /** Filter mode — renders a removable button instead of a link. */
  removable?: boolean;
  /** Selected-facet state (filled vs outline). */
  active?: boolean;
  /** Render as a non-interactive span (use inside card links — nested <a> is invalid HTML). */
  linkless?: boolean;
  /** Disable the glossary hover card (dense/admin surfaces). Link mode only. */
  preview?: boolean;
  /**
   * Href override for FILTER-scoped chips (e.g. an attribute chip on a
   * product linking into filtered /marketplace browse instead of the
   * glossary). Also suppresses the glossary hover preview — a filter link
   * must not preview a wiki entry.
   */
  to?: string;
  onRemove?: () => void;
  className?: string;
}

/** Slug → display name when no explicit name is provided ("bear-bar" → "Bear Bar"). */
function displayFromSlug(slug: string): string {
  return normalizeTagName(slug.replace(/[-_]+/g, ' '));
}

function tagHref(slug: string): string {
  return `/tags/${encodeURIComponent(slug.toLowerCase())}`;
}

/**
 * The single canonical tag chip used across every content type. Links to the
 * canonical tag page `/tags/:slug`. Monochrome, `rounded-badge`, never the
 * reserved brand accent. In `removable` mode it is a filter affordance (button)
 * and never navigates.
 */
export function TagChip({
  tag,
  name,
  count,
  size = 'default',
  icon = false,
  removable = false,
  active = false,
  linkless = false,
  preview = true,
  to,
  onRemove,
  className,
}: TagChipProps) {
  const label = name ? normalizeTagName(name) : displayFromSlug(tag);
  const [previewOpen, setPreviewOpen] = useState(false);

  // min-h-6 keeps all three render modes the same height. index.css only grants
  // `a.rounded-badge` / `button.rounded-badge` a 24px minimum, so without this the
  // `linkless` <span> would render 4px shorter than the link and button variants.
  const base = cn(
    // PASTE-UP: a tag is a stamped chip, so both states are flat fills and the
    // outline is gone. This one string renders 20-41 times on a single city
    // page — the densest border source in the app before the sweep.
    'inline-flex min-h-6 items-center gap-1 rounded-badge font-medium tracking-tight no-underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-0.5 text-xs2',
    active
      ? 'bg-foreground text-background'
      : 'bg-surface-container-high text-foreground hover:bg-surface-container-highest',
    className,
  );

  const iconSize = size === 'sm' ? 10 : 12;
  const content = (
    <>
      {icon && <TagIcon size={iconSize} className="opacity-55 shrink-0" />}
      <span className="truncate">{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="text-muted-foreground tabular-nums">{count}</span>
      )}
    </>
  );

  if (linkless) {
    return (
      <span className={base} data-tag-slug={tag}>
        {content}
      </span>
    );
  }

  if (removable) {
    return (
      <button
        type="button"
        onClick={onRemove}
        className={cn(base, 'cursor-pointer')}
        aria-label={`Remove ${label} filter`}
      >
        {content}
        <X size={iconSize} className="opacity-70 shrink-0" />
      </button>
    );
  }

  const link = (
    <LocalizedLink
      to={to ?? tagHref(tag)}
      data-tag-slug={tag}
      onClick={(e) => e.stopPropagation()}
      className={base}
    >
      {content}
    </LocalizedLink>
  );

  if (to || !preview) return link;

  // Glossary preview on hover/focus (link mode only). Radix HoverCard never
  // opens on touch — a tap keeps its existing meaning, navigating to the wiki
  // entry itself, so mobile needs no long-press affordance. The content (and
  // its data fetch) mounts only while the card is open, and it portals to
  // body, so no interactive element nests inside the trigger link.
  return (
    <HoverCard open={previewOpen} onOpenChange={setPreviewOpen} openDelay={350} closeDelay={100}>
      <HoverCardTrigger asChild>{link}</HoverCardTrigger>
      {previewOpen && <TagChipHoverContent slug={tag} />}
    </HoverCard>
  );
}
