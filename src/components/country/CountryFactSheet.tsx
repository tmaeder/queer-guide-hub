import { useTranslation } from 'react-i18next';

// Mirrors the page's loose typing for joined country rows (see CountryDetail.parts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountryRow = any;

interface FactRow {
  label: string;
  value: React.ReactNode;
}

/**
 * The country's single fact surface — replaces the FactGrid + PracticalInfo
 * pair, which were the same idea twice (two stacked fact lists, ~410px and
 * ~1,280px on low-completeness rows). One dense two-column `dl`, data-bearing
 * rows only; weather lives here too so the rail StatLine (whose other cells
 * triplicated the census strip) could be deleted.
 *
 * Cell markup keeps the dl>div grouping with dt+dd only — the axe
 * definition-list fix CountryPracticalInfo established.
 */
export function CountryFactSheet({
  country,
  weatherNow,
}: {
  country: CountryRow;
  weatherNow?: number | string | null;
}) {
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

  // `national_day` is free text ("German Unity Day, 3 October"), not a date.
  const nationalDay =
    typeof country.national_day === 'string' && country.national_day.trim()
      ? country.national_day.trim()
      : null;

  const rows: (FactRow | null)[] = [
    country.capital
      ? { label: t('country.facts.capital', 'Capital'), value: country.capital }
      : null,
    country.population
      ? {
          label: t('country.facts.population', 'Population'),
          value: `${(country.population / 1e6).toFixed(1)}M`,
        }
      : null,
    languages.length
      ? {
          label: t('country.practical.languages', 'Languages'),
          value: languages.slice(0, 4).join(', '),
        }
      : null,
    country.currency
      ? { label: t('country.practical.currency', 'Currency'), value: country.currency }
      : null,
    country.calling_code
      ? { label: t('country.practical.callingCode', 'Calling code'), value: country.calling_code }
      : null,
    country.internet_tld
      ? { label: t('country.practical.tld', 'Internet domain'), value: country.internet_tld }
      : null,
    drivingSide ? { label: t('country.practical.driving', 'Driving'), value: drivingSide } : null,
    airports.length
      ? {
          label: t('country.practical.airports', 'Major airports'),
          value: airports.slice(0, 4).join(' · '),
        }
      : null,
    country.government_type
      ? {
          label: t('country.practical.government', 'Government'),
          value: country.government_type,
        }
      : null,
    nationalDay
      ? { label: t('country.practical.nationalDay', 'National day'), value: nationalDay }
      : null,
    weatherNow != null
      ? {
          label: t('country.stats.weather', 'Now in {{city}}', {
            city: country.capital || country.name,
          }),
          value: `${Math.round(Number(weatherNow))}°C`,
        }
      : null,
  ];
  const items = rows.filter(Boolean) as FactRow[];

  if (items.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-container bg-border">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 bg-background p-2.5">
          <dt className="text-2xs uppercase tracking-label text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 break-words text-13 font-semibold text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
