import { Search, ArrowDownUp, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Trip } from '@/hooks/useTrips';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type TripStatusFilter = 'all' | Trip['status'] | 'saved';
export type TripSortKey = 'recent' | 'start_date' | 'alphabetical';

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: TripStatusFilter;
  onStatusFilterChange: (value: TripStatusFilter) => void;
  sortKey: TripSortKey;
  onSortChange: (value: TripSortKey) => void;
  counts: Record<TripStatusFilter, number>;
}

const STATUSES: TripStatusFilter[] = [
  'all',
  'planning',
  'active',
  'completed',
  'archived',
  'saved',
];

const SORT_KEYS: TripSortKey[] = ['recent', 'start_date', 'alphabetical'];

export function TripsToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortKey,
  onSortChange,
  counts,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 mb-6">
      {/* Search */}
      <div className="flex items-center gap-2 bg-muted rounded-element px-3 h-10 min-w-full md:min-w-[260px] md:flex-none transition-colors focus-within:bg-accent">
        <Search
          style={{ width: 16, height: 16, opacity: 0.6, flexShrink: 0 }}
          aria-hidden="true"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('trips.toolbar.searchPlaceholder')}
          aria-label={t('trips.toolbar.searchAria')}
          className="flex-1 text-sm bg-transparent border-0 outline-none"
        />
      </div>

      {/* Status filter (scrollable chip row on mobile) */}
      <div className="flex-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div
          className="inline-flex border border-border rounded-element"
          role="group"
          aria-label={t('trips.toolbar.statusAria')}
        >
          {STATUSES.map((status) => {
            const selected = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => onStatusFilterChange(status)}
                aria-label={status}
                aria-pressed={selected}
                className={`normal-case font-semibold text-[0.8125rem] px-3 py-1.5 whitespace-nowrap border-r border-border last:border-r-0 transition-colors ${
                  selected
                    ? 'bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:bg-[hsl(var(--foreground))]/90'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {t(`trips.toolbar.status.${status}`)}
                <span
                  className="ml-1 text-[0.6875rem] opacity-70"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {counts[status] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sort */}
      <div className="flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('trips.toolbar.sortAria')}
              className="h-10 w-10 p-0"
            >
              <ArrowDownUp style={{ width: 16, height: 16 }} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {SORT_KEYS.map((key) => (
              <DropdownMenuItem
                key={key}
                onClick={() => onSortChange(key)}
                className="gap-2"
              >
                <span className="w-4 inline-flex">
                  {key === sortKey && <Check style={{ width: 16, height: 16 }} />}
                </span>
                {t(`trips.toolbar.sort.${key}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
