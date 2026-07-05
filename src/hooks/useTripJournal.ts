import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';

export type JournalMood = 'joy' | 'good' | 'mixed' | 'tough';

export interface JournalEntry {
  id: string;
  trip_id: string;
  day_id: string | null;
  user_id: string;
  body: string;
  mood: JournalMood | null;
  photo_paths: string[];
  created_at: string;
  updated_at: string;
  /** Signed URLs resolved client-side, 1:1 with photo_paths. */
  photo_urls?: string[];
}

const KEY = (tripId: string) => ['trip-journal', tripId] as const;

export function useTripJournal(tripId: string | undefined) {
  return useQuery({
    queryKey: tripId ? KEY(tripId) : ['trip-journal', 'noop'],
    enabled: !!tripId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<JournalEntry[]> => {
      const { data, error } = await untypedFrom('trip_journal_entries')
        .select('*')
        .eq('trip_id', tripId!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const entries = (data ?? []) as JournalEntry[];

      const allPaths = entries.flatMap((e) => e.photo_paths ?? []);
      if (allPaths.length > 0) {
        const { data: signed } = await supabase.storage
          .from('trip-photos')
          .createSignedUrls(allPaths, 3600);
        const urlByPath = new Map(
          (signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]),
        );
        for (const e of entries) {
          e.photo_urls = (e.photo_paths ?? [])
            .map((p) => urlByPath.get(p))
            .filter((u): u is string => !!u);
        }
      }
      return entries;
    },
  });
}

export function useTripJournalMutations(tripId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => {
    if (tripId) void qc.invalidateQueries({ queryKey: KEY(tripId) });
  };

  const addEntry = useMutation({
    mutationFn: async (input: {
      body: string;
      mood: JournalMood | null;
      dayId?: string | null;
      photos?: File[];
    }) => {
      if (!user || !tripId) throw new Error('not ready');
      const paths: string[] = [];
      for (const file of input.photos ?? []) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
        const path = `${tripId}/${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from('trip-photos')
          .upload(path, file, { contentType: file.type || 'image/jpeg' });
        if (error) throw error;
        paths.push(path);
      }
      const { error } = await untypedFrom('trip_journal_entries').insert({
        trip_id: tripId,
        day_id: input.dayId ?? null,
        user_id: user.id,
        body: input.body.trim(),
        mood: input.mood,
        photo_paths: paths,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteEntry = useMutation({
    mutationFn: async (entry: Pick<JournalEntry, 'id' | 'photo_paths'>) => {
      if (entry.photo_paths?.length) {
        // Storage objects first — a failed row delete keeps paths referenced.
        await supabase.storage.from('trip-photos').remove(entry.photo_paths);
      }
      const { error } = await untypedFrom('trip_journal_entries')
        .delete()
        .eq('id', entry.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { addEntry, deleteEntry };
}
