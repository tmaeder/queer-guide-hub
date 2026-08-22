import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { slugify } from '@/lib/slugify';
import { useAgeAffirmation } from '@/hooks/useAgeAffirmation';
import { useTagPreviews, type TagPreview } from '@/hooks/useTagPreviews';
import { isAdultTag } from '@/components/resources/categoryMeta';
import { TagDefinitionCard } from './TagDefinitionCard';

function richness(p: TagPreview): number {
  return (p.short_description ? 2 : 0) + (p.description ? 1 : 0);
}

/**
 * "From the glossary" rail for entity detail pages: the richest defined terms
 * among the entity's tags, as definition cards. Self-hiding (FeaturedInGuides
 * pattern) — renders nothing when no tag has a glossary definition. Adult
 * terms are dropped entirely for unaffirmed visitors (the chip row still
 * links to them; a gated placeholder card in a rail is noise).
 *
 * News tags can be display names rather than slugs, so the lookup list is the
 * union of the raw values and their slugified forms; misses degrade silently.
 */
export function FromTheGlossary({
  tags,
  max = 3,
  className,
}: {
  tags: string[] | null | undefined;
  max?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const { affirmed } = useAgeAffirmation();
  const lookup = [...new Set((tags ?? []).flatMap((t) => [t, slugify(t)]))];
  const { data: previews = [] } = useTagPreviews(lookup);

  const picks = previews
    .filter((p) => p.short_description || p.description)
    .filter((p) => affirmed || !isAdultTag(p))
    .sort((a, b) => richness(b) - richness(a) || (b.usage_count ?? 0) - (a.usage_count ?? 0))
    .slice(0, max);

  if (picks.length === 0) return null;

  return (
    <section className={cn('my-8', className)} aria-labelledby="from-the-glossary-heading">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2
          id="from-the-glossary-heading"
          className="text-13 uppercase tracking-[0.15em] text-muted-foreground"
        >
          {t('tags.fromGlossary.title', 'From the glossary')}
        </h2>
        <LocalizedLink
          to="/tags"
          className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground underline underline-offset-4"
        >
          {t('tags.fromGlossary.all', 'All terms')}
        </LocalizedLink>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((p) => (
          <TagDefinitionCard key={p.id} preview={p} affirmed={affirmed} compact />
        ))}
      </div>
    </section>
  );
}
