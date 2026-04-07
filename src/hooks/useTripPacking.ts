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
