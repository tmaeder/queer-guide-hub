/**
 * ModuleCard — Shows module status with enable toggle and run buttons.
 */

import React from 'react';
import { Link as RouterLink } from 'react-router';
import { Play, Settings, CheckCircle2, Clock, AlertTriangle, XCircle, Link2, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  success: 'default',
  partial: 'secondary',
  failed: 'destructive',
};

export function ModuleCard({ module, onToggle, onRun, onSettings, isRunning }: Props) {
  const StatusIcon = STATUS_ICON[module.last_run_status ?? ''] ?? Clock;
  const statusVariant = STATUS_VARIANT[module.last_run_status ?? ''] ?? 'outline';

  return (
    <div
      className={`p-5 rounded-element border bg-background transition-all ${module.is_enabled ? 'border-border opacity-100' : 'border-muted opacity-70'}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold truncate">{module.display_name}</p>
          <p className="text-xs text-muted-foreground block mt-0.5">{module.description}</p>
        </div>
        <Switch
          checked={module.is_enabled}
          onCheckedChange={(checked) => onToggle(module.id, checked)}
        />
      </div>

      {/* Content types */}
      <div className="flex gap-1 flex-wrap mb-3">
        {module.content_types.map((ct) => (
          <Badge key={ct} variant="outline" className="text-[0.7rem] h-[22px]">
            {ct}
          </Badge>
        ))}
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Runs</p>
          <p className="text-sm font-semibold">{module.total_runs}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Proposed</p>
          <p className="text-sm font-semibold">{module.total_changes_proposed}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Applied</p>
          <p className="text-sm font-semibold">{module.total_changes_applied}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Threshold</p>
          <p className="text-sm font-semibold">{Math.round(module.auto_approve_threshold * 100)}%</p>
        </div>
      </div>

      {/* Last run status */}
      <div className="flex items-center gap-2 mb-4">
        <StatusIcon size={14} />
        <p className="text-xs text-muted-foreground">
          {module.last_run_at
            ? `Last run ${formatDistanceToNow(new Date(module.last_run_at), { addSuffix: true })}`
            : 'Never run'}
        </p>
        {module.last_run_status && (
          <Badge variant={statusVariant} className="h-5 text-[0.65rem]">
            {module.last_run_status}
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
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
      </div>

      {/* Contextual links */}
      <div className="flex gap-4 mt-3 flex-wrap">
        {module.slug === 'link-sanitizer' && (
          <RouterLink
            to="/admin/links"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Link2 size={12} />
            Link Health
          </RouterLink>
        )}
        {module.total_changes_proposed > 0 && (
          <RouterLink
            to="/admin/review?tab=automation"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <ClipboardCheck size={12} />
            View pending changes
          </RouterLink>
        )}
      </div>
    </div>
  );
}
