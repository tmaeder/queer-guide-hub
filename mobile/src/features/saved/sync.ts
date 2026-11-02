import { supabase } from '@/lib/supabase';
import type { SavedPlace } from './savedStore';

/**
 * Signed-in saved places = the account's venue_favorites (the same table the
 * web's favourites use; RLS owner-only, UNIQUE (user_id, venue_id)).
 *
 * On sign-in the phone's list and the account's list are merged and the
 * local-only places uploaded. From then on the local list mirrors the
 * account. On sign-out it is cleared from the phone — it belongs to the
 * account now, and leaving it would show the next person this account's
 * saved bars and saunas.
 */
export interface SyncDeps {
  listFavorites(userId: string): Promise<SavedPlace[]>;
  venueIdsForSlugs(slugs: string[]): Promise<Record<string, string>>;
  addFavorite(userId: string, venueId: string): Promise<void>;
  removeFavorite(userId: string, venueId: string): Promise<void>;
}

/** Union by slug; the account's entry wins (it carries the venue id). */
export function mergeSaved(local: SavedPlace[], remote: SavedPlace[]): SavedPlace[] {
  const bySlug = new Map<string, SavedPlace>();
  for (const p of local) bySlug.set(p.slug, p);
  for (const p of remote) bySlug.set(p.slug, { ...bySlug.get(p.slug), ...p });
  return [...bySlug.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function syncOnSignIn(userId: string, local: SavedPlace[], deps: SyncDeps): Promise<SavedPlace[]> {
  const remote = await deps.listFavorites(userId);
  const remoteSlugs = new Set(remote.map((p) => p.slug));
  const toUpload = local.filter((p) => !remoteSlugs.has(p.slug));
  const missingIds = toUpload.filter((p) => !p.venueId).map((p) => p.slug);
  const ids = missingIds.length ? await deps.venueIdsForSlugs(missingIds) : {};
  const uploaded: SavedPlace[] = [];
  for (const p of toUpload) {
    const venueId = p.venueId ?? ids[p.slug];
    // A place that no longer resolves (merged, removed) is not uploaded but
    // stays in the local list, so nothing the user saved disappears silently.
    if (!venueId) {
      uploaded.push(p);
      continue;
    }
    await deps.addFavorite(userId, venueId);
    uploaded.push({ ...p, venueId });
  }
  return mergeSaved(uploaded, remote);
}

type FavRow = {
  venue_id: string;
  created_at: string;
  venue: { slug: string; name: string; category: string | null; city: string | null } | null;
};

export const supabaseSync: SyncDeps = {
  async listFavorites(userId) {
    const { data, error } = await supabase
      .from('venue_favorites')
      .select('venue_id, created_at, venue:venues!venue_id(slug, name, category, city)')
      .eq('user_id', userId);
    if (error) throw error;
    return ((data ?? []) as unknown as FavRow[]).flatMap((r) =>
      r.venue
        ? [
            {
              slug: r.venue.slug,
              name: r.venue.name,
              category: r.venue.category ?? 'other',
              city: r.venue.city,
              savedAt: r.created_at,
              venueId: r.venue_id,
            },
          ]
        : [],
    );
  },
  async venueIdsForSlugs(slugs) {
    const { data, error } = await supabase.from('venues').select('id, slug').in('slug', slugs);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.slug, r.id]));
  },
  async addFavorite(userId, venueId) {
    const { error } = await supabase
      .from('venue_favorites')
      .upsert({ user_id: userId, venue_id: venueId }, { onConflict: 'user_id,venue_id', ignoreDuplicates: true });
    if (error) throw error;
  },
  async removeFavorite(userId, venueId) {
    const { error } = await supabase.from('venue_favorites').delete().eq('user_id', userId).eq('venue_id', venueId);
    if (error) throw error;
  },
};

interface StoreLike {
  load(): Promise<void>;
  isLoaded(): boolean;
  getAll(): SavedPlace[];
  has(slug: string): boolean;
  toggle(place: Omit<SavedPlace, 'savedAt'>): Promise<void>;
  replaceAll(items: SavedPlace[]): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Save / unsave. Signed in, the account is written first and the phone
 * follows, so the two cannot disagree after a failed request.
 */
export async function toggleSavedPlace(
  store: StoreLike,
  place: Omit<SavedPlace, 'savedAt'>,
  userId: string | null,
  deps: SyncDeps = supabaseSync,
) {
  if (userId && place.venueId) {
    if (store.has(place.slug)) await deps.removeFavorite(userId, place.venueId);
    else await deps.addFavorite(userId, place.venueId);
  }
  await store.toggle(place);
}

/** Keep the phone's list in step with the signed-in account. */
export function syncSavedOnAuth(
  store: StoreLike,
  onAuth: (cb: (event: string, userId: string | null) => void) => () => void,
  deps: SyncDeps = supabaseSync,
) {
  let current: string | null = null;
  return onAuth((event, userId) => {
    void (async () => {
      if (!store.isLoaded()) await store.load();
      if (event === 'SIGNED_OUT' || (current && userId !== current)) {
        await store.clear();
      }
      current = userId;
      if (userId && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        try {
          await store.replaceAll(await syncOnSignIn(userId, store.getAll(), deps));
        } catch {
          // Offline: keep the phone's list; the next sign-in event retries.
        }
      }
    })();
  });
}

export const supabaseAuthEvents = (cb: (event: string, userId: string | null) => void) => {
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session?.user.id ?? null));
  return () => data.subscription.unsubscribe();
};
