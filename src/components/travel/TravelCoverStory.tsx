import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ExternalImg } from '@/components/ui/ExternalImg';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { getFallbackImage } from '@/utils/fallbackImages';
import { useTravelCoverStory } from '@/hooks/useTravelCoverStory';

/**
 * Editorial cover for the inspiration section — image-led plate with the
 * current editorial headline + pull quote. Self-hides when no cover is live:
 * the rails below are whitelist-backed and never empty, so an invented
 * fallback story would only duplicate them.
 */
export function TravelCoverStory() {
  const { t } = useTranslation();
  const { data: story, isLoading } = useTravelCoverStory();

  if (isLoading || !story) return null;
  const img = isValidImageUrl(story.imageUrl) ? story.imageUrl : null;
  if (!img) return null;

  const body = (
    <article className="group relative overflow-hidden rounded-container bg-surface-container">
      <div className="relative aspect-[16/9] sm:aspect-[21/9]">
        <ExternalImg
          src={img}
          cfWidth={1200}
          fallbackSrc={getFallbackImage('place', story.headline)}
          alt={story.entityName ?? story.headline}
          className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
        />
        <div className="img-scrim-readable absolute inset-0" />
        <div className="absolute bottom-0 start-0 end-0 p-6 text-white sm:p-8">
          <p className="mb-2 text-2xs uppercase tracking-[0.18em] opacity-90">
            {t('pages.travel.cover.kicker', 'Cover story')}
            {story.entityName ? ` · ${story.entityName}` : ''}
          </p>
          <h3 className="font-display text-display font-bold leading-tight">{story.headline}</h3>
          {story.pullQuote && (
            <p className="mt-2 max-w-prose text-body-lg opacity-90">{story.pullQuote}</p>
          )}
          <p className="mt-4 flex items-center gap-2 text-13 font-medium">
            {story.author && <span className="opacity-90">{story.author}</span>}
            {story.href && (
              <span className="inline-flex items-center gap-1.5">
                {t('pages.travel.cover.read', 'Read the guide')}
                <ArrowRight size={14} aria-hidden />
              </span>
            )}
          </p>
        </div>
      </div>
    </article>
  );

  if (!story.href) return <div className="mb-12">{body}</div>;
  return (
    <div className="mb-12">
      <LocalizedLink to={story.href} className="block no-underline" aria-label={story.headline}>
        {body}
      </LocalizedLink>
    </div>
  );
}
