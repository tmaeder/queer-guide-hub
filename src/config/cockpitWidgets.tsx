/**
 * Cockpit widget registry — the single declarative source of truth for the
 * role-adaptive dashboard. Each widget declares its role floor, per-role default
 * visibility + order, size, and body. `deriveDefaultLayout(role)` turns the
 * registry into an ordered, role-appropriate default layout.
 */

import {
  ClipboardCheck,
  Layers,
  UsersRound,
  Tag,
  ShieldCheck,
  Bot,
  Flag,
  CopyCheck,
  RefreshCw,
  Activity,
  Download,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { roleAtLeast, type AdminRole, type EffectiveRole } from '@/config/adminRoles';
import type { CockpitWidgetDef } from '@/components/admin/cockpit/types';
import {
  TriageInboxBody,
  ContentOverviewBody,
  SubmissionsBody,
  TagSuggestionsBody,
  QualityIndexBody,
} from '@/components/admin/cockpit/widgets/editorWidgets';
import {
  AutomationControlBody,
  ModerationFlagsBody,
  DuplicateClustersBody,
  RefreshDueBody,
  QualityGatesBody,
} from '@/components/admin/cockpit/widgets/opsWidgets';
import {
  SystemHealthBody,
  ImportStatusBody,
  PipelineErrorsBody,
  ReleaseGatesBody,
} from '@/components/admin/cockpit/widgets/systemWidgets';

export const COCKPIT_WIDGETS: CockpitWidgetDef[] = [
  {
    id: 'triageInbox',
    title: 'Triage Inbox',
    icon: ClipboardCheck,
    minRole: 'editor',
    size: 'md',
    interactivity: ['live', 'drilldown'],
    defaultOrder: { editor: 0, moderator: 1, admin: 4 },
    Body: TriageInboxBody,
  },
  {
    id: 'contentOverview',
    title: 'Content Overview',
    icon: Layers,
    minRole: 'editor',
    size: 'full',
    interactivity: ['live', 'drilldown'],
    defaultOrder: { editor: 10, moderator: 12, admin: 20 },
    Body: ContentOverviewBody,
  },
  {
    id: 'submissions',
    title: 'Submissions',
    icon: UsersRound,
    minRole: 'editor',
    size: 'sm',
    interactivity: ['live', 'drilldown'],
    defaultOrder: { editor: 1, moderator: 8, admin: 14 },
    Body: SubmissionsBody,
  },
  {
    id: 'tagSuggestions',
    title: 'Tag Suggestions',
    icon: Tag,
    minRole: 'editor',
    size: 'sm',
    interactivity: ['live', 'drilldown'],
    defaultOrder: { editor: 2, moderator: 9, admin: 15 },
    Body: TagSuggestionsBody,
  },
  {
    id: 'qualityIndex',
    title: 'Quality Index',
    icon: ShieldCheck,
    minRole: 'moderator',
    size: 'md',
    interactivity: ['live', 'drilldown'],
    defaultOrder: { moderator: 3, admin: 6 },
    Body: QualityIndexBody,
  },
  {
    id: 'automation',
    title: 'Automation Control',
    icon: Bot,
    minRole: 'moderator',
    size: 'md',
    interactivity: ['live', 'inline', 'drilldown'],
    defaultOrder: { moderator: 2, admin: 2 },
    Body: AutomationControlBody,
  },
  {
    id: 'moderation',
    title: 'Moderation Flags',
    icon: Flag,
    minRole: 'moderator',
    size: 'sm',
    interactivity: ['live', 'drilldown'],
    defaultOrder: { moderator: 0, admin: 5 },
    Body: ModerationFlagsBody,
  },
  {
    id: 'duplicates',
    title: 'Duplicate Clusters',
    icon: CopyCheck,
    minRole: 'moderator',
    size: 'sm',
    interactivity: ['drilldown'],
    defaultOrder: { moderator: 7, admin: 13 },
    Body: DuplicateClustersBody,
  },
  {
    id: 'qualityGates',
    title: 'Quality Gates',
    icon: ShieldCheck,
    minRole: 'moderator',
    size: 'md',
    interactivity: ['live', 'drilldown'],
    defaultOrder: { moderator: 5, admin: 9 },
    Body: QualityGatesBody,
  },
  {
    id: 'refreshDue',
    title: 'Refresh Due',
    icon: RefreshCw,
    minRole: 'moderator',
    size: 'md',
    interactivity: ['live', 'inline', 'drilldown'],
    defaultOrder: { moderator: 4, admin: 7 },
    Body: RefreshDueBody,
  },
  {
    id: 'systemHealth',
    title: 'System Health',
    icon: Activity,
    minRole: 'admin',
    size: 'sm',
    interactivity: ['live'],
    defaultOrder: { admin: 0 },
    Body: SystemHealthBody,
  },
  {
    id: 'importStatus',
    title: 'Import Status',
    icon: Download,
    minRole: 'admin',
    size: 'sm',
    interactivity: ['live'],
    defaultOrder: { admin: 1 },
    Body: ImportStatusBody,
  },
  {
    id: 'pipelineErrors',
    title: 'Pipeline Errors',
    icon: AlertTriangle,
    minRole: 'admin',
    size: 'md',
    interactivity: ['live', 'drilldown'],
    defaultOrder: { admin: 3 },
    Body: PipelineErrorsBody,
  },
  {
    id: 'releaseGates',
    title: 'Release Gates',
    icon: Lock,
    minRole: 'admin',
    size: 'md',
    interactivity: ['live', 'drilldown'],
    defaultOrder: { admin: 8 },
    Body: ReleaseGatesBody,
  },
];

const WIDGET_INDEX = new Map(COCKPIT_WIDGETS.map((w, i) => [w.id, i]));

export function getWidget(id: string): CockpitWidgetDef | undefined {
  return COCKPIT_WIDGETS.find((w) => w.id === id);
}

/** Widgets the given role is allowed to see at all, in registry order. */
export function eligibleWidgets(role: EffectiveRole): CockpitWidgetDef[] {
  return COCKPIT_WIDGETS.filter((w) => roleAtLeast(role, w.minRole));
}

/**
 * Default ordered list of visible widget ids for a role:
 * eligible → default-visible → sorted by per-role order (then registry index).
 */
export function deriveDefaultLayout(role: EffectiveRole): string[] {
  const r = role === 'none' ? null : (role as AdminRole);
  return eligibleWidgets(role)
    .filter((w) => (r ? w.defaultVisibleForRole?.[r] ?? true : true))
    .sort((a, b) => {
      const ao = (r && a.defaultOrder?.[r]) ?? Number.POSITIVE_INFINITY;
      const bo = (r && b.defaultOrder?.[r]) ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return (WIDGET_INDEX.get(a.id) ?? 0) - (WIDGET_INDEX.get(b.id) ?? 0);
    })
    .map((w) => w.id);
}
