import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ArrowLeftRight, ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CityCountryAutocomplete,
  type GeoSelection,
} from '@/components/trips/create/CityCountryAutocomplete';
import { useCityCompareData, type CityComparison } from '@/hooks/useCityCompareData';

/**
 * Two-picker city comparison. URL ?a=<cityId>&b=<cityId> deep-links so users
 * can share specific comparisons. Each picker is the same
 * CityCountryAutocomplete used by trip creation, so the data shape is shared
 * (GeoSelection.cityId is the authoritative id).
 *
 * The comparison table is intentionally lean — equality score, currency,
 * population, language, timezone, airport. No equality-rights matrix yet
 * (that needs per-right columns on `countries` which don't exist; see
 * CompareRightsSideBySide for the country-level approximation).
 */
export default function CitiesCompare() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const aId = searchParams.get('a');
  const bId = searchParams.get('b');

  const ids = useMemo(() => [aId, bId].filter(Boolean) as string[], [aId, bId]);
  const { data: rows, isLoading } = useCityCompareData(ids);
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);
  const a = aId ? byId.get(aId) ?? null : null;
  const b = bId ? byId.get(bId) ?? null : null;

  const setSide = (side: 'a' | 'b') => (sel: GeoSelection | null) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (sel) p.set(side, sel.cityId);
        else p.delete(side);
        return p;
      },
      { replace: true },
    );
  };

  const aValue = useMemo(() => toGeoSelection(a), [a]);
  const bValue = useMemo(() => toGeoSelection(b), [b]);

  const swap = () => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const [av, bv] = [p.get('a'), p.get('b')];
        if (av) p.set('b', av);
        else p.delete('b');
        if (bv) p.set('a', bv);
        else p.delete('a');
        return p;
      },
      { replace: true },
    );
  };

  return (
    <div className="container mx-auto max-w-screen-lg px-4 py-8 md:py-12">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <LocalizedLink
          to="/travel"
          className="inline-flex items-center gap-1 text-muted-foreground no-underline hover:text-foreground"
        >
          <ChevronLeft size={14} />
          {t('cities.compare.back', 'Travel')}
        </LocalizedLink>
      </nav>

      <h1 className="mb-2 text-headline-lg font-bold tracking-tight">
        {t('cities.compare.title', 'Compare cities')}
      </h1>
      <p className="mb-8 max-w-prose text-body-lg text-muted-foreground">
        {t(
          'cities.compare.lede',
          'Stack two destinations side by side — equality score, climate context, language, currency, airport. Pick the right next trip.',
        )}
      </p>

      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <CityCountryAutocomplete
          id="cities-compare-a"
          label={t('cities.compare.pickA', 'First city')}
          value={aValue}
          onChange={setSide('a')}
        />
        <button
          type="button"
          aria-label={t('cities.compare.swap', 'Swap')}
          onClick={swap}
          className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-element border bg-background text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftRight size={16} />
        </button>
        <CityCountryAutocomplete
          id="cities-compare-b"
          label={t('cities.compare.pickB', 'Second city')}
          value={bValue}
          onChange={setSide('b')}
        />
      </div>

      {isLoading ? (
        <Skeleton variant="rectangular" height={240} className="rounded-container" />
      ) : a && b ? (
        <ComparisonTable a={a} b={b} t={t} />
      ) : (
        <EmptyHint t={t} hasOne={Boolean(a || b)} />
      )}
    </div>
  );
}

function toGeoSelection(c: CityComparison | null): GeoSelection | null {
  if (!c || !c.countries) return null;
  return {
    cityId: c.id,
    cityName: c.name,
    countryId: c.countries.id,
    countryName: c.countries.name ?? '',
    countryCode: c.countries.code ?? null,
    timezone: c.timezone ?? null,
  };
}

function ComparisonTable({
  a,
  b,
  t,
}: {
  a: CityComparison;
  b: CityComparison;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const rows: Array<{ label: string; aValue: React.ReactNode; bValue: React.ReactNode }> = [
    {
      label: t('cities.compare.row.country', 'Country'),
      aValue: countryCell(a),
      bValue: countryCell(b),
    },
    {
      label: t('cities.compare.row.equality', 'Equality score'),
      aValue: a.countries?.equality_score != null ? `${a.countries.equality_score}/10` : '—',
      bValue: b.countries?.equality_score != null ? `${b.countries.equality_score}/10` : '—',
    },
    {
      label: t('cities.compare.row.population', 'Population'),
      aValue: a.population ? a.population.toLocaleString() : '—',
      bValue: b.population ? b.population.toLocaleString() : '—',
    },
    {
      label: t('cities.compare.row.language', 'Language'),
      aValue: a.local_language || '—',
      bValue: b.local_language || '—',
    },
    {
      label: t('cities.compare.row.currency', 'Currency'),
      aValue: a.countries?.currency || '—',
      bValue: b.countries?.currency || '—',
    },
    {
      label: t('cities.compare.row.timezone', 'Timezone'),
      aValue: a.timezone || '—',
      bValue: b.timezone || '—',
    },
    {
      label: t('cities.compare.row.airport', 'Airport'),
      aValue: a.major_airport_code || '—',
      bValue: b.major_airport_code || '—',
    },
  ];

  return (
    <div className="overflow-x-auto rounded-container border">
      <table className="w-full text-13">
        <thead>
          <tr className="border-b">
            <th scope="col" className="px-4 py-4 text-left text-2xs uppercase tracking-[0.14em] text-muted-foreground">
              {t('cities.compare.row.label', 'Attribute')}
            </th>
            <th scope="col" className="px-4 py-4 text-left">
              <CityHeader city={a} />
            </th>
            <th scope="col" className="px-4 py-4 text-left">
              <CityHeader city={b} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-b-0">
              <th
                scope="row"
                className="px-4 py-2 text-left text-13 font-medium text-muted-foreground"
              >
                {row.label}
              </th>
              <td className="px-4 py-2 tabular-nums text-foreground">{row.aValue}</td>
              <td className="px-4 py-2 tabular-nums text-foreground">{row.bValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CityHeader({ city }: { city: CityComparison }) {
  return (
    <LocalizedLink
      to={`/city/${city.slug || city.id}`}
      className="group inline-flex items-center gap-2 text-title font-bold text-foreground no-underline"
    >
      {city.countries?.flag_emoji ? <span aria-hidden>{city.countries.flag_emoji}</span> : null}
      <span className="group-hover:underline">{city.name}</span>
      <ArrowRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
    </LocalizedLink>
  );
}

function countryCell(c: CityComparison): React.ReactNode {
  if (!c.countries) return '—';
  const label = c.countries.name ?? '—';
  if (!c.countries.slug) return label;
  return (
    <LocalizedLink
      to={`/country/${c.countries.slug}`}
      className="text-foreground no-underline hover:underline"
    >
      {label}
    </LocalizedLink>
  );
}

function EmptyHint({
  t,
  hasOne,
}: {
  t: ReturnType<typeof useTranslation>['t'];
  hasOne: boolean;
}) {
  return (
    <div
      className="rounded-container border border-dashed bg-muted/30 p-8 text-center text-muted-foreground"
      aria-live="polite"
    >
      {hasOne
        ? t('cities.compare.hint.one', 'Pick a second city to compare.')
        : t('cities.compare.hint.zero', 'Pick two cities to compare them side by side.')}
    </div>
  );
}
