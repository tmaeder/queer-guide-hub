import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CALENDAR_LAYERS } from './calendarLayers';
import type { CalendarLayerId } from './types';

/** Layer visibility menu (Google-Calendar-style source toggles). */
export function CalendarLayersMenu({
  enabled,
  onToggle,
}: {
  enabled: Set<CalendarLayerId>;
  onToggle: (id: CalendarLayerId) => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {t('hub.calendar.layers.button', { defaultValue: 'Layers' })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          {t('hub.calendar.layers.title', { defaultValue: 'Show on calendar' })}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CALENDAR_LAYERS.map((layer) => {
          const Icon = layer.icon;
          return (
            <DropdownMenuCheckboxItem
              key={layer.id}
              checked={enabled.has(layer.id)}
              onCheckedChange={() => onToggle(layer.id)}
              onSelect={(e) => e.preventDefault()}
            >
              <Icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
              {t(layer.labelKey, { defaultValue: layer.defaultLabel })}
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
