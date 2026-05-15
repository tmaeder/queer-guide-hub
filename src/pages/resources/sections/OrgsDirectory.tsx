/**
 * OrgsDirectory — Support organisations on /resources. Queries venues by
 * `category` (community_center / organization). Country filter is client-side.
 */

import { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useSupportOrgs } from '@/hooks/useResourceTopic';
import { VenueCard } from '@/components/venues/VenueCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUserCountry, SUPPORTED_COUNTRIES, countryLabel } from '@/hooks/useUserCountry';
import { ChevronRight, Building2 } from 'lucide-react';

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  DE: 'Germany', AT: 'Austria', CH: 'Switzerland', GB: 'United Kingdom',
  IE: 'Ireland', US: 'United States', CA: 'Canada', AU: 'Australia',
  NL: 'Netherlands', FR: 'France', ES: 'Spain', IT: 'Italy',
};

const MAX = 8;

export function OrgsDirectory() {
  const { country, setCountry } = useUserCountry();

  const { data: venues = [], isLoading } = useSupportOrgs();

  const filtered = useMemo(() => {
    if (country === 'INT') return venues.slice(0, MAX);
    const countryName = COUNTRY_CODE_TO_NAME[country];
    if (!countryName) return venues.slice(0, MAX);
    const matches = venues.filter((v) => v.country?.toLowerCase().includes(countryName.toLowerCase()));
    return matches.length > 0 ? matches.slice(0, MAX) : venues.slice(0, MAX);
  }, [venues, country]);

  return (
    <section aria-labelledby="orgs-heading">
      <header className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Building2 aria-hidden style={{ width: 18, height: 18 }} />
          <h2 id="orgs-heading" className="text-base font-semibold">Support organisations</h2>
        </div>
        <div className="ml-auto">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Filter organisations by country">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(SUPPORTED_COUNTRIES).map((c) => (
                <SelectItem key={c} value={c} className="text-xs">
                  {countryLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No support organisations indexed yet. Submit one via the Chrome extension or{' '}
          <LocalizedLink to="/contact" className="underline">get in touch</LocalizedLink>.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filtered.map((v) => (
            <li key={v.id}>
              <VenueCard venue={v} />
            </li>
          ))}
        </ul>
      )}

      <LocalizedLink
        to="/venues?category=community_center"
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium hover:underline"
      >
        Browse all organisations
        <ChevronRight aria-hidden style={{ width: 14, height: 14 }} />
      </LocalizedLink>
    </section>
  );
}
