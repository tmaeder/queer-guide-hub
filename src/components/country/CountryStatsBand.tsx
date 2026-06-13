import { useTranslation } from 'react-i18next';
import { WorldBankDataPanel } from './WorldBankDataPanel';
import { SDGDataPanel } from './SDGDataPanel';
import type { KeyFact } from '@/components/entity/editorial';
import { KeyFactsStrip } from '@/components/entity/editorial';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CountryRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PanelData = any;

export interface CountryStatsBandProps {
  country: CountryRow;
  worldBankData: PanelData;
  sdgData: PanelData;
}

/**
 * "Country in numbers" — headline development indicators as a KeyFactsStrip,
 * plus the existing World Bank + SDG panels. Renders nothing when no data
 * exists, so the section is omitted from the nav rather than shown empty.
 */
export function CountryStatsBand({ country, worldBankData, sdgData }: CountryStatsBandProps) {
  const { t } = useTranslation();

  const facts: KeyFact[] = [
    {
      label: t('country.stats.gdpPerCapita', 'GDP / capita'),
      value: country.gdp_per_capita_usd
        ? `$${Number(country.gdp_per_capita_usd).toLocaleString()}`
        : null,
    },
    {
      label: t('country.stats.hdi', 'HDI'),
      value: country.human_development_index != null ? Number(country.human_development_index).toFixed(3) : null,
    },
    {
      label: t('country.stats.lifeExpectancy', 'Life expectancy'),
      value: country.life_expectancy != null ? `${country.life_expectancy} yrs` : null,
    },
    {
      label: t('country.stats.literacy', 'Literacy'),
      value: country.literacy_rate != null ? `${country.literacy_rate}%` : null,
    },
    {
      label: t('country.stats.income', 'Income level'),
      value: country.wb_income_level || null,
    },
  ];

  const hasHeadline = facts.some((f) => f.value != null && f.value !== '');
  if (!hasHeadline && !worldBankData?.hasData && !sdgData?.hasData) return null;

  return (
    <div className="flex flex-col gap-6">
      {hasHeadline && <KeyFactsStrip facts={facts} />}
      {worldBankData?.hasData && <WorldBankDataPanel data={worldBankData} countryName={country.name} />}
      {sdgData?.hasData && <SDGDataPanel data={sdgData} countryName={country.name} />}
    </div>
  );
}

export default CountryStatsBand;
