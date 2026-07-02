import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { X, ChevronDown } from 'lucide-react';
import { FilterList } from './FilterList';

interface WhatYouNeedProps {
  amenitiesSelected: string[];
  servicesSelected: string[];
  accessibilitySelected: string[];
  amenities: { key: string; label: string }[];
  services: { key: string; label: string }[];
  accessibility: { key: string; label: string }[];
  accessibilityLoading?: boolean;
  /** slug → display name for selected accessibility values. */
  accessibilityLabel?: (v: string) => string;
  onToggleAmenity: (v: string) => void;
  onToggleService: (v: string) => void;
  onToggleAccessibility: (v: string) => void;
}

// Combined "What you need" dropdown: tabs amenities / services / accessibility
// under one trigger to reduce the filter row from 3 dropdowns down to 1.
export function WhatYouNeedDropdown({
  amenitiesSelected,
  servicesSelected,
  accessibilitySelected,
  amenities,
  services,
  accessibility,
  accessibilityLoading,
  accessibilityLabel,
  onToggleAmenity,
  onToggleService,
  onToggleAccessibility,
}: WhatYouNeedProps) {
  const [open, setOpen] = useState(false);
  const total =
    amenitiesSelected.length + servicesSelected.length + accessibilitySelected.length;

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs2 uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
          What you need
          {total > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-foreground text-background text-2xs font-semibold normal-case tracking-normal">
              {total}
            </span>
          )}
        </div>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-11 w-full justify-between rounded-element font-normal"
          >
            <span className="truncate text-sm">
              {total > 0 ? `${total} selected` : 'Amenities · services · accessibility'}
            </span>
            <ChevronDown className="ml-2 shrink-0 w-3.5 h-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="border-border p-0 w-[320px]">
          <Tabs defaultValue="amenities">
            <TabsList className="w-full grid grid-cols-3 rounded-none border-b">
              <TabsTrigger value="amenities">
                Amenities{amenitiesSelected.length > 0 ? ` · ${amenitiesSelected.length}` : ''}
              </TabsTrigger>
              <TabsTrigger value="services">
                Services{servicesSelected.length > 0 ? ` · ${servicesSelected.length}` : ''}
              </TabsTrigger>
              <TabsTrigger value="accessibility">
                A11y{accessibilitySelected.length > 0 ? ` · ${accessibilitySelected.length}` : ''}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="amenities">
              <FilterList
                items={amenities}
                selected={amenitiesSelected}
                onToggle={onToggleAmenity}
                searchPlaceholder="Search amenities…"
                emptyMessage="No amenities found."
              />
            </TabsContent>
            <TabsContent value="services">
              <FilterList
                items={services}
                selected={servicesSelected}
                onToggle={onToggleService}
                searchPlaceholder="Search services…"
                emptyMessage="No services found."
              />
            </TabsContent>
            <TabsContent value="accessibility">
              <FilterList
                items={accessibility}
                selected={accessibilitySelected}
                onToggle={onToggleAccessibility}
                searchPlaceholder="Search accessibility…"
                emptyMessage="No accessibility features found."
                loading={accessibilityLoading}
                byKey
              />
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
      {total > 0 && (
        <div className="flex flex-wrap gap-1">
          {[
            ...amenitiesSelected.map((v) => ({ v, label: v, toggle: onToggleAmenity })),
            ...servicesSelected.map((v) => ({ v, label: v, toggle: onToggleService })),
            ...accessibilitySelected.map((v) => ({
              v,
              label: accessibilityLabel ? accessibilityLabel(v) : v,
              toggle: onToggleAccessibility,
            })),
          ].map(({ v, label, toggle }) => (
            <Badge key={v} variant="secondary">
              {label}
              <X
                className="w-3 h-3 cursor-pointer p-2 -m-2 box-content"
                role="button"
                aria-label="Remove filter"
                onClick={() => toggle(v)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
