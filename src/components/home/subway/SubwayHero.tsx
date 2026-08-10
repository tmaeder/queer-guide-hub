import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { IntentMap } from './IntentMap';

/** Subway-map homepage hero: Anton headline, search entry with the hard
 *  shadow, and the network itself — whose stations ARE the six intents
 *  (`IntentMap`, which absorbed the old decorative `TrackLines` drawing and
 *  the separate intent rail). Replaces the old map hero — the live map moved
 *  behind "Open the map" (/map), which also drops the ~1MB maplibre chunk
 *  from the homepage.
 *
 *  The intent map is INSIDE this header, with no rule between them: hero and
 *  network are one canvas, and the tracks emerge from under the headline. */
export function SubwayHero() {
  const { t } = useTranslation();
  return (
    <header className="border-b-4 border-foreground relative overflow-hidden">
      {/* Tighter above `md` than the desktop hero: the intent map is the
          primary navigation on mobile and now sits below the fold, so every
          reclaimed pixel above it counts. */}
      <div className="relative z-1 mx-auto max-w-7xl px-4 pt-8 sm:px-6 md:px-8 md:pt-20">
        <h1 className="font-display text-hero md:text-hero-xl max-w-4xl">
          {t('home.hero.title', 'No straight lines here.')}
        </h1>
        <p className="mt-4 line-clamp-3 max-w-xl text-body-lg sm:line-clamp-none md:mt-6 md:text-xl">
          {t(
            'home.hero.subtitle',
            'The queer world, mapped like a metro: venues, events, people, and history — organized the way the journey actually goes.',
          )}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4 md:mt-8">
          <LocalizedLink
            to="/search"
            className="card-lift flex w-full max-w-xl items-center gap-2 border-[3px] border-foreground bg-background px-4 py-4 no-underline shadow-hard"
            aria-label={t('home.hero.searchLabel', 'Search the whole network')}
          >
            <TransitIcon name="search" size={22} />
            <span className="flex-1 truncate text-15 text-muted-foreground">
              {t('home.hero.searchPlaceholder', 'Try "sober rave berlin" or "trans healthcare"')}
            </span>
            <span className="bg-foreground px-4 py-2 text-13 font-bold text-background">
              {t('home.hero.searchCta', 'Search')}
            </span>
          </LocalizedLink>
          <LocalizedLink
            to="/map"
            className="flex items-center gap-2 border-2 border-foreground px-4 py-4 text-15 font-bold no-underline hover:bg-foreground hover:text-background"
          >
            <TransitIcon name="map" size={20} />
            {t('home.hero.openMap', 'Open the map')}
          </LocalizedLink>
        </div>
      </div>
      <IntentMap />
    </header>
  );
}
