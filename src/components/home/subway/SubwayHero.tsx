import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { HeroSearch } from './HeroSearch';
import { IntentMap } from './IntentMap';
import { PageContainer } from '@/components/layout/PageContainer';

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
    <header className="subway-hero border-b border-border-hairline relative overflow-hidden">
      {/* `flush` — the hero owns an asymmetric rhythm: a tall top and no bottom
          padding, because IntentMap fills that space. Tighter above `md` than
          the desktop hero — the intent map is the primary navigation on mobile
          and now sits below the fold, so every reclaimed pixel above it counts. */}
      <PageContainer flush className="relative z-1 pt-10 md:pt-14 lg:pt-16">
        <h1 className="max-w-5xl text-balance font-display text-hero md:text-hero-xl">
          {t('home.hero.title', 'No straight lines here.')}
        </h1>
        <p className="mt-4 max-w-[62ch] text-pretty text-body-lg md:mt-6 md:text-xl">
          {t(
            'home.hero.subtitle',
            'The queer world, mapped like a metro: venues, events, people, and history — organized the way the journey actually goes.',
          )}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4 md:mt-8">
          {/* A real input, not a link dressed as one — see HeroSearch. */}
          <HeroSearch />
          <LocalizedLink
            to="/map"
            className="flex min-h-12 items-center gap-2 px-4 text-15 font-bold no-underline transition-colors hover:bg-foreground hover:text-background"
          >
            <TransitIcon name="map" size={20} />
            {t('home.hero.openMap', 'Open the map')}
          </LocalizedLink>
        </div>
      </PageContainer>
      <IntentMap />
    </header>
  );
}
