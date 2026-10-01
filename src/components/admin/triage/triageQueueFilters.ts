import { ADMIN_QUEUES, type AdminQueueDef } from '@/config/adminQueues';
import type { AdminCounts } from '@/hooks/useAdminCounts';

export interface QueueChip {
  key: string;
  keys: string[];
  label: string;
  count: number;
}

export const inboxDefinitions = (): AdminQueueDef[] =>
  ADMIN_QUEUES.filter(
    (queue): queue is AdminQueueDef & { queueKey: string } =>
      Boolean(queue.queueKey) && queue.route.startsWith('/admin/governance?mode=triage'),
  );

/** Derive the filter vocabulary from the same registry as cockpit navigation. */
export function buildInboxQueueChips(counts: AdminCounts | undefined): QueueChip[] {
  const definitions = inboxDefinitions();
  const quality = definitions.filter((queue) => queue.queueKey?.startsWith('quality-'));
  const chips: QueueChip[] = [];
  let qualityAdded = false;

  for (const queue of definitions) {
    if (queue.queueKey?.startsWith('quality-')) {
      if (qualityAdded) continue;
      qualityAdded = true;
      chips.push({
        key: 'quality',
        keys: quality.flatMap((item) => (item.queueKey ? [item.queueKey] : [])),
        label: 'Quality',
        count: quality.reduce((sum, item) => sum + (counts?.[item.countKey] ?? 0), 0),
      });
      continue;
    }
    if (!queue.queueKey) continue;
    chips.push({
      key: queue.queueKey,
      keys: [queue.queueKey],
      label: queue.label,
      count: counts?.[queue.countKey] ?? 0,
    });
  }
  return chips;
}
