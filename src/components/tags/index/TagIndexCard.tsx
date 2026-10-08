/**
 * TagIndexCard / TagIndexRow — a glossary term in the two dense views.
 *
 * The whole card IS the link, so there is no overlay-sibling problem to solve:
 * nothing interactive sits inside it (that pattern exists for cards carrying
 * favourite buttons and tag chips, which these do not).
 *
 * `card-lift` and NO ink-flood hover — a card lifts or fills, never both.
 *
 * Compact taxonomy glyphs leave room for the definition. The glossary's
 * text is the useful preview; abstract terms do not need stock photography.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { cleanTitle } from '@/utils/htmlDecode';
import type { CategoryLine } from '@/lib/tags/categoryIdentity';
import type { CentralizedTag } from '@/hooks/useCentralizedTags';

export interface TagIndexItemProps {
  tag: CentralizedTag;
  uses: number;
  /** The tag's parent taxonomy line, for the plate glyph and the category label. */
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
  const blurb = cleanTitle(tag.short_description || tag.description || '');

  return (
    <LocalizedLink
      to={`/tags/${encodeURIComponent(tag.slug)}`}
      className="card-lift group flex h-full min-h-56 flex-col gap-4 rounded-container bg-card p-4 text-inherit no-underline shadow-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-element bg-muted">
          <TransitIcon name={line?.icon ?? 'library'} size={22} />
        </span>
        {categoryLabel && (
          <span className="text-right text-2xs font-medium text-muted-foreground">
            {categoryLabel}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <span className="break-words text-title font-bold leading-tight text-pretty">
          {tag.name}
        </span>
        {blurb && (
          <p className="line-clamp-3 text-13 leading-relaxed text-muted-foreground">{blurb}</p>
        )}
        <span className="mt-auto flex items-center gap-2 pt-4 text-2xs tabular-nums text-muted-foreground">
          {t('tags.card.uses', '{{count}} uses', { count: uses })}
          {aliasMatch && <AliasPip label={t('tags.alias.badge', 'alias')} />}
        </span>
      </div>
    </LocalizedLink>
  );
}

export function TagIndexRow({ tag, uses, categoryLabel, aliasMatch }: TagIndexItemProps) {
  const { t } = useTranslation();
  const blurb = cleanTitle(tag.short_description || tag.description || '');

  return (
    <LocalizedLink
      to={`/tags/${encodeURIComponent(tag.slug)}`}
      className="card-lift-sm flex items-center gap-4 bg-card p-4 text-inherit no-underline rounded-container shadow-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <RouteBullet type="tag" size={30} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-title font-bold leading-tight">
          <span className="break-words">{tag.name}</span>
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
