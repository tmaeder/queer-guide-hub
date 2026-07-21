import { ShieldCheck } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { InlineLoading } from '@/components/ui/loading';
import LGBTJurisdictionInfo from '@/components/country/LGBTJurisdictionInfo';
import { CountryLegalHistory } from '@/components/country/CountryLegalHistory';
import type { CityRelation, CountryRelation } from './types';

export interface CityRightsTabProps {
  city: CityRelation;
  fullCountry: CountryRelation | null | undefined;
  countryLoading: boolean;
}

export function CityRightsTab({ city, fullCountry, countryLoading }: CityRightsTabProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      {city.safety_notes && (
        <div className="flex gap-4 rounded-container border border-border/60 p-4 sm:p-6">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">
              {t('city.rights.safetyNotesTitle', 'Safety notes for {{name}}', { name: city.name })}
            </h3>
            <p className="mt-1 text-body-lg leading-relaxed text-muted-foreground">
              {city.safety_notes}
            </p>
          </div>
        </div>
      )}

      <p className="text-13 text-muted-foreground">
        {city.countries ? (
          <Trans
            i18nKey="city.rights.nationalDisclaimer"
            defaults="The rights status below applies to <countryLink>{{country}}</countryLink> at the national level. Local laws and enforcement in {{city}} may vary."
            values={{ country: city.countries.name, city: city.name }}
            components={{
              countryLink: (
                <LocalizedLink
                  to={`/country/${city.countries.slug || city.countries.id}`}
                  style={{ color: 'inherit' }}
                  className="underline"
                />
              ),
            }}
          />
        ) : (
          t(
            'city.rights.nationalDisclaimerNoCountry',
            'The rights status below applies to this country at the national level. Local laws and enforcement in {{city}} may vary.',
            { city: city.name },
          )
        )}
      </p>

      {countryLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <InlineLoading text={t('city.rights.loading', 'Loading rights data...')} size="md" />
        </div>
      ) : fullCountry ? (
        <div className="flex flex-col gap-6">
          <LGBTJurisdictionInfo country={fullCountry} />
          <CountryLegalHistory countryId={fullCountry.id} countrySlug={fullCountry.slug} />
        </div>
      ) : (
        <p className="py-8 text-center text-muted-foreground">
          {t('city.rights.noData', 'Rights data is not available for this location.')}
        </p>
      )}
    </div>
  );
}
