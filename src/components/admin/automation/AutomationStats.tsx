/**
 * AutomationStats — Summary stat cards for the automation dashboard overview.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Clock, CheckCircle2, AlertTriangle, Zap, TrendingUp, Layers } from 'lucide-react';
import type { AutomationStats as Stats } from '@/hooks/useAutomation';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  stats: Stats;
}

const CARDS: Array<{
  key: keyof Stats;
  label: string;
  icon: React.ElementType;
  color: string;
  format?: (v: unknown) => string;
}> = [
  { key: 'pending_changes', label: 'Pending Review', icon: AlertTriangle, color: '#f59e0b' },
  { key: 'auto_approved_24h', label: 'Auto-Approved (24h)', icon: CheckCircle2, color: '#10b981' },
  { key: 'total_proposed_24h', label: 'Total Proposed (24h)', icon: TrendingUp, color: '#6366f1' },
  { key: 'modules_enabled', label: 'Modules Active', icon: Zap, color: '#DB2777' },
  {
    key: 'approval_rate',
    label: 'Auto-Approval Rate',
    icon: Layers,
    color: '#3b82f6',
    format: (v) => `${Math.round((v as number) * 100)}%`,
  },
  {
    key: 'last_run',
    label: 'Last Run',
    icon: Clock,
    color: '#64748b',
    format: (v) => (v ? formatDistanceToNow(new Date(v as string), { addSuffix: true }) : 'Never'),
  },
];

export function AutomationStats({ stats }: Props) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
        gap: 2,
      }}
    >
      {CARDS.map(({ key, label, icon: Icon, color, format }) => (
        <Box
          key={key}
          sx={{
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Icon size={16} style={{ color }} />
            <Typography variant="caption" color="text.secondary" noWrap>
              {label}
            </Typography>
          </Box>
          <Typography variant="h6" fontWeight={700}>
            {format ? format(stats[key]) : String(stats[key] ?? 0)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
