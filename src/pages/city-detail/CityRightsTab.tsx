import { ShieldCheck } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { InlineLoading } from '@/components/ui/loading';
import LGBTJurisdictionInfo from '@/components/country/LGBTJurisdictionInfo';
import type { CityRelation, CountryRelation } from './types';

export interface CityRightsTabProps {
  city: CityRelation;
  fullCountry: CountryRelation | null | undefined;
  countryLoading: boolean;
}

export function CityRightsTab({ city, fullCountry, countryLoading }: CityRightsTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {city.safety_notes && (
        <div className="flex gap-4 rounded-container border border-border/60 p-4 sm:p-6">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Safety notes for {city.name}</h3>
            <p className="mt-1 text-body-lg leading-relaxed text-muted-foreground">
              {city.safety_notes}
            </p>
          </div>
        </div>
      )}

      <p className="text-13 text-muted-foreground">
        The rights status below applies to{' '}
        {city.countries ? (
          <LocalizedLink
            to={`/country/${city.countries.slug || city.countries.id}`}
            style={{ color: 'inherit' }}
            className="underline"
          >
            {city.countries.name}
          </LocalizedLink>
        ) : (
          'this country'
        )}{' '}
        at the national level. Local laws and enforcement in {city.name} may vary.
      </p>

      {countryLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <InlineLoading text="Loading rights data..." size="md" />
        </div>
      ) : fullCountry ? (
        <LGBTJurisdictionInfo country={fullCountry} />
      ) : (
        <p className="py-8 text-center text-muted-foreground">
          Rights data is not available for this location.
        </p>
      )}
    </div>
  );
}
