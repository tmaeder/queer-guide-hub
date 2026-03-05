/**
 * ModuleCard — Shows module status with enable toggle and run buttons.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import { Play, Settings, CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AutomationModule } from '@/hooks/useAutomation';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  module: AutomationModule;
  onToggle: (moduleId: string, enabled: boolean) => void;
  onRun: (slug: string, dryRun?: boolean) => void;
  onSettings: (module: AutomationModule) => void;
  isRunning: boolean;
}

const STATUS_ICON: Record<string, React.ElementType> = {
  success: CheckCircle2,
  partial: AlertTriangle,
  failed: XCircle,
};

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  success: 'success',
  partial: 'warning',
  failed: 'error',
};

export function ModuleCard({ module, onToggle, onRun, onSettings, isRunning }: Props) {
  const StatusIcon = STATUS_ICON[module.last_run_status ?? ''] ?? Clock;
  const statusColor = STATUS_COLOR[module.last_run_status ?? ''] ?? 'default';

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: module.is_enabled ? 'divider' : 'action.disabledBackground',
        bgcolor: 'background.paper',
        opacity: module.is_enabled ? 1 : 0.7,
        transition: 'all 0.2s',
      }}
    >
      {/* Header */}
      <Box
        sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {module.display_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {module.description}
          </Typography>
        </Box>
        <Switch
          size="small"
          checked={module.is_enabled}
          onChange={(_, checked) => onToggle(module.id, checked)}
        />
      </Box>

      {/* Content types */}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
        {module.content_types.map((ct) => (
          <Chip
            key={ct}
            label={ct}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 22 }}
          />
        ))}
      </Box>

      {/* Stats row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Runs
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {module.total_runs}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Proposed
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {module.total_changes_proposed}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Applied
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {module.total_changes_applied}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Threshold
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {Math.round(module.auto_approve_threshold * 100)}%
          </Typography>
        </Box>
      </Box>

      {/* Last run status */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <StatusIcon size={14} />
        <Typography variant="caption" color="text.secondary">
          {module.last_run_at
            ? `Last run ${formatDistanceToNow(new Date(module.last_run_at), { addSuffix: true })}`
            : 'Never run'}
        </Typography>
        {module.last_run_status && (
          <Chip
            size="small"
            label={module.last_run_status}
            color={statusColor}
            sx={{ height: 20, fontSize: '0.65rem' }}
          />
        )}
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRun(module.slug, true)}
          disabled={!module.is_enabled || isRunning}
        >
          Dry Run
        </Button>
        <Button
          size="sm"
          onClick={() => onRun(module.slug)}
          disabled={!module.is_enabled || isRunning}
        >
          <Play size={14} />
          Run Now
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onSettings(module)}>
          <Settings size={14} />
        </Button>
      </Box>
    </Box>
  );
}
