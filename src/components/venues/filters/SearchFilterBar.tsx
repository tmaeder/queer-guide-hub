import { Input } from '@/components/ui/input';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { Button } from '@/components/ui/button';
import { Search, Filter, Navigation } from '@/components/icons';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2">
      <div className="relative min-w-0 flex-1">
        <Input
          placeholder={t('search.placeholders.venues', 'Search venues…')}
          aria-label={t('search.placeholders.venues', 'Search venues…')}
          value={search}
          onChange={(e) => onSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          className="h-11 rounded-element pe-12"
        />
        <Button
          type="button"
          onClick={onSearch}
          variant="ghost"
          size="icon"
          className="absolute end-0 top-0 size-11 rounded-element"
          aria-label="Search"
        >
          <Search size={16} />
        </Button>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant={nearMe ? 'default' : 'outline'}
          onClick={onNearMeToggle}
          disabled={isDetectingLocation}
          size="icon"
          className="h-11 w-11 rounded-element"
          aria-label="Find near me"
        >
          {isDetectingLocation ? <TrackLoader size={16} /> : <Navigation size={16} />}
        </Button>
        <Button
          variant={showAdvanced ? 'default' : 'outline'}
          onClick={onToggleAdvanced}
          className="h-11 min-w-11 gap-1 rounded-element px-2"
          aria-label="Toggle filters"
          aria-expanded={showAdvanced}
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
