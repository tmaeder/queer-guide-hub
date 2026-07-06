import { useTranslation } from 'react-i18next';
import { Plane, Car, Phone, Globe, Coins, CalendarDays, Languages, Landmark } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountryRow = any;

interface PracticalItem {
  icon: typeof Plane;
  label: string;
  value: React.ReactNode;
}

export interface CountryPracticalInfoProps {
  country: CountryRow;
}

/**
 * Monochrome practical-travel facts. Renders only the rows that have data —
 * most countries are low-completeness, so silent omission beats empty rows.
 */
export function CountryPracticalInfo({ country }: CountryPracticalInfoProps) {
  const { t } = useTranslation();

  const airports: string[] = Array.isArray(country.major_airports)
    ? country.major_airports
    : Array.isArray(country.airport_codes)
      ? country.airport_codes
      : [];

  const languages: string[] = Array.isArray(country.languages) ? country.languages : [];

  const drivingSide =
    country.driving_side === 'left'
      ? t('country.practical.drivesLeft', 'Left-hand side')
      : country.driving_side === 'right'
        ? t('country.practical.drivesRight', 'Right-hand side')
        : null;

  const nationalDay = country.national_day
    ? new Date(country.national_day as string).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
      })
    : null;

  const items: PracticalItem[] = [
    languages.length
      ? { icon: Languages, label: t('country.practical.languages', 'Languages'), value: languages.slice(0, 4).join(', ') }
      : null,
    country.currency
      ? { icon: Coins, label: t('country.practical.currency', 'Currency'), value: country.currency }
      : null,
    country.calling_code
      ? { icon: Phone, label: t('country.practical.callingCode', 'Calling code'), value: country.calling_code }
      : null,
    country.internet_tld
      ? { icon: Globe, label: t('country.practical.tld', 'Internet domain'), value: country.internet_tld }
      : null,
    drivingSide
      ? { icon: Car, label: t('country.practical.driving', 'Driving'), value: drivingSide }
      : null,
    airports.length
      ? { icon: Plane, label: t('country.practical.airports', 'Major airports'), value: airports.slice(0, 4).join(' · ') }
      : null,
    country.government_type
      ? { icon: Landmark, label: t('country.practical.government', 'Government'), value: country.government_type }
      : null,
    nationalDay
      ? { icon: CalendarDays, label: t('country.practical.nationalDay', 'National day'), value: nationalDay }
      : null,
  ].filter(Boolean) as PracticalItem[];

  if (items.length === 0) return null;

  // Each grid cell is a <div> containing only <dt> + <dd> (valid dl>div
  // grouping); the decorative icon lives inside the <dt> so the <dl> never
  // holds non-term/description children — fixes axe definition-list/dlitem.
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-container border bg-border sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 bg-background p-6">
          <dt className="flex items-center gap-2 text-2xs uppercase tracking-[0.12em] text-muted-foreground">
            <item.icon size={16} className="shrink-0" aria-hidden="true" />
            {item.label}
          </dt>
          <dd className="mt-1 text-15 font-semibold text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default CountryPracticalInfo;
