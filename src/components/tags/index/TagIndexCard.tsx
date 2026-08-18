/**
 * TagIndexCard / TagIndexRow — a glossary term in the two dense views.
 *
 * The whole card IS the link, so there is no overlay-sibling problem to solve:
 * nothing interactive sits inside it (that pattern exists for cards carrying
 * favourite buttons and tag chips, which these do not).
 *
 * `card-lift` and NO ink-flood hover — a card lifts or fills, never both.
 *
 * Two changes from the card this replaces:
 *
 * - The usage count leaves the image overlay for the footer row. It was a
 *   `rgba(0,0,0,0.6)` plate, which the design lint rejects in new code, and it
 *   covered part of the illustration to say something the row below can say.
 * - A term with no real image gets an ink plate carrying its line's icon rather
 *   than a generated gradient. It reads as "no illustration yet" instead of
 *   "here is a picture", and it makes the taxonomy line legible at a glance.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { DEFAULT_CATEGORY_ICON, type CategoryLine } from '@/lib/tags/categoryIdentity';
import { isRealTagImage } from '@/lib/tags/tagsIndexState';
import type { CentralizedTag } from '@/hooks/useCentralizedTags';

export interface TagIndexItemProps {
  tag: CentralizedTag;
  uses: number;
  /** The tag's parent taxonomy line, for the icon plate and the category label. */
  line?: CategoryLine;
  categoryLabel?: string;
  /** The query reached this term through one of its synonyms. */
  aliasMatch?: boolean;
}

function AliasPip({ label }: { label: string }) {
  return (
    <span className="inline-block shrink-0 bg-muted rounded-element px-1.5 py-0.5 text-2xs font-bold uppercase tracking-label">
      {label}
    </span>
  );
}

export function TagIndexCard({ tag, uses, line, categoryLabel, aliasMatch }: TagIndexItemProps) {
  const { t } = useTranslation();
  const hasImage = isRealTagImage(tag.image_url);

  return (
    <LocalizedLink
      to={`/tags/${encodeURIComponent(tag.slug)}`}
      className="card-lift group flex h-full flex-col bg-card text-inherit no-underline rounded-container shadow-soft"
    >
      <div className="relative aspect-[4/3] w-full border-b border-border-hairline bg-muted">
        {hasImage ? (
          <img
            src={tag.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-muted-foreground">
            <TransitIcon name={line?.icon ?? DEFAULT_CATEGORY_ICON} size={40} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-title font-bold leading-tight">{tag.name}</span>
        {categoryLabel && (
          <span className="text-2xs uppercase tracking-label text-muted-foreground">
            {categoryLabel}
          </span>
        )}
        <span className="mt-auto flex items-center gap-2 pt-2 text-13 tabular-nums text-muted-foreground">
          {t('tags.card.uses', '{{count}} uses', { count: uses })}
          {aliasMatch && <AliasPip label={t('tags.alias.badge', 'alias')} />}
        </span>
      </div>
    </LocalizedLink>
  );
}

export function TagIndexRow({ tag, uses, categoryLabel, aliasMatch }: TagIndexItemProps) {
  const { t } = useTranslation();
  const blurb = tag.short_description || tag.description;

  return (
    <LocalizedLink
      to={`/tags/${encodeURIComponent(tag.slug)}`}
      className="card-lift-sm flex items-center gap-4 bg-card p-4 text-inherit no-underline rounded-container shadow-soft"
    >
      <RouteBullet type="tag" size={30} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-title font-bold leading-tight">
          <span className="truncate">{tag.name}</span>
          {aliasMatch && <AliasPip label={t('tags.alias.badge', 'alias')} />}
        </p>
        {blurb && <p className="truncate text-13 text-muted-foreground">{blurb}</p>}
      </div>
      <span className="hidden shrink-0 text-13 tabular-nums text-muted-foreground sm:block">
        {t('tags.card.uses', '{{count}} uses', { count: uses })}
      </span>
      {categoryLabel && (
        <span
          className={cn(
            'hidden shrink-0 bg-muted rounded-element px-2 py-0.5 text-2xs font-bold uppercase tracking-label md:block',
          )}
        >
          {categoryLabel}
        </span>
      )}
    </LocalizedLink>
  );
}
