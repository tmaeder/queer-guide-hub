import { useKnowledgeBase, KnowledgeItem } from './useKnowledgeBase';

export function useUnifiedCategories() {
  const { items, loading, error, getItemsByCategory, incrementUsage } = useKnowledgeBase();

  // Event-related categories
  const getEventTypes = (): KnowledgeItem[] => getItemsByCategory('event_type');
  const getEventAmenities = (): KnowledgeItem[] => getItemsByCategory('event_amenity');
  const getEventServices = (): KnowledgeItem[] => getItemsByCategory('event_service');

  // Venue-related categories
  const getVenueCategories = (): KnowledgeItem[] => getItemsByCategory('venue_category');
  const getAmenities = (): KnowledgeItem[] => getItemsByCategory('amenity');

  // General categories
  const getAccessibilityAttributes = (): KnowledgeItem[] => getItemsByCategory('accessibility');
  const getTags = (): KnowledgeItem[] => getItemsByCategory('tag');

  // Helper functions for backward compatibility
  const getEventTypeOptions = () => getEventTypes().map(item => ({ value: item.name, label: item.name, icon: item.icon }));
  const getVenueCategoryOptions = () => getVenueCategories().map(item => ({ value: item.name, label: item.name, icon: item.icon }));
  const getAmenityOptions = () => getAmenities().map(item => ({ value: item.name, label: item.name, icon: item.icon }));

  // Track usage when an item is selected
  const trackUsage = (itemName: string, category: string) => {
    const item = items.find(i => i.name === itemName && i.category === category);
    if (item) {
      incrementUsage(item.id);
    }
  };

  return {
    // Raw data
    items,
    loading,
    error,

    // Category-specific getters
    getEventTypes,
    getEventAmenities,
    getEventServices,
    getVenueCategories,
    getAmenities,
    getAccessibilityAttributes,
    getTags,

    // Backward compatibility helpers
    getEventTypeOptions,
    getVenueCategoryOptions,
    getAmenityOptions,

    // Utility functions
    trackUsage,
    getItemsByCategory,
  };
}