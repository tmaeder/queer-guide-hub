import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * What a reader may see depends on who they are: signed-in users see
 * safety-gated places that visitors do not. So when the user changes, every
 * cached query belongs to someone else and is dropped — otherwise signing
 * out would leave gated venues on screen for whoever holds the phone next.
 */
export function shouldResetCache(event: AuthChangeEvent, prevUserId: string | null, next: Session | null) {
  if (event === 'SIGNED_OUT') return true;
  if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
    return (next?.user.id ?? null) !== prevUserId;
  }
  return false;
}

export function resetCacheOnUserChange(queryClient: QueryClient) {
  let userId: string | null = null;
  let initialised = false;
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // The first event only tells us who was already signed in at launch.
    if (!initialised) {
      initialised = true;
      userId = session?.user.id ?? null;
      return;
    }
    if (shouldResetCache(event, userId, session)) queryClient.clear();
    userId = session?.user.id ?? null;
  });
  return () => data.subscription.unsubscribe();
}
