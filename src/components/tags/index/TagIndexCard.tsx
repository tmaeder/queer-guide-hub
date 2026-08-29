/**
 * TagIndexCard / TagIndexRow — a glossary term in the two dense views.
 *
 * The whole card IS the link, so there is no overlay-sibling problem to solve:
 * nothing interactive sits inside it (that pattern exists for cards carrying
 * favourite buttons and tag chips, which these do not).
 *
 * `card-lift` and NO ink-flood hover — a card lifts or fills, never both.
 *
 * Every card carries a drawn `TagPlate`, never a photograph — see TagPlate's
 * header for why glossary photography was retired. `index` is the plate's
 * window onto the shared line; pass the position in the RENDERED list so a
 * filtered grid still reads as one continuous route.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { TagPlate } from '@/components/tags/TagPlate';
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
  /** Position in the rendered list — the plate's window onto the shared line. */
  index?: number;
}

function AliasPip({ label }: { label: string }) {
  return (
    <span className="inline-block shrink-0 bg-muted rounded-element px-1.5 py-0.5 text-2xs font-bold uppercase tracking-label">
      {label}
    </span>
  );
}

export function TagIndexCard({
  tag,
  uses,
  line,
  categoryLabel,
  aliasMatch,
  index,
}: TagIndexItemProps) {
  const { t } = useTranslation();

  return (
    <LocalizedLink
      to={`/tags/${encodeURIComponent(tag.slug)}`}
      className="card-lift group flex h-full flex-col bg-card text-inherit no-underline rounded-container shadow-soft"
    >
      <div className="w-full border-b border-border-hairline">
        <TagPlate line={line} index={index} />
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
