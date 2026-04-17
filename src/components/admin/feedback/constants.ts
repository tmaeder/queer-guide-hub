import { Zap, AlertCircle, ArrowUpCircle, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const kanbanColumns = [
  { id: 'new', label: 'New', color: '#f59e0b' },
  { id: 'under_review', label: 'Under Review', color: '#3b82f6' },
  { id: 'planned', label: 'Planned', color: '#8b5cf6' },
  { id: 'in_progress', label: 'In Progress', color: '#f97316' },
  { id: 'done', label: 'Done', color: '#22c55e' },
] as const;

export type KanbanStatus = (typeof kanbanColumns)[number]['id'];

export const kanbanStatusSet = new Set<string>(kanbanColumns.map((c) => c.id));

export interface PriorityMeta {
  value: 0 | 1 | 2 | 3;
  short: 'P0' | 'P1' | 'P2' | 'P3';
  label: string;
  color: string;
  icon: LucideIcon;
}

export const priorities: PriorityMeta[] = [
  { value: 0, short: 'P0', label: 'Critical', color: '#dc2626', icon: Zap },
  { value: 1, short: 'P1', label: 'High', color: '#f97316', icon: AlertCircle },
  { value: 2, short: 'P2', label: 'Normal', color: '#6b7280', icon: Minus },
  { value: 3, short: 'P3', label: 'Low', color: '#9ca3af', icon: ArrowUpCircle },
];

export const priorityMap: Record<number, PriorityMeta> = Object.fromEntries(
  priorities.map((p) => [p.value, p]),
);

export function priorityFor(v: number | null | undefined): PriorityMeta {
  return priorityMap[v ?? 2] ?? priorityMap[2];
}

// Story-level kanban columns. Story is a tag, not a cascade — its status
// tracks the admin's progress on the root-cause fix independently of the
// individual submission statuses.
export const storyColumns = [
  { id: 'open', label: 'Open', color: '#f59e0b' },
  { id: 'planned', label: 'Planned', color: '#8b5cf6' },
  { id: 'in_progress', label: 'In Progress', color: '#f97316' },
  { id: 'resolved', label: 'Resolved', color: '#22c55e' },
] as const;

export type StoryKanbanStatus = (typeof storyColumns)[number]['id'];

export const storyStatusSet = new Set<string>(storyColumns.map((c) => c.id));
