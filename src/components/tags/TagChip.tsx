import { Tag as TagIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { normalizeTagName } from '@/utils/tagNormalization';

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
  onRemove?: () => void;
  className?: string;
}

/** Slug → display name when no explicit name is provided ("bear-bar" → "Bear Bar"). */
function displayFromSlug(slug: string): string {
  return normalizeTagName(slug.replace(/[-_]+/g, ' '));
}

function tagHref(slug: string): string {
  return `/resources/${encodeURIComponent(slug.toLowerCase())}`;
}

/**
 * The single canonical tag chip used across every content type. Links to the
 * canonical tag page `/resources/:slug`. Monochrome, `rounded-badge`, never the
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
  onRemove,
  className,
}: TagChipProps) {
  const label = name ? normalizeTagName(name) : displayFromSlug(tag);

  const base = cn(
    'inline-flex items-center gap-1 rounded-badge border font-medium tracking-tight no-underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-0.5 text-xs2',
    active
      ? 'border-transparent bg-foreground text-background'
      : 'border-foreground/20 bg-background/60 text-foreground hover:border-foreground/40 hover:bg-muted/60',
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

  return (
    <LocalizedLink
      to={tagHref(tag)}
      data-tag-slug={tag}
      onClick={(e) => e.stopPropagation()}
      className={base}
    >
      {content}
    </LocalizedLink>
  );
}
