import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe2, Search, ShieldAlert, Timer } from 'lucide-react';
import { queueImpact, queueRisk } from '@/config/adminQueues';
import { readCount, type AdminCounts } from '@/hooks/useAdminCounts';
import type { TriageFilters } from '@/hooks/useUnifiedTriageQueue';
import { buildInboxQueueChips, inboxDefinitions } from './triageQueueFilters';

interface TriageFilterBarProps {
  filters: TriageFilters;
  counts: AdminCounts | undefined;
  onFiltersChange: (f: Partial<TriageFilters>) => void;
}

export function TriageFilterBar({ filters, counts, onFiltersChange }: TriageFilterBarProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const definitions = inboxDefinitions();
  const queueChips = buildInboxQueueChips(counts);

  const scopes = [
    {
      key: 'safety',
      label: 'Safety',
      Icon: ShieldAlert,
      keys: definitions.flatMap((queue) =>
        queueRisk(queue) === 'safety' && queue.queueKey ? [queue.queueKey] : [],
      ),
    },
    {
      key: 'overdue',
      label: 'Overdue',
      Icon: Timer,
      keys: definitions.flatMap((queue) =>
        queue.queueKey && readCount(counts, queue.countKey).overdue > 0 ? [queue.queueKey] : [],
      ),
    },
    {
      key: 'public',
      label: 'Public impact',
      Icon: Globe2,
      keys: definitions.flatMap((queue) =>
        queueImpact(queue) === 'public' && queue.queueKey ? [queue.queueKey] : [],
      ),
    },
  ];

  function toggleQueue(keys: readonly string[]) {
    const current = filters.queueTypes ?? [];
    const allActive = keys.every((k) => current.includes(k));
    const next = allActive
      ? current.filter((k) => !keys.includes(k))
      : [...current, ...keys.filter((k) => !current.includes(k))];
    onFiltersChange({ queueTypes: next.length > 0 ? next : null, page: 1 });
  }

  function handleSearchSubmit() {
    onFiltersChange({ search: searchInput, page: 1 });
  }

  const sameKeys = (keys: readonly string[]) => {
    const current = filters.queueTypes ?? [];
    return current.length === keys.length && keys.every((key) => current.includes(key));
  };

  return (
    <div className="border-b border-border bg-background px-4 py-2">
      <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0">
          <div className="flex shrink-0 gap-1.5" role="group" aria-label="Quick scopes">
            {scopes.map(({ key, label, Icon, keys }) => {
              const active = keys.length > 0 && sameKeys(keys);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={keys.length === 0}
                  aria-pressed={active}
                  onClick={() => onFiltersChange({ queueTypes: active ? null : keys, page: 1 })}
                  className={`inline-flex h-8 min-h-8 items-center gap-1.5 rounded-badge border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          <div
            className="flex min-w-0 flex-nowrap items-center gap-1.5"
            role="group"
            aria-label="Queue types"
          >
            <button
              type="button"
              aria-pressed={filters.queueTypes === null}
              onClick={() => onFiltersChange({ queueTypes: null, page: 1 })}
              className={`inline-flex h-8 min-h-8 shrink-0 items-center rounded-badge border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                filters.queueTypes === null
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              All queues
            </button>
            {queueChips.map((chip) => {
              const active = chip.keys.every((k) => filters.queueTypes?.includes(k) ?? false);
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleQueue(chip.keys)}
                  className={`inline-flex h-8 min-h-8 shrink-0 items-center gap-1.5 rounded-badge border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {chip.label}
                  {chip.count > 0 && (
                    <Badge
                      variant={active ? 'outline' : 'secondary'}
                      className="h-4 min-w-4 border-current px-1 text-2xs font-normal"
                    >
                      {chip.count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex w-full shrink-0 items-center gap-2 xl:w-auto">
          <label htmlFor="triage-search" className="sr-only">
            Search review queue
          </label>
          <div className="relative min-w-0 flex-1 xl:w-52 xl:flex-none">
            <Search
              className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="triage-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearchSubmit();
              }}
              placeholder="Search this queue"
              className="h-10 pl-10 text-xs"
            />
          </div>

          <Select
            value={filters.sort}
            onValueChange={(v) => onFiltersChange({ sort: v as TriageFilters['sort'] })}
          >
            <SelectTrigger className="h-10 w-32 text-xs" aria-label="Sort review queue">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="age">Oldest first</SelectItem>
              <SelectItem value="confidence">Low confidence</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
