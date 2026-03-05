/**
 * ModuleSettingsDialog — Edit automation module threshold, batch, rate settings.
 */

import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Slider from '@mui/material/Slider';
import { Button } from '@/components/ui/button';
import type { AutomationModule } from '@/hooks/useAutomation';

interface Props {
  module: AutomationModule | null;
  open: boolean;
  onClose: () => void;
  onSave: (
    moduleId: string,
    settings: {
      auto_approve_threshold?: number;
      batch_size?: number;
      rate_limit_per_hour?: number;
    },
  ) => void;
}

export function ModuleSettingsDialog({ module, open, onClose, onSave }: Props) {
  const [threshold, setThreshold] = useState(0.9);
  const [batchSize, setBatchSize] = useState(100);
  const [rateLimit, setRateLimit] = useState(10);

  useEffect(() => {
    if (module) {
      setThreshold(module.auto_approve_threshold);
      setBatchSize(module.batch_size);
      setRateLimit(module.rate_limit_per_hour);
    }
  }, [module]);

  if (!module) return null;

  const handleSave = () => {
    onSave(module.id, {
      auto_approve_threshold: threshold,
      batch_size: batchSize,
      rate_limit_per_hour: rateLimit,
    });
    onClose();
  };

  const hasChanges =
    threshold !== module.auto_approve_threshold ||
    batchSize !== module.batch_size ||
    rateLimit !== module.rate_limit_per_hour;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{module.display_name} — Settings</DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          {/* Auto-approve threshold */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Auto-Approve Threshold
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Changes with confidence at or above this threshold are applied automatically. Set
              above 1.0 to require manual approval for all changes.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Slider
                value={threshold}
                onChange={(_, v) => setThreshold(v as number)}
                min={0.5}
                max={1.01}
                step={0.01}
                marks={[
                  { value: 0.5, label: '50%' },
                  { value: 0.75, label: '75%' },
                  { value: 0.9, label: '90%' },
                  { value: 1.0, label: '100%' },
                  { value: 1.01, label: 'Never' },
                ]}
                sx={{ flex: 1 }}
              />
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{ minWidth: 50, textAlign: 'right' }}
              >
                {threshold > 1 ? 'Never' : `${Math.round(threshold * 100)}%`}
              </Typography>
            </Box>
          </Box>

          {/* Batch size */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Batch Size
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Maximum items to process per run.
            </Typography>
            <TextField
              type="number"
              value={batchSize}
              onChange={(e) =>
                setBatchSize(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))
              }
              inputProps={{ min: 1, max: 1000 }}
              size="small"
              fullWidth
            />
          </Box>

          {/* Rate limit */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Rate Limit (per hour)
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Maximum number of runs allowed per hour.
            </Typography>
            <TextField
              type="number"
              value={rateLimit}
              onChange={(e) =>
                setRateLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
              }
              inputProps={{ min: 1, max: 100 }}
              size="small"
              fullWidth
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges}>
          Save Settings
        </Button>
      </DialogActions>
    </Dialog>
  );
}
