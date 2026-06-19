import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface TopicChipProps {
  slug: string;
  label: string;
  /** Filter-selected state (berry fill). */
  active?: boolean;
  /** Followed state (filled star). */
  followed?: boolean;
  /** Toggle the topic as a feed filter. */
  onToggleFilter?: (slug: string) => void;
  /** Toggle following the topic. Omit to hide the star. */
  onToggleFollow?: (slug: string) => void;
  /** "N new" badge (Topics tab). */
  count?: number;
  size?: 'sm' | 'lg';
}

// A followable, filterable topic pill. The body toggles a feed filter; the
// trailing star toggles following (a separate, durable signal that drives the
// For You ranking). Berry accent marks both active and followed states — the
// one permitted brand hue.
export function TopicChip({
  slug,
  label,
  active = false,
  followed = false,
  onToggleFilter,
  onToggleFollow,
  count,
  size = 'sm',
}: TopicChipProps) {
  const { t } = useTranslation();
  const pad = size === 'lg' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-13';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-badge border whitespace-nowrap transition-colors',
        active
          ? 'bg-accent-brand text-accent-brand-foreground border-accent-brand'
          : 'bg-transparent text-foreground border-border hover:bg-muted',
        pad,
      )}
    >
      <button
        type="button"
        onClick={() => onToggleFilter?.(slug)}
        aria-pressed={active}
        className="inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-badge"
      >
        {label}
        {typeof count === 'number' && count > 0 && (
          <span
            className={cn(
              'ml-1 inline-flex items-center justify-center rounded-badge px-1.5 text-2xs font-semibold',
              active ? 'bg-accent-brand-foreground/20' : 'bg-foreground text-background',
            )}
          >
            {count}
          </span>
        )}
      </button>

      {onToggleFollow && (
        <button
          type="button"
          onClick={() => onToggleFollow(slug)}
          aria-pressed={followed}
          aria-label={
            followed
              ? t('pages.news.unfollowTopic', 'Unfollow {{topic}}', { topic: label })
              : t('pages.news.followTopic', 'Follow {{topic}}', { topic: label })
          }
          title={followed ? t('pages.news.followingTopic', 'Following') : t('pages.news.follow', 'Follow')}
          className={cn(
            'inline-flex items-center justify-center rounded-badge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !active && followed && 'text-accent-brand',
          )}
        >
          <Star size={size === 'lg' ? 16 : 13} aria-hidden="true" fill={followed ? 'currentColor' : 'none'} />
        </button>
      )}
    </span>
  );
}
