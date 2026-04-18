import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PackingItem {
  id: string;
  trip_id: string;
  user_id: string | null;
  name: string;
  category: string | null;
  quantity: number;
  is_checked: boolean;
  sort_order: number;
  created_at: string;
}

export interface PackingGroup {
  category: string;
  items: PackingItem[];
}

type CreatePackingInput = {
  trip_id: string;
  name: string;
  category?: string;
  quantity?: number;
  marketplace_listing_id?: string | null;
  suggested_by?: 'user' | 'template' | 'marketplace_suggestion' | 'llm';
  suggestion_reason?: string | null;
};

type UpdatePackingInput = Partial<Pick<PackingItem, 'name' | 'category' | 'quantity' | 'is_checked' | 'sort_order'>> & { id: string };

const TEMPLATES: Record<string, { name: string; category: string }[]> = {
  essentials: [
    { name: 'Passport / ID', category: 'documents' },
    { name: 'Phone charger', category: 'electronics' },
    { name: 'Medications', category: 'toiletries' },
    { name: 'Wallet', category: 'documents' },
    { name: 'Travel insurance docs', category: 'documents' },
  ],
  'lgbtq-safety': [
    { name: 'Emergency contacts card', category: 'safety' },
    { name: 'Local LGBTQ+ org info', category: 'safety' },
    { name: 'VPN app installed', category: 'electronics' },
    { name: 'Discreet pride items', category: 'lgbtq-specific' },
    { name: 'Gender-affirming supplies', category: 'lgbtq-specific' },
  ],
  beach: [
    { name: 'Sunscreen', category: 'toiletries' },
    { name: 'Swimwear', category: 'clothing' },
    { name: 'Towel', category: 'clothing' },
    { name: 'Sandals', category: 'clothing' },
    { name: 'Sunglasses', category: 'clothing' },
  ],
  // Climate-based templates
  'cold-weather': [
    { name: 'Winter jacket', category: 'clothing' },
    { name: 'Thermal layers', category: 'clothing' },
    { name: 'Gloves', category: 'clothing' },
    { name: 'Warm hat / beanie', category: 'clothing' },
    { name: 'Warm socks', category: 'clothing' },
    { name: 'Lip balm', category: 'toiletries' },
  ],
  'hot-weather': [
    { name: 'Light clothing', category: 'clothing' },
    { name: 'Sunscreen SPF 50+', category: 'toiletries' },
    { name: 'Hat / cap', category: 'clothing' },
    { name: 'Reusable water bottle', category: 'other' },
    { name: 'Insect repellent', category: 'toiletries' },
  ],
  'rainy-season': [
    { name: 'Rain jacket / poncho', category: 'clothing' },
    { name: 'Waterproof bag', category: 'other' },
    { name: 'Umbrella', category: 'other' },
    { name: 'Quick-dry clothes', category: 'clothing' },
  ],
  // Activity-based templates
  nightlife: [
    { name: 'Going-out outfit', category: 'clothing' },
    { name: 'Comfortable shoes for dancing', category: 'clothing' },
    { name: 'Earplugs', category: 'other' },
    { name: 'Portable phone charger', category: 'electronics' },
  ],
  hiking: [
    { name: 'Hiking boots', category: 'clothing' },
    { name: 'Daypack / backpack', category: 'other' },
    { name: 'First aid kit', category: 'safety' },
    { name: 'Trail snacks', category: 'other' },
    { name: 'Headlamp', category: 'electronics' },
  ],
  culture: [
    { name: 'Modest clothing for religious sites', category: 'clothing' },
    { name: 'Guidebook / phrasebook', category: 'documents' },
    { name: 'Camera', category: 'electronics' },
    { name: 'Notebook', category: 'other' },
  ],
  wellness: [
    { name: 'Yoga mat / travel mat', category: 'other' },
    { name: 'Workout clothes', category: 'clothing' },
    { name: 'Resistance band', category: 'other' },
    { name: 'Supplements / vitamins', category: 'toiletries' },
  ],
};

export function useTripPacking(tripId: string | undefined) {
  const query = useQuery({
    queryKey: ['trip-packing', tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_packing_items')
        .select('*')
        .eq('trip_id', tripId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as PackingItem[];
    },
    enabled: !!tripId,
    staleTime: 2 * 60 * 1000,
  });

  const items = query.data || [];
  const checkedCount = items.filter((i) => i.is_checked).length;
  const totalCount = items.length;

  const grouped: PackingGroup[] = [];
  const catMap = new Map<string, PackingItem[]>();
  for (const item of items) {
    const cat = item.category || 'other';
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat)!.push(item);
  }
  for (const [category, catItems] of catMap) {
    grouped.push({ category, items: catItems });
  }

  return { ...query, items, grouped, checkedCount, totalCount };
}

export function usePackingMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['trip-packing', tripId] });

  const addPackingItem = useMutation({
    mutationFn: async (input: CreatePackingInput) => {
      const { data, error } = await supabase
        .from('trip_packing_items')
        .insert({
          trip_id: input.trip_id,
          name: input.name,
          category: input.category || 'other',
          quantity: input.quantity || 1,
          marketplace_listing_id: input.marketplace_listing_id ?? null,
          suggested_by: input.suggested_by ?? 'user',
          suggestion_reason: input.suggestion_reason ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as PackingItem;
    },
    onSuccess: invalidate,
  });

  const updatePackingItem = useMutation({
    mutationFn: async ({ id, ...input }: UpdatePackingInput) => {
      const { data, error } = await supabase
        .from('trip_packing_items')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as PackingItem;
    },
    onSuccess: invalidate,
  });

  const toggleChecked = useMutation({
    mutationFn: async ({ id, is_checked }: { id: string; is_checked: boolean }) => {
      const { error } = await supabase
        .from('trip_packing_items')
        .update({ is_checked })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deletePackingItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_packing_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const addPackingTemplate = useMutation({
    mutationFn: async (templateName: string) => {
      const template = TEMPLATES[templateName];
      if (!template) throw new Error(`Unknown template: ${templateName}`);

      const rows = template.map((t, i) => ({
        trip_id: tripId,
        name: t.name,
        category: t.category,
        quantity: 1,
        sort_order: i,
      }));

      const { error } = await supabase.from('trip_packing_items').insert(rows);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { addPackingItem, updatePackingItem, toggleChecked, deletePackingItem, addPackingTemplate };
}

/**
 * Auto-suggest packing templates based on destination latitude (climate)
 * and trip interests/activities.
 */
export function getSuggestedTemplates(options: {
  latitude?: number | null;
  month?: number; // 1-12
  interests?: string[];
  equalityScore?: number | null;
}): string[] {
  const suggestions: string[] = ['essentials'];
  const { latitude, month = new Date().getMonth() + 1, interests = [], equalityScore } = options;

  // Climate-based suggestions
  if (latitude != null) {
    const absLat = Math.abs(latitude);
    const isNorthernHemisphere = latitude >= 0;
    const isWinter = isNorthernHemisphere ? (month >= 11 || month <= 3) : (month >= 5 && month <= 9);
    const isSummer = !isWinter;

    if (absLat > 50 && isWinter) suggestions.push('cold-weather');
    if (absLat < 35 || isSummer) suggestions.push('hot-weather');
    if (absLat < 25 && (month >= 6 && month <= 10)) suggestions.push('rainy-season');
    if (absLat < 35 && isSummer) suggestions.push('beach');
  }

  // Interest-based suggestions
  for (const interest of interests) {
    const key = interest.toLowerCase();
    if (TEMPLATES[key]) suggestions.push(key);
  }

  // Safety-based
  if (equalityScore != null && equalityScore < 60) {
    suggestions.push('lgbtq-safety');
  }

  // Dedupe
  return [...new Set(suggestions)];
}

export { TEMPLATES };
