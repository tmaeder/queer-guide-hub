/**
 * AutomationStats — Summary stat cards for the automation dashboard overview.
 */

import React from 'react';
import { Clock, CheckCircle2, AlertTriangle, Zap, TrendingUp, Layers } from 'lucide-react';
import type { AutomationStats as Stats } from '@/hooks/useAutomation';
import { formatDistanceToNow } from 'date-fns';

const BRAND_MAIN = '#b60d3d';

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
  { key: 'modules_enabled', label: 'Modules Active', icon: Zap, color: BRAND_MAIN },
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
      {CARDS.map(({ key, label, icon: Icon, color, format }) => (
        <div key={key} className="p-4 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Icon size={16} style={{ color }} />
            <p className="text-xs text-muted-foreground truncate">{label}</p>
          </div>
          <p className="text-base font-bold">
            {format ? format(stats[key]) : String(stats[key] ?? 0)}
          </p>
        </div>
      ))}
    </div>
  );
}
