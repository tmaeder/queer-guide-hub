import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  Users,
  Briefcase,
  Globe,
  Heart,
  GraduationCap,
  Leaf,
  Wifi,
  Zap,
  Building2,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { WorldBankData } from '@/hooks/useWorldBankData';

interface WorldBankDataPanelProps {
  data: WorldBankData;
  countryName: string;
}

// Row component for consistent styling
const DataRow = ({
  label,
  value,
  icon: Icon,
  suffix,
}: {
  label: string;
  value: string | number | null | undefined;
  icon?: React.ElementType;
  suffix?: string;
}) => {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="font-bold text-right">
        {value}
        {suffix || ''}
      </span>
    </div>
  );
};

const formatLargeNumber = (num: number): string => {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  return `$${num.toLocaleString()}`;
};

const formatPopulation = (num: number): string => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)} billion`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)} million`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
  return num.toLocaleString();
};

const getIncomeBadgeColor = (level?: string | null): string => {
  if (!level) return '#6b7280';
  if (level.includes('High')) return '#22c55e';
  if (level.includes('Upper middle')) return '#3b82f6';
  if (level.includes('Lower middle')) return '#f59e0b';
  if (level.includes('Low')) return '#ef4444';
  return '#6b7280';
};

export const WorldBankDataPanel = ({ data }) => {
  const { indicators } = data;
  const hasEconomyData =
    data.gdp_usd ||
    data.gdp_per_capita_usd ||
    data.wb_income_level ||
    indicators.gni_per_capita ||
    indicators.inflation_rate ||
    indicators.trade_pct_gdp ||
    indicators.unemployment_rate;
  const hasDemographicsData =
    data.population ||
    data.life_expectancy ||
    indicators.population_growth ||
    indicators.urban_population_pct ||
    indicators.child_mortality_rate;
  const hasSocietyData =
    data.literacy_rate ||
    data.human_development_index ||
    indicators.internet_users_pct ||
    indicators.electricity_access_pct ||
    indicators.gini_index;
  const hasEnvironmentData =
    indicators.co2_emissions_pc ||
    indicators.health_expenditure_pc ||
    indicators.education_expenditure_pct;

  if (!data.hasData) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Income Level Badge */}
      {data.wb_income_level && (
        <div className="flex items-center gap-3 flex-wrap">
          <Badge
            variant="secondary"
            style={{
              fontSize: '0.8rem',
              padding: '4px 12px',
              backgroundColor: getIncomeBadgeColor(data.wb_income_level),
              color: 'white',
            }}
          >
            {data.wb_income_level}
          </Badge>
          {data.wb_region && (
            <Badge variant="outline" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
              {data.wb_region}
            </Badge>
          )}
          {data.wb_last_synced_at && (
            <span className="text-xs text-muted-foreground">
              World Bank data updated {new Date(data.wb_last_synced_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {/* Economy */}
        {hasEconomyData && (
          <Card>
            <CardHeader>
              <CardTitle>
                <TrendingUp style={{ height: 20, width: 20 }} />
                Economy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.gdp_usd && (
                <DataRow icon={DollarSign} label="GDP" value={formatLargeNumber(data.gdp_usd)} />
              )}
              {data.gdp_per_capita_usd && (
                <DataRow
                  icon={DollarSign}
                  label="GDP per Capita"
                  value={`$${data.gdp_per_capita_usd.toLocaleString()}`}
                />
              )}
              {indicators.gni_per_capita && (
                <DataRow
                  icon={DollarSign}
                  label="GNI per Capita"
                  value={`$${Math.round(indicators.gni_per_capita).toLocaleString()}`}
                />
              )}
              {data.wb_income_level && (
                <DataRow icon={BarChart3} label="Income Level" value={data.wb_income_level} />
              )}
              {indicators.unemployment_rate != null && (
                <DataRow
                  icon={Briefcase}
                  label="Unemployment"
                  value={indicators.unemployment_rate.toFixed(1)}
                  suffix="%"
                />
              )}
              {indicators.inflation_rate != null && (
                <DataRow
                  icon={TrendingUp}
                  label="Inflation"
                  value={indicators.inflation_rate.toFixed(1)}
                  suffix="%"
                />
              )}
              {indicators.trade_pct_gdp != null && (
                <DataRow
                  icon={Globe}
                  label="Trade (% of GDP)"
                  value={indicators.trade_pct_gdp.toFixed(1)}
                  suffix="%"
                />
              )}
              {data.currency && (
                <DataRow icon={DollarSign} label="Currency" value={data.currency} />
              )}
            </CardContent>
          </Card>
        )}

        {/* Demographics */}
        {hasDemographicsData && (
          <Card>
            <CardHeader>
              <CardTitle>
                <Users style={{ height: 20, width: 20 }} />
                Demographics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.population && (
                <DataRow
                  icon={Users}
                  label="Population"
                  value={formatPopulation(data.population)}
                />
              )}
              {indicators.population_growth != null && (
                <DataRow
                  icon={TrendingUp}
                  label="Population Growth"
                  value={indicators.population_growth.toFixed(2)}
                  suffix="% / year"
                />
              )}
              {indicators.urban_population_pct != null && (
                <DataRow
                  icon={Building2}
                  label="Urban Population"
                  value={indicators.urban_population_pct.toFixed(1)}
                  suffix="%"
                />
              )}
              {data.life_expectancy && (
                <DataRow
                  icon={Heart}
                  label="Life Expectancy"
                  value={data.life_expectancy}
                  suffix=" years"
                />
              )}
              {indicators.child_mortality_rate != null && (
                <DataRow
                  icon={Heart}
                  label="Under-5 Mortality"
                  value={indicators.child_mortality_rate.toFixed(1)}
                  suffix=" per 1,000"
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Society */}
        {hasSocietyData && (
          <Card>
            <CardHeader>
              <CardTitle>
                <GraduationCap style={{ height: 20, width: 20 }} />
                Society
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.literacy_rate && (
                <DataRow
                  icon={GraduationCap}
                  label="Literacy Rate"
                  value={Number(data.literacy_rate).toFixed(1)}
                  suffix="%"
                />
              )}
              {data.human_development_index && (
                <DataRow
                  icon={BarChart3}
                  label="Human Development Index"
                  value={Number(data.human_development_index).toFixed(3)}
                />
              )}
              {indicators.internet_users_pct != null && (
                <DataRow
                  icon={Wifi}
                  label="Internet Users"
                  value={indicators.internet_users_pct.toFixed(1)}
                  suffix="%"
                />
              )}
              {indicators.electricity_access_pct != null && (
                <DataRow
                  icon={Zap}
                  label="Electricity Access"
                  value={indicators.electricity_access_pct.toFixed(1)}
                  suffix="%"
                />
              )}
              {indicators.gini_index != null && (
                <DataRow
                  icon={BarChart3}
                  label="GINI Index"
                  value={indicators.gini_index.toFixed(1)}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Environment & Health */}
        {hasEnvironmentData && (
          <Card>
            <CardHeader>
              <CardTitle>
                <Leaf style={{ height: 20, width: 20 }} />
                Environment & Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              {indicators.health_expenditure_pc != null && (
                <DataRow
                  icon={Heart}
                  label="Health Expenditure / Capita"
                  value={`$${Math.round(indicators.health_expenditure_pc).toLocaleString()}`}
                />
              )}
              {indicators.education_expenditure_pct != null && (
                <DataRow
                  icon={GraduationCap}
                  label="Education (% of GDP)"
                  value={indicators.education_expenditure_pct.toFixed(1)}
                  suffix="%"
                />
              )}
              {indicators.co2_emissions_pc != null && (
                <DataRow
                  icon={Leaf}
                  label="CO2 Emissions / Capita"
                  value={indicators.co2_emissions_pc.toFixed(1)}
                  suffix=" t"
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
