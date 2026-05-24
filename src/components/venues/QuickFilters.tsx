import { Clock, MapPin, DollarSign, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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
      <Button
        type="button"
        size="sm"
        variant={value.openNow ? 'default' : 'outline'}
        className="rounded-badge h-8"
        onClick={() => onChange({ ...value, openNow: !value.openNow || undefined })}
      >
        <Clock className="mr-2 h-3.5 w-3.5" />
        {t('venues.quickFilters.openNow', 'Open now')}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={value.radiusKm != null ? 'default' : 'outline'}
            className="rounded-badge h-8"
            disabled={!hasLocation}
          >
            <MapPin className="mr-2 h-3.5 w-3.5" />
            {value.radiusKm
              ? t('venues.quickFilters.radiusKm', { km: value.radiusKm, defaultValue: 'Within {{km}} km' })
              : t('venues.quickFilters.radius', 'Distance')}
          </Button>
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
          <DropdownMenuItem
            onSelect={() => onChange({ ...value, radiusKm: undefined })}
          >
            {t('venues.quickFilters.anyDistance', 'Any distance')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={value.priceLevel != null ? 'default' : 'outline'}
            className="rounded-badge h-8"
          >
            <DollarSign className="mr-2 h-3.5 w-3.5" />
            {value.priceLevel
              ? '$'.repeat(value.priceLevel)
              : t('venues.quickFilters.price', 'Price')}
          </Button>
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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="rounded-badge h-8 text-muted-foreground"
          onClick={() => onChange({})}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          {t('venues.quickFilters.clear', 'Clear')}
        </Button>
      )}
    </div>
  );
}
