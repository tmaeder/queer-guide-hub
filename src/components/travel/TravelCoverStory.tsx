import { useTranslation } from 'react-i18next';
import { ArrowRight } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { ImageCredit } from '@/components/ui/ImageCredit';
import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { hasCityNetwork } from '@/components/home/subway/cityNetworkGeometry';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { useTravelCoverStory } from '@/hooks/useTravelCoverStory';
import { useGoNowDestinations } from '@/hooks/useGoNowDestinations';

/** Lead with the published cover, or use a real destination from the seasonal rail. */
export function TravelCoverStory() {
  const { t } = useTranslation();
  const { data: story, isLoading } = useTravelCoverStory();
  const { data: destinations } = useGoNowDestinations(6);

  if (isLoading) return null;

  const published = story?.href ? story : null;
  const destination = published
    ? undefined
    : (destinations?.find((item) => isValidImageUrl(item.imageUrl) || hasCityNetwork(item.slug)) ??
      destinations?.[0]);
  const href =
    published?.href || (destination && `/city/${destination.slug || destination.cityId}`);
  if (!href) return null;

  const image = published?.imageUrl ?? destination?.imageUrl;
  const title = published?.headline ?? destination?.name;
  const context = published?.entityName ?? destination?.countryName;
  const credit = destination?.imageMetadata as
    | { attribution?: string; photographer?: string; license?: string }
    | undefined;
  const network =
    destination && hasCityNetwork(destination.slug) ? (
      <div className="h-full bg-muted px-8 py-4" aria-hidden="true">
        <CityNetwork slug={destination.slug} variant="thumb" className="h-full" />
      </div>
    ) : null;
  const detail =
    published?.pullQuote ??
    (destination?.reason.kind === 'trending'
      ? destination.editorialHook || t('pages.travel.goNow.trending', 'Trending now')
      : destination?.reason.label);

  return (
    <LocalizedLink
      to={href}
      className="group block min-w-0 overflow-hidden rounded-panel bg-card no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {isValidImageUrl(image) ? (
        <Image
          src={image}
          alt=""
          aspect="hero"
          rounded="none"
          priority
          sizes="(min-width: 1024px) 52vw, 92vw"
          fallbackArtwork={network}
        >
          <ImageCredit
            attribution={credit?.attribution || credit?.photographer}
            license={credit?.license}
            className="absolute bottom-2 start-2 hidden rounded-badge bg-card px-2 py-1 group-has-[img]:block"
          />
        </Image>
      ) : network ? (
        <div className="aspect-[21/9]">{network}</div>
      ) : null}
      <div className="flex items-center gap-4 px-4 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          {context && <p className="text-13 text-muted-foreground">{context}</p>}
          <h2 className="break-words font-display text-headline leading-tight group-hover:underline rtl:font-sans rtl:font-bold">
            {title}
          </h2>
          {detail && <p className="mt-2 line-clamp-2 text-15 text-muted-foreground">{detail}</p>}
          {published?.author && (
            <p className="mt-2 text-13 text-muted-foreground">{published.author}</p>
          )}
        </div>
        <ArrowRight size={20} aria-hidden className="shrink-0 rtl:rotate-180" />
      </div>
    </LocalizedLink>
  );
}
