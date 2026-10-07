import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

interface GatedCount {
  venues: number;
  events: number;
  organizations: number;
  /**
   * Whether the LOCATION is criminalizing / death-penalty. A different question
   * from whether anything here is gated, and the one this component used to
   * answer by guessing — see `highRisk` below. Optional because this bundle can
   * be running against a database where 99991791364430 has not applied yet.
   */
  high_risk?: boolean;
}

interface GatedContentNoticeProps {
  /** Count gated entities in this city (city detail pages). */
  cityId?: string;
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
export function GatedContentNotice({ cityId, countryId }: GatedContentNoticeProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['gated-content-count', cityId ?? null, countryId ?? null],
    queryFn: async (): Promise<GatedCount> => {
      const { data, error } = await untypedRpc<GatedCount>('gated_count_for_location', {
        p_country_id: countryId ?? null,
        p_city_id: cityId ?? null,
      });
      if (error) throw error;
      return data ?? { venues: 0, events: 0, organizations: 0 };
    },
    enabled: !user && (!!cityId || !!countryId),
    staleTime: 5 * 60 * 1000,
  });

  if (user) return null;
  const total = (data?.venues ?? 0) + (data?.events ?? 0) + (data?.organizations ?? 0);
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

  return (
    <div className="flex flex-col gap-4 bg-card p-6 sm:flex-row sm:items-center sm:justify-between rounded-container shadow-soft">
      <div className="flex items-start gap-4">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-body-lg font-medium">
            {t('safety.gated.title', {
              count: total,
              defaultValue: '{{count}} places here are only shown to signed-in members',
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
          <p className="text-13 text-muted-foreground">
            {t('safety.gated.privacy', {
              defaultValue:
                'An account is free and private: your profile is never shown to other visitors unless you choose, and we never share what you view.',
            })}
          </p>
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
