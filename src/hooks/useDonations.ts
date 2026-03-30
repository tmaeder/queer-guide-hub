import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DonorWallEntry {
  id: string;
  donor_name: string | null;
  message: string | null;
  amount: number;
  currency: string;
  created_at: string;
  donation_type: string;
}

interface CheckoutSessionInput {
  amount: number;
  currency?: string;
  donation_type: 'one_time' | 'recurring';
  interval?: 'month' | 'year';
  donor_name?: string;
  email: string;
  message?: string;
  is_anonymous?: boolean;
}

export function useDonorWall(limit = 20) {
  return useQuery({
    queryKey: ['donor-wall', limit],
    queryFn: async (): Promise<DonorWallEntry[]> => {
      const { data, error } = await supabase
        .from('donations')
        .select('id, donor_name, message, amount, currency, created_at, donation_type')
        .eq('status', 'completed')
        .eq('is_anonymous', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Donor wall fetch error:', error);
        return [];
      }
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: async (input: CheckoutSessionInput): Promise<string> => {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: input,
      });

      if (error) throw new Error(error.message || 'Failed to create checkout session');
      if (!data?.url) throw new Error('No checkout URL returned');

      return data.url;
    },
  });
}

export function useMyDonations() {
  return useQuery({
    queryKey: ['my-donations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donations')
        .select('id, amount, currency, status, donation_type, recurring_interval, created_at, canceled_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('My donations fetch error:', error);
        return [];
      }
      return data || [];
    },
    staleTime: 2 * 60 * 1000,
  });
}
