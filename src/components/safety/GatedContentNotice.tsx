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
}

interface GatedContentNoticeProps {
  /** Count gated entities in this city (city detail pages). */
  cityId?: string;
  /** Count gated entities in this country (country detail pages). */
  countryId?: string;
}

/**
 * Safety layer: in high-risk (criminalizing / death-penalty) countries, venues,
 * events and organizations are hidden from anonymous visitors. This honest
 * prompt tells a logged-out user that gated content exists here and points them
 * to sign in. It renders nothing for authenticated users or where no gated
 * content exists. The count comes from `gated_count_for_location`, which returns
 * only aggregate counts (no row data), so it is safe to call anonymously.
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

  return (
    <div className="flex flex-col gap-4 rounded-container border border-border bg-muted p-6 sm:flex-row sm:items-center sm:justify-between">
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
            {t('safety.gated.body', {
              defaultValue:
                'This destination has heightened legal risk for LGBTQ+ people, so venues, events and organizations are not shown publicly. Sign in to view them.',
            })}
          </p>
        </div>
      </div>
      <LocalizedLink to="/auth" className="shrink-0">
        <Button variant="accent">{t('safety.gated.cta', { defaultValue: 'Sign in to view' })}</Button>
      </LocalizedLink>
    </div>
  );
}
