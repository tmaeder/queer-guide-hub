import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { InlineLoading } from '@/components/ui/loading';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import LGBTJurisdictionInfo from '@/components/country/LGBTJurisdictionInfo';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import type { CityRelation, CountryRelation } from './types';

export interface CityRightsTabProps {
  city: CityRelation;
  fullCountry: CountryRelation | null | undefined;
  countryLoading: boolean;
}

export function CityRightsTab({ city, fullCountry, countryLoading }: CityRightsTabProps) {
  return (
    <ScrollReveal direction="up">
    <div className="flex flex-col gap-6 mt-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">LGBTI Rights</h2>
          <p className="text-muted-foreground mt-1">
            Legal protections and rights status in{' '}
            {city.countries ? (
              <LocalizedLink
                to={`/country/${city.countries.slug || city.countries.id}`}
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                {city.countries.name}
              </LocalizedLink>
            ) : (
              'this country'
            )}
          </p>
        </div>
        {city.countries?.equality_score != null && (
          <EqualityScoreBadge score={city.countries.equality_score} size="lg" />
        )}
      </div>

      <div className="p-4 rounded-lg bg-muted">
        <p className="text-sm text-muted-foreground" style={{ fontSize: '0.8125rem' }}>
          The rights information below applies to {city.countries?.name || 'this country'} at the
          national level. Local laws and enforcement in {city.name} may vary.
        </p>
      </div>

      {countryLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <InlineLoading text="Loading rights data..." size="md" />
        </div>
      ) : fullCountry ? (
        <LGBTJurisdictionInfo country={fullCountry} />
      ) : (
        <p className="text-muted-foreground text-center py-8">
          Rights data is not available for this location.
        </p>
      )}
    </div>
    </ScrollReveal>
  );
}
