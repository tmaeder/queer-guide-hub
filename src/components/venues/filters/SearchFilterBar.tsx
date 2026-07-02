import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Filter, Navigation, Loader2 } from 'lucide-react';

interface SearchFilterBarProps {
  search: string;
  onSearchInput: (value: string) => void;
  onSearch: () => void;
  nearMe: boolean;
  isDetectingLocation: boolean;
  onNearMeToggle: () => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  activeFilterCount: number;
}

/** Search input + near-me toggle + search button + advanced-filters toggle. */
export function SearchFilterBar({
  search,
  onSearchInput,
  onSearch,
  nearMe,
  isDetectingLocation,
  onNearMeToggle,
  showAdvanced,
  onToggleAdvanced,
  activeFilterCount,
}: SearchFilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="relative flex-1">
        <Search
          aria-hidden="true"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
        />
        <Input
          placeholder="Search venues & organizations..."
          value={search}
          onChange={(e) => onSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          className="pl-12 h-11 rounded-element"
        />
      </div>
      <div className="flex gap-2">
        <Button
          variant={nearMe ? 'default' : 'outline'}
          onClick={onNearMeToggle}
          disabled={isDetectingLocation}
          size="icon"
          className="h-11 w-11 rounded-element"
          aria-label="Find near me"
        >
          {isDetectingLocation ? <Loader2 size={16} /> : <Navigation size={16} />}
        </Button>
        <Button onClick={onSearch} size="icon" className="h-11 w-11 rounded-element" aria-label="Search">
          <Search size={16} />
        </Button>
        <Button
          variant={showAdvanced ? 'default' : 'outline'}
          onClick={onToggleAdvanced}
          className="h-11 rounded-element gap-2"
          aria-label="Toggle filters"
        >
          <Filter size={16} />
          {activeFilterCount > 0 && (
            <span
              className={`rounded-full inline-flex items-center justify-center font-semibold min-w-5 h-5 px-1.5 text-xs2 ${
                showAdvanced
                  ? 'bg-primary-foreground text-primary'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
