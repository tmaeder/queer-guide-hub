import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { X } from 'lucide-react';
import { FilterDropdown } from './FilterDropdown';
import { WhatYouNeedDropdown } from './WhatYouNeedDropdown';
import { commonAmenities, commonServices, type FilterOption } from './constants';

export interface AdvancedFiltersPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  city: string;
  onCityChange: (value: string) => void;
  onSearch: () => void;
  // tags
  tagsOpen: boolean;
  onTagsOpenChange: (open: boolean) => void;
  selectedTags: string[];
  tagsLoading: boolean;
  tagItems: FilterOption[];
  onToggleTag: (v: string) => void;
  // what you need
  selectedAmenities: string[];
  selectedServices: string[];
  selectedAccessibilityAttributes: string[];
  amenityOptions: FilterOption[];
  accessibilityOptions: FilterOption[];
  vocabLoading: boolean;
  accessibilityLabel: (slug: string) => string;
  onToggleAmenity: (v: string) => void;
  onToggleService: (v: string) => void;
  onToggleAccessibility: (v: string) => void;
  // target groups
  targetGroupsOpen: boolean;
  onTargetGroupsOpenChange: (open: boolean) => void;
  selectedTargetGroups: string[];
  targetGroupsLoading: boolean;
  targetGroupItems: FilterOption[];
  onToggleTargetGroup: (v: string) => void;
  // clear
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

/** Advanced filters — inline on desktop, bottom-sheet on mobile. */
export function AdvancedFiltersPanel(props: AdvancedFiltersPanelProps) {
  const { open, onOpenChange } = props;
  return (
    <>
      {/* Mobile: bottom sheet */}
      <Sheet open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
        <SheetContent side="bottom" className="md:hidden max-h-[85dvh] overflow-y-auto p-4">
          <SheetHeader>
            <SheetTitle>Refine</SheetTitle>
          </SheetHeader>
          <PanelBody {...props} />
        </SheetContent>
      </Sheet>

      {/* Desktop: inline */}
      <nav
        aria-label="Venue filters"
        className="hidden md:flex flex-col gap-6 pt-6 mt-1 border-t border-border"
      >
        <PanelBody {...props} />
      </nav>
    </>
  );
}

function PanelBody({
  city,
  onCityChange,
  onSearch,
  tagsOpen,
  onTagsOpenChange,
  selectedTags,
  tagsLoading,
  tagItems,
  onToggleTag,
  selectedAmenities,
  selectedServices,
  selectedAccessibilityAttributes,
  amenityOptions,
  accessibilityOptions,
  vocabLoading,
  accessibilityLabel,
  onToggleAmenity,
  onToggleService,
  onToggleAccessibility,
  targetGroupsOpen,
  onTargetGroupsOpenChange,
  selectedTargetGroups,
  targetGroupsLoading,
  targetGroupItems,
  onToggleTargetGroup,
  hasActiveFilters,
  onClearFilters,
}: AdvancedFiltersPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-4 py-1 text-xs2 font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
          Refine
        </span>
      </div>

      {/* City input */}
      <div className="max-w-[400px] flex flex-col gap-1.5">
        <Label htmlFor="city" className="text-xs2 uppercase tracking-wider text-muted-foreground">
          City
        </Label>
        <Input
          id="city"
          placeholder="Enter city..."
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          className="h-11 rounded-element"
        />
      </div>

      {/* Filter dropdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Tags */}
        <FilterDropdown
          label="Tags"
          open={tagsOpen}
          onOpenChange={onTagsOpenChange}
          selected={selectedTags}
          loading={tagsLoading}
          items={tagItems}
          onToggle={onToggleTag}
          placeholder="Select tags..."
          searchPlaceholder="Search tags..."
          emptyMessage="No tags found."
        />

        {/* What you need — consolidated amenities + services + accessibility */}
        <WhatYouNeedDropdown
          amenitiesSelected={selectedAmenities}
          servicesSelected={selectedServices}
          accessibilitySelected={selectedAccessibilityAttributes}
          amenities={
            amenityOptions.length ? amenityOptions : commonAmenities.map((a) => ({ key: a, label: a }))
          }
          services={commonServices.map((s) => ({ key: s, label: s }))}
          accessibility={accessibilityOptions}
          accessibilityLoading={vocabLoading}
          accessibilityLabel={accessibilityLabel}
          onToggleAmenity={onToggleAmenity}
          onToggleService={onToggleService}
          onToggleAccessibility={onToggleAccessibility}
        />

        {/* Target Groups */}
        <FilterDropdown
          label="Target Groups"
          open={targetGroupsOpen}
          onOpenChange={onTargetGroupsOpenChange}
          selected={selectedTargetGroups}
          loading={targetGroupsLoading}
          items={targetGroupItems}
          onToggle={onToggleTargetGroup}
          placeholder="Select target groups..."
          searchPlaceholder="Search target groups..."
          emptyMessage="No target groups found."
        />
      </div>

      {/* Clear button */}
      {hasActiveFilters && (
        <div className="flex gap-4">
          <Button variant="outline" onClick={onClearFilters} size="sm">
            <X size={14} />
            Clear All
          </Button>
        </div>
      )}
    </div>
  );
}
