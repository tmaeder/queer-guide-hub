import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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

export const SDGDataPanel: React.FC<SDGDataPanelProps> = ({ data, countryName }) => {
  if (!data.hasData) {
    return null;
  }

  return (
    <Card sx={{ borderColor: 'divider' }}>
      <CardHeader>
        <CardTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Target style={{ height: 20, width: 20 }} />
            UN Sustainable Development Goals
          </Box>
          {data.lastSyncedAt && (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 400 }}>
              Updated {new Date(data.lastSyncedAt).toLocaleDateString()}
            </Typography>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: '1fr 1fr',
              md: 'repeat(3, 1fr)',
            },
          }}
        >
          {SDG_GOALS.map((goal) => {
            const goalData = data.goals[String(goal.number)];
            const hasValue = goalData?.value != null;

            return (
              <Box
                key={goal.number}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                  p: 2,
                  borderRadius: 2,
                  borderLeft: `4px solid ${goal.color}`,
                  bgcolor: 'action.hover',
                  transition: 'box-shadow 0.2s',
                  '&:hover': {
                    boxShadow: 1,
                  },
                }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: goal.color,
                    }}
                  >
                    SDG {goal.number}
                  </Typography>
                  {hasValue && goalData?.year && (
                    <Badge
                      variant="outline"
                      style={{ fontSize: '0.65rem', padding: '1px 6px', lineHeight: 1.2 }}
                    >
                      {goalData.year}
                    </Badge>
                  )}
                </Box>

                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.3 }}>
                  {goal.title}
                </Typography>

                {hasValue ? (
                  <>
                    <Typography
                      sx={{ fontSize: '1.25rem', fontWeight: 700, color: 'text.primary', mt: 0.5 }}
                    >
                      {formatValue(goalData.value, goalData.unit || '')}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.7rem', color: 'text.secondary', lineHeight: 1.3 }}
                    >
                      {goalData.description}
                    </Typography>
                  </>
                ) : (
                  <Typography
                    sx={{
                      fontSize: '0.8rem',
                      color: 'text.disabled',
                      mt: 0.5,
                      fontStyle: 'italic',
                    }}
                  >
                    No data available
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
};
