import { useTranslation } from 'react-i18next';
import { Band } from './Band';
import { HomeSectionError } from './HomeSectionError';
import { Skeleton } from '@/components/ui/skeleton';
import { TagDefinitionCard } from '@/components/tags/TagDefinitionCard';
import { FlagSwatch } from '@/components/tags/FlagSwatch';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { flagByTagSlug } from '@/lib/flags';
import { pickOfTheDay, useHomeGlossaryPool } from '@/hooks/useTagPreviews';

/**
 * Homepage glossary band — a rotating set of defined terms from the wiki.
 * Self-hiding on an empty pool. No load motion (homepage joy is
 * interaction-earned only); the band's single accent is the pink tag line,
 * carried by the `#` RouteBullet, never a colour literal.
 */
export default function GlossaryBand() {
  const { t } = useTranslation();
  const { data: pool = [], isLoading, isError, isFetching, refetch } = useHomeGlossaryPool();

  const picks = pickOfTheDay(pool, new Date(), 4);

  const bandProps = {
    eyebrow: t('home.glossary.eyebrow', 'Glossary'),
    title: (
      <span className="flex items-center gap-4">
        <RouteBullet type="tag" />
        {t('home.glossary.title', 'Know the words')}
      </span>
    ),
    seeAllHref: '/tags',
    seeAllLabel: t('home.glossary.seeAll', 'All terms'),
  };

  if (isLoading) {
    return (
      <Band {...bandProps}>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-48 w-full rounded-container" />
          ))}
        </div>
      </Band>
    );
  }

  if (isError) {
    return (
      <Band {...bandProps}>
        <HomeSectionError retrying={isFetching} onRetry={() => void refetch()} />
      </Band>
    );
  }

  if (picks.length === 0) {
    return (
      <Band {...bandProps}>
        <p className="py-8 text-15 text-muted-foreground">
          {t('home.glossary.empty', 'No glossary terms are available right now.')}
        </p>
      </Band>
    );
  }

  return (
    <Band {...bandProps}>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {picks.map((p) => {
          const flag = flagByTagSlug.get(p.slug);
          return (
            <TagDefinitionCard
              key={p.id}
              preview={p}
              // The pool is non-adult by construction; affirmation is moot.
              affirmed={false}
              flair={
                flag ? (
                  <FlagSwatch flag={flag} decorative className="h-5 w-8 shrink-0" />
                ) : undefined
              }
            />
          );
        })}
      </div>
    </Band>
  );
}
