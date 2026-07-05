import { type ReactNode } from 'react';
import { SaveDefaultPrompt } from '@/components/preferences/SaveDefaultPrompt';
import { useVenueFilters } from './filters/useVenueFilters';
import { SearchFilterBar } from './filters/SearchFilterBar';
import { CategoryChips } from './filters/CategoryChips';
import { ActiveFilterBadges } from './filters/ActiveFilterBadges';
import { AdvancedFiltersPanel } from './filters/AdvancedFiltersPanel';
import type { VenueFilterValues } from './filters/constants';

interface VenueFiltersProps {
  /** Seed initial search input. Used for URL hydration on mount. */
  initialSearch?: string;
  /** Seed initial category chip selection. */
  initialCategory?: string;
  initialCity?: string;
  initialTags?: string[];
  initialAmenities?: string[];
  initialServices?: string[];
  initialAccessibilityAttributes?: string[];
  initialTargetGroups?: string[];
  /** Traveling preference chips rendered by the host page (Venues). */
  preferenceChips?: ReactNode;
  onFiltersChange: (filters: VenueFilterValues) => void;
}

export function VenueFilters({
  initialSearch = '',
  initialCategory = '',
  initialCity = '',
  initialTags,
  initialAmenities,
  initialServices,
  initialAccessibilityAttributes,
  initialTargetGroups,
  preferenceChips,
  onFiltersChange,
}: VenueFiltersProps) {
  const f = useVenueFilters({
    initialSearch,
    initialCategory,
    initialCity,
    initialTags,
    initialAmenities,
    initialServices,
    initialAccessibilityAttributes,
    initialTargetGroups,
    onFiltersChange,
  });

  return (
    <div className="flex flex-col gap-4 w-full min-w-0 overflow-hidden p-4 rounded-container border border-border bg-card/60">
      {/* Search Row */}
      <SearchFilterBar
        search={f.search}
        onSearchInput={f.handleSearchInput}
        onSearch={f.handleSearch}
        nearMe={f.nearMe}
        isDetectingLocation={f.isDetectingLocation}
        onNearMeToggle={f.handleNearMeToggle}
        showAdvanced={f.showAdvanced}
        onToggleAdvanced={() => f.setShowAdvanced(!f.showAdvanced)}
        activeFilterCount={f.activeFilterCount}
      />

      {/* Category Chips */}
      <CategoryChips category={f.category} onCategoryClick={f.handleCategoryClick} />

      {/* Traveling preference chips (host-provided) + first-use save prompt */}
      {preferenceChips}
      {f.showAccessibilityPrompt && (
        <SaveDefaultPrompt
          message="Save these as your accessibility needs? They'll apply everywhere. Only you see this."
          onSave={f.onSaveAccessibilityDefault}
          onDismiss={f.dismissAccessibilityPrompt}
        />
      )}

      {/* Active Filter Chips — always visible when any filter is on */}
      {f.hasActiveFilters && (
        <ActiveFilterBadges
          search={f.search}
          city={f.city}
          selectedTags={f.selectedTags}
          selectedAmenities={f.selectedAmenities}
          selectedServices={f.selectedServices}
          selectedAccessibilityAttributes={f.selectedAccessibilityAttributes}
          selectedTargetGroups={f.selectedTargetGroups}
          nearMe={f.nearMe}
          accessibilityLabel={f.accessibilityLabel}
          onRemoveSearch={f.removeSearch}
          onRemoveCity={f.removeCity}
          onToggleTag={f.handleTagToggle}
          onToggleAmenity={f.handleAmenityToggle}
          onToggleService={f.handleServiceToggle}
          onToggleAccessibility={f.handleAccessibilityToggle}
          onToggleTargetGroup={f.handleTargetGroupToggle}
          onNearMeToggle={f.handleNearMeToggle}
          onClearAll={f.clearFilters}
        />
      )}

      {/* Advanced Filters Panel — inline on desktop, bottom-sheet on mobile */}
      {f.showAdvanced && (
        <AdvancedFiltersPanel
          open={f.showAdvanced}
          onOpenChange={f.setShowAdvanced}
          city={f.city}
          onCityChange={f.setCity}
          onSearch={f.handleSearch}
          tagsOpen={f.tagsOpen}
          onTagsOpenChange={f.setTagsOpen}
          selectedTags={f.selectedTags}
          tagsLoading={f.tagsLoading}
          tagItems={f.unifiedTags.map((t) => ({ key: t.id, label: t.name }))}
          onToggleTag={f.handleTagToggle}
          selectedAmenities={f.selectedAmenities}
          selectedServices={f.selectedServices}
          selectedAccessibilityAttributes={f.selectedAccessibilityAttributes}
          amenityOptions={f.amenityOptions}
          accessibilityOptions={f.accessibilityOptions}
          vocabLoading={f.vocabLoading}
          accessibilityLabel={f.accessibilityLabel}
          onToggleAmenity={f.handleAmenityToggle}
          onToggleService={f.handleServiceToggle}
          onToggleAccessibility={f.handleAccessibilityToggle}
          targetGroupsOpen={f.targetGroupsOpen}
          onTargetGroupsOpenChange={f.setTargetGroupsOpen}
          selectedTargetGroups={f.selectedTargetGroups}
          targetGroupsLoading={f.targetGroupsLoading}
          targetGroupItems={f.targetGroups.map((g) => ({ key: g.id, label: g.name, color: g.color }))}
          onToggleTargetGroup={f.handleTargetGroupToggle}
          hasActiveFilters={f.hasActiveFilters}
          onClearFilters={f.clearFilters}
        />
      )}
    </div>
  );
}
