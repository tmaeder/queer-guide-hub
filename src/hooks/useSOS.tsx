import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

const COOLDOWN_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'sos_last_sent';

function getGeolocation(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}

export function useSOS(friendIds: string[]) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const friendIdsRef = useRef(friendIds);
  // eslint-disable-next-line react-hooks/refs -- "latest value" ref pattern.
  friendIdsRef.current = friendIds;

  // Cooldown timer
  useEffect(() => {
    const update = () => {
      const lastSent = localStorage.getItem(STORAGE_KEY);
      if (!lastSent) {
        setCooldownSeconds(0);
        return;
      }
      const elapsed = Date.now() - parseInt(lastSent, 10);
      const remaining = Math.max(0, Math.ceil((COOLDOWN_MS - elapsed) / 1000));
      setCooldownSeconds(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const canSend = !loading && cooldownSeconds === 0 && friendIds.length > 0;

  const sendSOS = useCallback(async () => {
    if (!user) return;

    const ids = friendIdsRef.current;
    if (ids.length === 0) return;

    setLoading(true);
    try {
      const location = await getGeolocation();

      // Server-authoritative: send_sos enforces the cooldown, resolves recipients
      // (trusted contacts, else accepted friends) and persists a durable alert
      // with last-known location. The client cannot target arbitrary users.
      const { data, error } = await supabase.rpc('send_sos', {
        p_lat: location?.lat ?? undefined,
        p_lng: location?.lng ?? undefined,
        p_accuracy: undefined,
        p_message: undefined,
      });
      if (error) {
        const cooldown = error.message?.includes('sos_cooldown');
        const none = error.message?.includes('sos_no_recipients');
        toast({
          title: cooldown
            ? t('sos.cooldown', 'Please wait before sending another SOS.')
            : none
              ? t('sos.noRecipients', 'Add friends or trusted contacts to use SOS.')
              : t('sos.error'),
          variant: 'destructive',
        });
        return;
      }

      const sent = (data as { recipients: number }[] | null)?.[0]?.recipients ?? ids.length;
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
      setCooldownSeconds(Math.ceil(COOLDOWN_MS / 1000));
      toast({ title: t('sos.sent', { count: sent }) });
    } catch (err) {
      console.error('SOS send failed:', err);
      toast({
        title: t('sos.error'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, t, toast]);

  return {
    sendSOS,
    canSend,
    loading,
    cooldownSeconds,
    friendCount: friendIds.length,
  };
}
