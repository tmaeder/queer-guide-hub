import { useState, useEffect, useCallback, useRef } from 'react';
import { useUnifiedTags } from '@/hooks/useUnifiedTags';
import { useAmenityVocabulary } from '@/hooks/useAmenityVocabulary';
import { useTargetGroups } from '@/hooks/useTargetGroups';
import {
  usePreferenceChips,
  useDefaultPromptGate,
  saveTravelPreference,
} from '@/hooks/usePreferenceChips';
import type { VenueFilterValues } from './constants';

export interface UseVenueFiltersParams {
  initialSearch?: string;
  initialCategory?: string;
  initialCity?: string;
  initialTags?: string[];
  initialAmenities?: string[];
  initialServices?: string[];
  initialAccessibilityAttributes?: string[];
  initialTargetGroups?: string[];
  onFiltersChange: (filters: VenueFilterValues) => void;
}

/**
 * Owns the entire venue-filter state machine: facet selections, URL-prop sync,
 * debounced auto-apply, geolocation/near-me detection, and derived counts.
 * Extracted verbatim from VenueFilters.tsx — behavior-preserving.
 */
export function useVenueFilters({
  initialSearch = '',
  initialCategory = '',
  initialCity = '',
  initialTags,
  initialAmenities,
  initialServices,
  initialAccessibilityAttributes,
  initialTargetGroups,
  onFiltersChange,
}: UseVenueFiltersParams) {
  const [search, setSearch] = useState(initialSearch);
  const [city, setCity] = useState(initialCity);
  const [category, setCategory] = useState(initialCategory);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags ?? []);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(initialAmenities ?? []);
  const [selectedServices, setSelectedServices] = useState<string[]>(initialServices ?? []);
  const [selectedAccessibilityAttributes, setSelectedAccessibilityAttributes] = useState<string[]>(
    initialAccessibilityAttributes ?? [],
  );
  const [selectedTargetGroups, setSelectedTargetGroups] = useState<string[]>(
    initialTargetGroups ?? [],
  );
  const [tagsOpen, setTagsOpen] = useState(false);
  const [targetGroupsOpen, setTargetGroupsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  const { tags: unifiedTags, loading: tagsLoading, fetchTags } = useUnifiedTags();
  const { vocab: amenityVocab, loading: vocabLoading } = useAmenityVocabulary();
  const amenityOptions = Array.from(amenityVocab?.values() ?? [])
    .filter((a) => a.kind === 'amenity')
    .map((a) => ({ key: a.slug, label: a.name }));
  // Accessibility options come from the controlled vocabulary (kind=
  // 'accessibility'), keyed by SLUG — venues.accessibility_attributes stores
  // vocab slugs, so the legacy accessibility_attributes-table IDs/names never
  // matched the column. Selections (and the URL param) are slugs.
  const accessibilityOptions = Array.from(amenityVocab?.values() ?? [])
    .filter((a) => a.kind === 'accessibility')
    .map((a) => ({ key: a.slug, label: a.name }));
  const accessibilityLabel = (slug: string) =>
    accessibilityOptions.find((o) => o.key === slug)?.label ?? slug.replace(/[-_]/g, ' ');
  const { targetGroups, loading: targetGroupsLoading } = useTargetGroups();

  // "Save as my accessibility needs" — first-use affordance, max one
  // save-default prompt per session across all surfaces.
  const { chips: savedAccessibilityChips, loading: prefsLoading, signedIn } =
    usePreferenceChips(['accessibility']);
  const { show: showAccessibilityPrompt, dismiss: dismissAccessibilityPrompt } =
    useDefaultPromptGate(
      signedIn &&
        !prefsLoading &&
        savedAccessibilityChips.length === 0 &&
        selectedAccessibilityAttributes.length > 0,
    );

  useEffect(() => {
    fetchTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync array filters when URL-driven props change (e.g. back/forward
  // navigation). Compares joined keys so we don't fight user typing.
  const initialTagsKey = (initialTags ?? []).join(',');
  const initialAmenitiesKey = (initialAmenities ?? []).join(',');
  const initialServicesKey = (initialServices ?? []).join(',');
  const initialAccessibilityKey = (initialAccessibilityAttributes ?? []).join(',');
  const initialTargetGroupsKey = (initialTargetGroups ?? []).join(',');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSelectedTags(initialTags ?? []);
  }, [initialTagsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSelectedAmenities(initialAmenities ?? []);
  }, [initialAmenitiesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSelectedServices(initialServices ?? []);
  }, [initialServicesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSelectedAccessibilityAttributes(initialAccessibilityAttributes ?? []);
  }, [initialAccessibilityKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setSelectedTargetGroups(initialTargetGroups ?? []);
  }, [initialTargetGroupsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setCity(initialCity);
  }, [initialCity]);

  // Build current filters object
  const buildFilters = useCallback(
    (
      overrides?: Partial<{
        search: string;
        city: string;
        category: string;
        tags: string[];
        amenities: string[];
        services: string[];
        accessibilityAttributes: string[];
        targetGroups: string[];
        nearMe: boolean;
        userLocation: { latitude: number; longitude: number } | null;
      }>,
    ): VenueFilterValues => {
      const s = overrides?.search ?? search;
      const c = overrides?.city ?? city;
      const cat = overrides?.category ?? category;
      const t = overrides?.tags ?? selectedTags;
      const a = overrides?.amenities ?? selectedAmenities;
      const sv = overrides?.services ?? selectedServices;
      const acc = overrides?.accessibilityAttributes ?? selectedAccessibilityAttributes;
      const tg = overrides?.targetGroups ?? selectedTargetGroups;
      const nm = overrides?.nearMe ?? nearMe;
      const ul = overrides?.userLocation !== undefined ? overrides.userLocation : userLocation;

      return {
        search: s || undefined,
        city: c || undefined,
        category: cat === 'all' ? undefined : cat || undefined,
        tags: t.length > 0 ? t : undefined,
        amenities: a.length > 0 ? a : undefined,
        services: sv.length > 0 ? sv : undefined,
        accessibilityAttributes: acc.length > 0 ? acc : undefined,
        targetGroups: tg.length > 0 ? tg : undefined,
        userLocation: ul || undefined,
        nearMe: nm || undefined,
      };
    },
    [
      search,
      city,
      category,
      selectedTags,
      selectedAmenities,
      selectedServices,
      selectedAccessibilityAttributes,
      selectedTargetGroups,
      nearMe,
      userLocation,
    ],
  );

  // Auto-apply debounce for advanced filter changes
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const autoApply = useCallback(
    (overrides?: Parameters<typeof buildFilters>[0]) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange(buildFilters(overrides));
      }, 300);
    },
    [buildFilters, onFiltersChange],
  );

  // Debounced search-as-you-type (250ms after last keystroke).
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = useCallback(() => {
    clearTimeout(debounceRef.current);
    clearTimeout(searchDebounceRef.current);
    onFiltersChange(buildFilters());
  }, [buildFilters, onFiltersChange]);

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearch(value);
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        onFiltersChange(buildFilters({ search: value }));
      }, 250);
    },
    [buildFilters, onFiltersChange],
  );

  const handleCategoryClick = useCallback(
    (cat: string) => {
      const newCat = category === cat ? '' : cat;
      setCategory(newCat);
      clearTimeout(debounceRef.current);
      onFiltersChange(buildFilters({ category: newCat }));
    },
    [category, buildFilters, onFiltersChange],
  );

  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) return;
    setIsDetectingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        });
      });
      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });
      setNearMe(true);
      onFiltersChange(buildFilters({ userLocation: { latitude, longitude }, nearMe: true }));
    } catch {
      setNearMe(false);
      setUserLocation(null);
    } finally {
      setIsDetectingLocation(false);
    }
  }, [buildFilters, onFiltersChange]);

  const handleNearMeToggle = useCallback(() => {
    if (nearMe) {
      setNearMe(false);
      setUserLocation(null);
      onFiltersChange(buildFilters({ nearMe: false, userLocation: null }));
    } else {
      detectLocation();
    }
  }, [nearMe, detectLocation, buildFilters, onFiltersChange]);

  const handleTagToggle = useCallback(
    (tag: string) => {
      const newTags = selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag];
      setSelectedTags(newTags);
      autoApply({ tags: newTags });
    },
    [selectedTags, autoApply],
  );

  const handleAmenityToggle = useCallback(
    (amenity: string) => {
      const next = selectedAmenities.includes(amenity)
        ? selectedAmenities.filter((a) => a !== amenity)
        : [...selectedAmenities, amenity];
      setSelectedAmenities(next);
      autoApply({ amenities: next });
    },
    [selectedAmenities, autoApply],
  );

  const handleServiceToggle = useCallback(
    (service: string) => {
      const next = selectedServices.includes(service)
        ? selectedServices.filter((s) => s !== service)
        : [...selectedServices, service];
      setSelectedServices(next);
      autoApply({ services: next });
    },
    [selectedServices, autoApply],
  );

  const handleAccessibilityToggle = useCallback(
    (attr: string) => {
      const next = selectedAccessibilityAttributes.includes(attr)
        ? selectedAccessibilityAttributes.filter((a) => a !== attr)
        : [...selectedAccessibilityAttributes, attr];
      setSelectedAccessibilityAttributes(next);
      autoApply({ accessibilityAttributes: next });
    },
    [selectedAccessibilityAttributes, autoApply],
  );

  const handleTargetGroupToggle = useCallback(
    (group: string) => {
      const next = selectedTargetGroups.includes(group)
        ? selectedTargetGroups.filter((g) => g !== group)
        : [...selectedTargetGroups, group];
      setSelectedTargetGroups(next);
      autoApply({ targetGroups: next });
    },
    [selectedTargetGroups, autoApply],
  );

  const removeSearch = useCallback(() => {
    setSearch('');
    autoApply({ search: '' });
  }, [autoApply]);

  const removeCity = useCallback(() => {
    setCity('');
    autoApply({ city: '' });
  }, [autoApply]);

  const clearFilters = useCallback(() => {
    setSearch('');
    setCity('');
    setCategory('');
    setSelectedTags([]);
    setSelectedAmenities([]);
    setSelectedServices([]);
    setSelectedAccessibilityAttributes([]);
    setSelectedTargetGroups([]);
    setNearMe(false);
    setUserLocation(null);
    clearTimeout(debounceRef.current);
    onFiltersChange({});
  }, [onFiltersChange]);

  const onSaveAccessibilityDefault = useCallback(
    () => saveTravelPreference({ accessibility_needs: selectedAccessibilityAttributes }),
    [selectedAccessibilityAttributes],
  );

  const hasActiveFilters = !!(
    search ||
    city ||
    (category && category !== 'all') ||
    selectedTags.length > 0 ||
    selectedAmenities.length > 0 ||
    selectedServices.length > 0 ||
    selectedAccessibilityAttributes.length > 0 ||
    selectedTargetGroups.length > 0 ||
    nearMe
  );

  const activeFilterCount = [
    search,
    city,
    category && category !== 'all' ? category : '',
    ...selectedTags,
    ...selectedAmenities,
    ...selectedServices,
    ...selectedAccessibilityAttributes,
    ...selectedTargetGroups,
    nearMe ? 'nearMe' : '',
  ].filter(Boolean).length;

  return {
    // state
    search,
    city,
    setCity,
    category,
    selectedTags,
    selectedAmenities,
    selectedServices,
    selectedAccessibilityAttributes,
    selectedTargetGroups,
    tagsOpen,
    setTagsOpen,
    targetGroupsOpen,
    setTargetGroupsOpen,
    showAdvanced,
    setShowAdvanced,
    isDetectingLocation,
    nearMe,
    // data
    unifiedTags,
    tagsLoading,
    amenityOptions,
    accessibilityOptions,
    accessibilityLabel,
    vocabLoading,
    targetGroups,
    targetGroupsLoading,
    // save-default prompt
    showAccessibilityPrompt,
    dismissAccessibilityPrompt,
    onSaveAccessibilityDefault,
    // handlers
    handleSearch,
    handleSearchInput,
    handleCategoryClick,
    handleNearMeToggle,
    handleTagToggle,
    handleAmenityToggle,
    handleServiceToggle,
    handleAccessibilityToggle,
    handleTargetGroupToggle,
    removeSearch,
    removeCity,
    clearFilters,
    // derived
    hasActiveFilters,
    activeFilterCount,
  };
}
