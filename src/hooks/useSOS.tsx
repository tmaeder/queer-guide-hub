import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
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
  const { profile } = useProfile();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const friendIdsRef = useRef(friendIds);
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
      const senderName = profile?.display_name || 'Someone';

      const notifications = ids.map((friendId) => ({
        user_id: friendId,
        type: 'system' as const,
        title: t('sos.notificationTitle', { name: senderName }),
        content: location
          ? t('sos.notificationBodyWithLocation', { name: senderName })
          : t('sos.notificationBody', { name: senderName }),
        action_url: `/users/${user.id}`,
        related_id: user.id,
        metadata: {
          sos: true,
          sender_id: user.id,
          ...(location && { lat: location.lat, lng: location.lng }),
          sent_at: new Date().toISOString(),
        },
      }));

      const { error } = await supabase.from('notifications').insert(notifications);
      if (error) throw error;

      localStorage.setItem(STORAGE_KEY, Date.now().toString());
      setCooldownSeconds(Math.ceil(COOLDOWN_MS / 1000));

      toast({
        title: t('sos.sent', { count: ids.length }),
      });
    } catch (err) {
      console.error('SOS send failed:', err);
      toast({
        title: t('sos.error'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, profile?.display_name, t, toast]);

  return {
    sendSOS,
    canSend,
    loading,
    cooldownSeconds,
    friendCount: friendIds.length,
  };
}
