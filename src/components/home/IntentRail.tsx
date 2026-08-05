import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { INTENT_NAV } from '@/config/navigation';

/**
 * The five intents, on the homepage, directly under the map hero.
 *
 * Rendered EAGERLY and with no reveal animation — deliberately not wrapped in
 * `HomeDeferred`. Every other homepage section sits behind two independent
 * gates (`DeferredSection`'s IntersectionObserver and `FadeIn`'s `whileInView`,
 * which fires at 15% visibility and ignores `prefers-reduced-motion`). If
 * either fails to fire, the section stays at `opacity: 0` while still occupying
 * its full height. That is a tolerable failure for a marketplace rail and an
 * unacceptable one for the site's primary navigation — a blank band where the
 * nav should be is indistinguishable from a broken page.
 *
 * It is also above the fold, so there is nothing to defer.
 */
export function IntentRail() {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="intent-rail-heading"
      className="px-4 sm:px-6 md:px-8 py-12 md:py-16"
    >
      <div className="max-w-7xl mx-auto">
        <h2
          id="intent-rail-heading"
          className="font-display text-headline mb-8"
        >
          {t('header.intents.sheetHeading', 'What are you here for?')}
        </h2>
        <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {INTENT_NAV.map((intent) => {
            const Icon = intent.icon;
            return (
              <li key={intent.to}>
                <LocalizedLink
                  to={intent.to}
                  className="flex h-full flex-col gap-2 border-2 border-foreground p-6 no-underline rounded-container hover:bg-muted"
                >
                  <Icon size={24} className="text-foreground" aria-hidden />
                  <span className="font-display text-title text-foreground">
                    {t(intent.labelKey, intent.fallback)}
                  </span>
                  <span className="text-13 text-muted-foreground">
                    {t(intent.subtitleKey, intent.subtitleFallback)}
                  </span>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default IntentRail;
