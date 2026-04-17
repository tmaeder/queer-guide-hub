/**
 * Web push subscription management.
 *
 * Flow:
 *   1. Page reads the current subscription (if any) from the SW.
 *   2. User clicks "Enable notifications" → we ask permission, subscribe
 *      via PushManager, POST the keys to Supabase.
 *   3. User clicks "Turn off" → unsubscribe locally + DELETE the row.
 *
 * The VAPID public key comes from `VITE_VAPID_PUBLIC` at build time. If
 * it's missing, the hook returns `unsupported: true` and the UI should
 * hide push controls — the feature is disabled rather than half-working.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string | undefined;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function subToKeys(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint!,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  };
}

interface UsePushSubscriptionReturn {
  subscribed: boolean;
  supported: boolean;
  pending: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  error: string | null;
}

export function usePushSubscription(): UsePushSubscriptionReturn {
  const { user } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!existing);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || !user) return;
    setPending(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Permission denied.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!),
      });
      const keys = subToKeys(sub);
      const { error: dbError } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: keys.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: 'user_id,endpoint' },
      );
      if (dbError) throw dbError;
      setSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscription failed.');
    } finally {
      setPending(false);
    }
  }, [supported, user]);

  const unsubscribe = useCallback(async () => {
    if (!supported || !user) return;
    setPending(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', endpoint);
      }
      setSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unsubscribe failed.');
    } finally {
      setPending(false);
    }
  }, [supported, user]);

  return { subscribed, supported, pending, subscribe, unsubscribe, error };
}
