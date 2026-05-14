/**
 * ModuleSettingsDialog — Edit automation module threshold, batch, rate settings.
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{module.display_name} — Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-1 border-y py-4">
          <div>
            <p className="text-sm font-medium mb-1">Auto-Approve Threshold</p>
            <p className="text-xs text-muted-foreground block mb-2">
              Changes with confidence at or above this threshold are applied automatically. Set
              above 1.0 to require manual approval for all changes.
            </p>
            <div className="flex items-center gap-4">
              <Slider
                value={[threshold]}
                onValueChange={(v) => setThreshold(v[0])}
                min={0.5}
                max={1.01}
                step={0.01}
                className="flex-1"
              />
              <p className="text-sm font-bold min-w-[50px] text-right">
                {threshold > 1 ? 'Never' : `${Math.round(threshold * 100)}%`}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Batch Size</p>
            <p className="text-xs text-muted-foreground block mb-2">
              Maximum items to process per run.
            </p>
            <Input
              type="number"
              value={batchSize}
              onChange={(e) =>
                setBatchSize(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))
              }
              min={1}
              max={1000}
            />
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Rate Limit (per hour)</p>
            <p className="text-xs text-muted-foreground block mb-2">
              Maximum number of runs allowed per hour.
            </p>
            <Input
              type="number"
              value={rateLimit}
              onChange={(e) =>
                setRateLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))
              }
              min={1}
              max={100}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
