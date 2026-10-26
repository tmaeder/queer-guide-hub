import { useVocabularyOptions } from '@/hooks/useManagedOptions';
import { useIsMobile } from '@/hooks/use-mobile';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { X } from '@/components/icons';
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

/**
 * Advanced filters — inline on desktop, bottom-sheet on mobile.
 *
 * Only ONE variant is mounted. Both used to render at once, hidden by CSS
 * (`md:hidden` / `hidden md:flex`), and that broke both widths: on desktop the
 * Sheet's overlay covered the page over a zero-size hidden panel, and on mobile
 * the two copies of every dropdown shared one `open` state, so the hidden
 * inline popover opened outside the Sheet's focus trap and was closed again
 * instantly — taking the visible one with it.
 */
export function AdvancedFiltersPanel(props: AdvancedFiltersPanelProps) {
  const { open, onOpenChange } = props;
  const isMobile = useIsMobile();
  if (!isMobile) {
    return (
      <nav aria-label="Venue filters" className="flex flex-col gap-6 pt-6 mt-1">
        <PanelBody {...props} />
      </nav>
    );
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto p-4">
        <SheetHeader>
          <SheetTitle>Refine</SheetTitle>
        </SheetHeader>
        <PanelBody {...props} />
      </SheetContent>
    </Sheet>
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
  const serviceOptions = useVocabularyOptions(
    {
      table: 'venue_services',
      valueColumn: 'slug',
      labelColumn: 'name',
      orderBy: 'sort_order',
      activeColumn: 'is_active',
    },
    commonServices.map((value) => ({ value, label: value })),
    selectedServices,
  );
  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-badge bg-muted px-4 py-2 text-xs2 font-bold uppercase tracking-label text-foreground mb-4">
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
            amenityOptions.length
              ? amenityOptions
              : commonAmenities.map((a) => ({ key: a, label: a }))
          }
          services={serviceOptions.map((o) => ({ key: o.value, label: o.label }))}
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
