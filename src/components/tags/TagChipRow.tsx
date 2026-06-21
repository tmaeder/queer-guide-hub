import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TagChip } from './TagChip';

export interface TagChipItem {
  /** Tag slug (value from a `tags[]` column). */
  tag: string;
  name?: string;
  count?: number;
}

export interface TagChipRowProps {
  /** Accepts slug strings or `{tag, name, count}` objects. */
  tags: Array<string | TagChipItem>;
  /** Max chips before overflow. */
  max?: number;
  size?: 'sm' | 'default';
  icon?: boolean;
  /** Render chips as non-interactive spans — required inside card links. */
  linkless?: boolean;
  /**
   * Overflow behavior. `'expand'` reveals the rest inline (detail pages).
   * A string href makes "+N more" link there (cards). Default: inert "+N".
   */
  more?: 'expand' | string;
  className?: string;
}

function normalizeItems(tags: Array<string | TagChipItem>): TagChipItem[] {
  return tags
    .map((t) => (typeof t === 'string' ? { tag: t } : t))
    .filter((t) => t.tag && t.tag.trim().length > 0);
}

/** Renders a wrapped row of {@link TagChip}s with consistent overflow handling. */
export function TagChipRow({
  tags,
  max = 12,
  size = 'default',
  icon = false,
  linkless = false,
  more,
  className,
}: TagChipRowProps) {
  const [expanded, setExpanded] = useState(false);
  const items = normalizeItems(tags);
  if (items.length === 0) return null;

  const showAll = expanded || items.length <= max;
  const visible = showAll ? items : items.slice(0, max);
  const hidden = items.length - visible.length;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {visible.map((item) => (
        <TagChip key={item.tag} {...item} size={size} icon={icon} linkless={linkless} />
      ))}
      {hidden > 0 &&
        (more === 'expand' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setExpanded(true);
            }}
            className={cn(
              'rounded-badge text-muted-foreground hover:text-foreground transition-colors',
              size === 'sm' ? 'text-2xs' : 'text-xs2',
            )}
          >
            +{hidden} more
          </button>
        ) : typeof more === 'string' ? (
          <LocalizedLink
            to={more}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'rounded-badge text-muted-foreground hover:text-foreground no-underline transition-colors',
              size === 'sm' ? 'text-2xs' : 'text-xs2',
            )}
          >
            +{hidden} more
          </LocalizedLink>
        ) : (
          <span
            className={cn(
              'text-muted-foreground',
              size === 'sm' ? 'text-2xs' : 'text-xs2',
            )}
          >
            +{hidden}
          </span>
        ))}
    </div>
  );
}
