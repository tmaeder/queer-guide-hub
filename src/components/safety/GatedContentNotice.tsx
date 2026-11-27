import { Check, Lock } from '@/components/icons';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useGatedCount } from '@/hooks/useGatedCount';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface GatedContentNoticeProps {
  /** Count gated entities in this city (city detail pages). */
  cityId?: string;
  compact?: boolean;
  /** Count gated entities in this country (country detail pages). */
  countryId?: string;
}

/**
 * Safety layer: some venues, events and organizations are hidden from anonymous
 * visitors. This honest prompt tells a logged-out user that gated content exists
 * here and points them to sign in. It renders nothing for authenticated users or
 * where no gated content exists. The count comes from
 * `gated_count_for_location`, which returns only aggregate counts (no row data),
 * so it is safe to call anonymously.
 *
 * THERE ARE TWO REASONS A ROW IS GATED AND THIS COMPONENT MUST NOT CONFLATE
 * THEM. It used to: the body copy said flatly "this destination has heightened
 * legal risk for LGBTQ+ people", because when it was written the only gate was
 * `location_is_high_risk`. Since 20261112100000 a venue is also gated when
 * `category = 'cruising'`, in EVERY country however safe — publishing a cruising
 * location to anonymous visitors is an outing exposure on its own. Measured on
 * prod after the 2026-10-05 import of 55,934 cruising venues: of the 1,964
 * cities whose page shows this notice, 1,807 are in a country that is NOT high
 * risk, and in all 1,807 every gated venue is a cruising venue. So 92% of the
 * time this component asserted a false legal claim about the country the reader
 * was looking at — on /city/madrid, two paragraphs above that same page's
 * "legal since 1979, married since 2005" panel.
 *
 * The reason now comes from the RPC rather than being inferred here.
 *
 * The non-high-risk copy deliberately does NOT name the category. Naming
 * cruising on a signed-out page advertises it to exactly the audience the gate
 * exists to keep it from — the same reason `AUTH_ONLY_CATEGORIES`
 * (src/components/venues/filters/constants.ts) hides the filter chip rather
 * than offering it and returning nothing.
 */
export function GatedContentNotice({
  cityId,
  countryId,
  compact = false,
}: GatedContentNoticeProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { data, total } = useGatedCount(cityId, countryId);
  if (!total) return null;

  /**
   * Fail SAFE, not falsy. `!== false` rather than a truthiness test or
   * `?? true`, so an absent or non-boolean `high_risk` — an older deployed
   * function, a cached response from before the migration — keeps the legal-risk
   * copy. Understating risk to a reader in a criminalizing country is the
   * dangerous direction; overstating it to a reader in Spain is the bug this
   * fixes, and it is the lesser of the two.
   */
  const highRisk = data?.high_risk !== false;

  const brief = compact && !highRisk;
  const explanation = (
    <>
      <p className="text-15 text-muted-foreground">
        {highRisk
          ? t('safety.gated.body', {
              defaultValue:
                'This destination has heightened legal risk for LGBTQ+ people, so venues, events and organizations are not shown publicly. Sign in to view them.',
            })
          : t('safety.gated.bodySensitive', {
              defaultValue:
                'Some places here are sensitive locations we only show to signed-in members. Sign in to view them.',
            })}
      </p>
      <p className="text-13 text-muted-foreground">
        {t('safety.gated.privacy', {
          defaultValue:
            'An account is free and private: your profile is never shown to other visitors unless you choose, and we never share what you view.',
        })}
      </p>
    </>
  );

  // Back to this page after signing in or up, so the reader lands on what
  // they were promised rather than on the homepage.
  const back = encodeURIComponent(location.pathname + location.search);

  if (!brief) {
    return (
      <section
        aria-labelledby="gated-notice-title"
        className="isolate grid overflow-hidden rounded-container bg-card shadow-soft"
      >
        {/* A glimpse, not data: three blank card silhouettes under a blur. A
            signed-out reader is only ever sent counts, so there is nothing real
            to show here, and nothing here may hint at what the places are. */}
        <div
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 grid grid-cols-1 gap-4 p-6 opacity-60 blur-[3px] sm:grid-cols-3"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={cn('rounded-element bg-surface-container', i > 0 && 'hidden sm:block')}
            >
              <div className="aspect-[16/10] rounded-t-element bg-muted" />
              <div className="space-y-2 p-4">
                <div className="h-3 w-1/3 rounded-badge bg-muted" />
                <div className="h-5 w-2/3 rounded-badge bg-muted" />
                <div className="h-3 w-1/2 rounded-badge bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <div className="z-10 col-start-1 row-start-1 grid place-items-center bg-card/70 p-6 sm:py-10">
          <div className="flex max-w-lg flex-col items-center gap-4 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-foreground text-background">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </span>
            <p id="gated-notice-title" className="font-display text-headline leading-tight">
              {highRisk
                ? t('safety.gated.title', {
                    count: total,
                    defaultValue: '{{count}} places here are only shown to signed-in members',
                  })
                : t('safety.gated.invite', {
                    count: total,
                    defaultValue: '{{count}} more places here, for members',
                  })}
            </p>
            <p className="text-15 text-muted-foreground">
              {highRisk
                ? t('safety.gated.body', {
                    defaultValue:
                      'This destination has heightened legal risk for LGBTQ+ people, so venues, events and organizations are not shown publicly. Sign in to view them.',
                  })
                : t('safety.gated.bodySensitive', {
                    defaultValue:
                      'Some places here are sensitive locations we only show to signed-in members. Sign in to view them.',
                  })}
            </p>
            <ul className="m-0 flex list-none flex-wrap justify-center gap-x-4 gap-y-1 p-0 text-13 font-bold">
              {[
                t('safety.gated.perkFree', 'Free'),
                t('safety.gated.perkPrivate', 'Private profile'),
                t('safety.gated.perkNeverShared', 'What you view is never shared'),
              ].map((perk) => (
                <li key={perk} className="inline-flex items-center gap-1">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {perk}
                </li>
              ))}
            </ul>
            {/* Monochrome on purpose: this is the safety layer. Track colours are
                non-semantic decoration and never appear on a surface a reader
                in a criminalising country is reading for risk information. */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild variant="default">
                <LocalizedLink to={`/auth?mode=signup&redirect=${back}`} className="no-underline">
                  {t('safety.gated.join', { defaultValue: 'Create free account' })}
                </LocalizedLink>
              </Button>
              <Button asChild variant="ghost">
                <LocalizedLink to={`/auth?redirect=${back}`} className="no-underline">
                  {t('safety.gated.signIn', { defaultValue: 'Sign in' })}
                </LocalizedLink>
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-4 rounded-container',
        brief
          ? 'flex-wrap items-center justify-between bg-surface-container p-4'
          : 'flex-col bg-card p-6 sm:flex-row sm:items-center sm:justify-between shadow-soft',
      )}
    >
      <div className={cn('flex items-start gap-4', brief && 'min-w-0 flex-1')}>
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className={brief ? 'text-13 font-medium' : 'text-body-lg font-medium'}>
            {t('safety.gated.title', {
              count: total,
              defaultValue: '{{count}} places here are only shown to signed-in members',
            })}
          </p>
          {brief ? (
            <details>
              <summary className="w-fit cursor-pointer py-1 text-13 font-semibold underline-offset-4 hover:underline">
                {t('common.showMore', 'Show more')}
              </summary>
              <div className="mt-2 space-y-2">{explanation}</div>
            </details>
          ) : (
            explanation
          )}
        </div>
      </div>
      {/* asChild, not a Link wrapping a Button — that nests a <button>
          inside an <a>, which is invalid HTML. */}
      {/* Monochrome on purpose: this is the safety layer. PASTE-UP ink is
          non-semantic decoration and must never appear on a surface a
          user in a criminalising country is reading for risk info. */}
      <Button asChild variant="default">
        <LocalizedLink to="/auth" className="shrink-0 no-underline">
          {t('safety.gated.cta', { defaultValue: 'Sign in to view' })}
        </LocalizedLink>
      </Button>
    </div>
  );
}
