/**
 * Shared types for the role-adaptive cockpit widget system.
 * Kept separate from the registry (cockpitWidgets.tsx) so widget bodies can
 * import the render-context type without a circular dependency.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AdminRole, EffectiveRole } from '@/config/adminRoles';

/** Bento column span: sm=3, md=4, lg=6, full=12. */
export type WidgetSize = 'sm' | 'md' | 'lg' | 'full';

export const WIDGET_SPAN: Record<WidgetSize, number> = {
  sm: 3,
  md: 4,
  lg: 6,
  full: 12,
};

/** A drill-down panel rendered inside the shared right-side Sheet. */
export interface DrillDownPanel {
  title: string;
  description?: string;
  render: () => ReactNode;
}

/** Passed to every widget body. Widgets fetch their own data via hooks. */
export interface WidgetRenderContext {
  openDrillDown: (panel: DrillDownPanel) => void;
  effectiveRole: EffectiveRole;
}

export interface CockpitWidgetDef {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Minimum role required to see this widget at all. */
  minRole: AdminRole;
  /** Whether the widget is shown by default for a given role (defaults true). */
  defaultVisibleForRole?: Partial<Record<AdminRole, boolean>>;
  /** Per-role default sort position (lower = higher up). Unset → end. */
  defaultOrder?: Partial<Record<AdminRole, number>>;
  size: WidgetSize;
  /** Tags for docs/telemetry; not behavioural. */
  interactivity: Array<'inline' | 'drilldown' | 'live'>;
  /** The widget body. */
  Body: (ctx: WidgetRenderContext) => ReactNode;
}
