import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';
import { SDGData } from '@/hooks/useSDGData';

interface SDGDataPanelProps {
  data: SDGData;
  countryName: string;
}

const SDG_GOALS = [
  { number: 1, title: 'No Poverty', color: '#E5243B' },
  { number: 2, title: 'Zero Hunger', color: '#DDA63A' },
  { number: 3, title: 'Good Health', color: '#4C9F38' },
  { number: 4, title: 'Quality Education', color: '#C5192D' },
  { number: 5, title: 'Gender Equality', color: '#FF3A21' },
  { number: 6, title: 'Clean Water', color: '#26BDE2' },
  { number: 7, title: 'Affordable Energy', color: '#FCC30B' },
  { number: 8, title: 'Decent Work', color: '#A21942' },
  { number: 9, title: 'Industry & Innovation', color: '#FD6925' },
  { number: 10, title: 'Reduced Inequality', color: '#DD1367' },
  { number: 11, title: 'Sustainable Cities', color: '#FD9D24' },
  { number: 12, title: 'Responsible Consumption', color: '#BF8B2E' },
  { number: 13, title: 'Climate Action', color: '#3F7E44' },
  { number: 14, title: 'Life Below Water', color: '#0A97D9' },
  { number: 15, title: 'Life on Land', color: '#56C02B' },
  { number: 16, title: 'Peace & Justice', color: '#00689D' },
  { number: 17, title: 'Partnerships', color: '#19486A' },
];

const formatValue = (value: number | null | undefined, unit: string): string => {
  if (value == null) return '—';
  if (unit === 'index') return value.toFixed(2);
  if (unit.includes('per 100,000') || unit.includes('per 1,000')) return value.toFixed(1);
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'tonnes') return `${value.toFixed(1)} t`;
  return value.toFixed(2);
};

export const SDGDataPanel: React.FC<SDGDataPanelProps> = ({ data }) => {
  if (!data.hasData) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Target style={{ height: 20, width: 20 }} />
            UN Sustainable Development Goals
          </div>
          {data.lastSyncedAt && (
            <span className="text-xs text-muted-foreground font-normal">
              Updated {new Date(data.lastSyncedAt).toLocaleDateString()}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {SDG_GOALS.map((goal) => {
            const goalData = data.goals[String(goal.number)];
            const hasValue = goalData?.value != null;

            return (
              <div
                key={goal.number}
                className="flex flex-col gap-1 p-4 bg-muted transition-shadow hover:shadow-sm"
                style={{ borderLeft: `4px solid ${goal.color}` }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-bold uppercase"
                    style={{ letterSpacing: '0.05em', color: goal.color }}
                  >
                    SDG {goal.number}
                  </span>
                  {hasValue && goalData?.year && (
                    <Badge
                      variant="outline"
                      style={{ fontSize: '0.65rem', padding: '1px 6px', lineHeight: 1.2 }}
                    >
                      {goalData.year}
                    </Badge>
                  )}
                </div>

                <p className="text-sm font-semibold leading-tight">{goal.title}</p>

                {hasValue ? (
                  <>
                    <p className="text-xl font-bold mt-1">
                      {formatValue(goalData.value, goalData.unit || '')}
                    </p>
                    <p className="text-xs text-muted-foreground leading-tight">
                      {goalData.description}
                    </p>
                  </>
                ) : (
                  <p className="text-sm mt-1 italic" style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>
                    No data available
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
