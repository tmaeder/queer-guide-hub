import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export const useMailboxAddress = () => {
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch current mailbox address
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('mailbox_address')
        .eq('user_id', user.id)
        .single();
      setCurrentAddress(data?.mailbox_address || null);
      setLoading(false);
    })();
  }, [user]);

  const checkAvailability = useCallback(
    async (handle: string): Promise<{ available: boolean; reason: string | null }> => {
      const { data, error } = await supabase.rpc('check_mailbox_availability', {
        p_address: handle.toLowerCase(),
      });
      if (error) return { available: false, reason: error.message };
      return data as { available: boolean; reason: string | null };
    },
    [],
  );

  const claimAddress = useCallback(
    async (handle: string): Promise<boolean> => {
      if (!user) return false;
      const normalized = handle.toLowerCase();

      // Double-check availability
      const check = await checkAvailability(normalized);
      if (!check.available) {
        toast({
          title: 'Address unavailable',
          description: check.reason || 'This address cannot be used.',
          variant: 'destructive',
        });
        return false;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ mailbox_address: normalized } as never)
        .eq('user_id', user.id);

      if (error) {
        toast({
          title: 'Failed to claim address',
          description: error.message,
          variant: 'destructive',
        });
        return false;
      }

      setCurrentAddress(normalized);
      toast({
        title: 'Email address claimed!',
        description: `Your email is now ${normalized}@queer.guide`,
      });
      return true;
    },
    [user, checkAvailability, toast],
  );

  return {
    currentAddress,
    fullEmail: currentAddress ? `${currentAddress}@queer.guide` : null,
    loading,
    checkAvailability,
    claimAddress,
  };
};
