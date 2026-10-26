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
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { StationPlate } from '@/components/ui/StationPlate';
import { tagPreviewText } from '@/lib/tags/tagsIndexState';
import { DEFAULT_CATEGORY_ICON } from '@/lib/tags/categoryIdentity';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import type { CentralizedTag } from '@/hooks/useCentralizedTags';

export interface TagIndexItemProps {
  tag: CentralizedTag;
  uses: number;
  /**
   * The term's OWN glyph, from `resolveTagGlyph`: its taxonomy STOP where it
   * has one, else its line, else the library fallback. This was the parent
   * `CategoryLine` until 2026-10-10, which could only express eight marks and
   * so drew the identical `consent` glyph on 2,415 Sex & Kink terms.
   */
  icon?: TransitIconName;
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

export function TagIndexCard({ tag, uses, icon, categoryLabel, aliasMatch }: TagIndexItemProps) {
  const { t } = useTranslation();
  const blurb = tagPreviewText(tag);

  return (
    <LocalizedLink
      to={`/tags/${encodeURIComponent(tag.slug)}`}
      className="card-lift group flex h-full flex-col overflow-hidden rounded-container bg-card text-inherit no-underline shadow-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      {/* The marketplace department tile's plate: a stretch of line and one
          station, the term's own glyph inside the disc. */}
      <StationPlate
        icon={icon ?? DEFAULT_CATEGORY_ICON}
        fallbackKey={tag.slug}
        className="block aspect-[16/7] w-full"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        {categoryLabel && (
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {categoryLabel}
          </span>
        )}
        <span className="break-words text-title font-bold leading-tight text-pretty">
          {tag.name}
        </span>
        {blurb && (
          <p className="line-clamp-3 text-13 leading-relaxed text-muted-foreground">{blurb}</p>
        )}
        <span className="mt-auto flex items-center gap-2 pt-2 text-2xs uppercase tracking-wide tabular-nums text-muted-foreground">
          {t('tags.card.uses', '{{count}} uses', { count: uses })}
          {aliasMatch && <AliasPip label={t('tags.alias.badge', 'alias')} />}
        </span>
      </div>
    </LocalizedLink>
  );
}

export function TagIndexRow({ tag, uses, icon, categoryLabel, aliasMatch }: TagIndexItemProps) {
  const { t } = useTranslation();
  const blurb = tagPreviewText(tag);

  return (
    <LocalizedLink
      to={`/tags/${encodeURIComponent(tag.slug)}`}
      className="card-lift-sm flex items-center gap-4 bg-card p-4 text-inherit no-underline rounded-container shadow-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <RouteBullet type="tag" size={30} />
      {/* Paired with the bullet at the row's leading edge, the same way the
          detail masthead pairs them. It used to ride the trailing category
          chip, where a 24px mark sat inside a 10px uppercase pill and made the
          pill lumpy — and where the one thing that says what the TERM is sat
          furthest from the term's name. */}
      {icon && <TransitIcon name={icon} size={30} ticks={false} />}
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
      {/* The term's glyph rides the category chip rather than replacing the
          `RouteBullet`: the pink `#` is the tag mark the whole site promises
          (`ROUTE_BULLET_MAP.tag`), so it stays. The chip used to be `md:block`
          only — the glyph shows at every width, because a phone previously got
          no per-term mark at all. */}
      {categoryLabel && (
        <span className="hidden shrink-0 items-center rounded-element bg-muted px-2 py-0.5 text-2xs font-bold uppercase tracking-label md:inline-flex">
          {categoryLabel}
        </span>
      )}
    </LocalizedLink>
  );
}
