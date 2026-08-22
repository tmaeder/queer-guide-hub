import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { isAdultTag, getCategoryShortName } from '@/components/resources/categoryMeta';
import type { TagPreview } from '@/hooks/useTagPreviews';

/**
 * A glossary definition preview: category eyebrow, term, 1-2 line definition,
 * link to the full entry. Used inside chip hover cards, "From the glossary"
 * rails and the homepage band.
 *
 * Adult terms never show their definition to an unaffirmed visitor — the
 * name + an 18+ placeholder render instead, and the /tags/:slug age gate does
 * its job on click. Non-adult `is_sensitive` terms keep their definition
 * (parity with the ungated TagDetail render; the safety framing lives on the
 * entry page).
 */
export function TagDefinitionCard({
  preview,
  affirmed,
  compact = false,
  flair,
  className,
}: {
  preview: TagPreview;
  affirmed: boolean;
  compact?: boolean;
  /** Optional leading mark beside the name (e.g. a FlagSwatch on the homepage band). */
  flair?: React.ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const gated = isAdultTag(preview) && !affirmed;
  const definition = preview.short_description || preview.description;

  return (
    <div className={cn('min-w-0', compact ? 'space-y-1' : 'space-y-2', className)}>
      {preview.category && (
        <p className="text-2xs uppercase tracking-wide text-muted-foreground">
          {getCategoryShortName(preview.category)}
        </p>
      )}
      <p className={cn('flex items-center gap-2 font-bold', compact ? 'text-15' : 'text-title')}>
        {flair}
        <span className="truncate">{preview.name}</span>
      </p>
      {gated ? (
        <p className="text-13 text-muted-foreground">
          {t('tags.preview.adultGated', '18+ term. Open the entry to confirm your age.')}
        </p>
      ) : (
        definition && (
          <p
            className={cn(
              'text-13 text-muted-foreground',
              compact ? 'line-clamp-2' : 'line-clamp-3',
            )}
          >
            {definition}
          </p>
        )
      )}
      <LocalizedLink
        to={`/tags/${encodeURIComponent(preview.slug.toLowerCase())}`}
        className="inline-block text-13 font-medium underline underline-offset-4"
      >
        {t('tags.preview.open', 'Read the entry')}
      </LocalizedLink>
    </div>
  );
}
