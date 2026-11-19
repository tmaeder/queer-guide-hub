import { Clock, MapPin, DollarSign, X } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/transit/FilterChip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface QuickFiltersValue {
  openNow?: boolean;
  radiusKm?: number;
  priceLevel?: number;
}

interface QuickFiltersProps {
  value: QuickFiltersValue;
  onChange: (v: QuickFiltersValue) => void;
  hasLocation: boolean;
}

const RADIUS_OPTIONS = [1, 5, 10, 30, 100];
const PRICE_OPTIONS = [1, 2, 3, 4];

export function QuickFilters({ value, onChange, hasLocation }: QuickFiltersProps) {
  const { t } = useTranslation();
  const active = !!value.openNow || value.radiusKm != null || value.priceLevel != null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip
        active={!!value.openNow}
        className={value.openNow ? undefined : 'bg-card'}
        onClick={() => onChange({ ...value, openNow: !value.openNow || undefined })}
        label={
          <>
            <Clock size={16} aria-hidden />
            {t('venues.quickFilters.openNow', 'Open now')}
          </>
        }
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterChip
            active={value.radiusKm != null}
            aria-pressed={undefined}
            disabled={!hasLocation}
            className={cn('disabled:opacity-50', value.radiusKm == null && 'bg-card')}
            label={
              <>
                <MapPin size={16} aria-hidden />
                {value.radiusKm
                  ? t('venues.quickFilters.radiusKm', {
                      km: value.radiusKm,
                      defaultValue: 'Within {{km}} km',
                    })
                  : t('venues.quickFilters.radius', 'Distance')}
              </>
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {RADIUS_OPTIONS.map((km) => (
            <DropdownMenuItem
              key={km}
              onSelect={() => onChange({ ...value, radiusKm: km })}
              className={cn(value.radiusKm === km && 'font-semibold')}
            >
              {t('venues.quickFilters.radiusKm', { km, defaultValue: 'Within {{km}} km' })}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => onChange({ ...value, radiusKm: undefined })}>
            {t('venues.quickFilters.anyDistance', 'Any distance')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterChip
            active={value.priceLevel != null}
            aria-pressed={undefined}
            className={value.priceLevel == null ? 'bg-card' : undefined}
            label={
              <>
                <DollarSign size={16} aria-hidden />
                {value.priceLevel
                  ? '$'.repeat(value.priceLevel)
                  : t('venues.quickFilters.price', 'Price')}
              </>
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {PRICE_OPTIONS.map((p) => (
            <DropdownMenuItem
              key={p}
              onSelect={() => onChange({ ...value, priceLevel: p })}
              className={cn(value.priceLevel === p && 'font-semibold')}
            >
              {'$'.repeat(p)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => onChange({ ...value, priceLevel: undefined })}>
            {t('venues.quickFilters.anyPrice', 'Any price')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {active && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="inline-flex min-h-11 items-center gap-1.5 px-2 text-13 font-bold text-muted-foreground hover:text-foreground"
        >
          <X size={16} aria-hidden />
          {t('venues.quickFilters.clear', 'Clear')}
        </button>
      )}
    </div>
  );
}
