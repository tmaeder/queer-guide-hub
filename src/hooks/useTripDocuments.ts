/**
 * Document vault — encrypted travel paperwork in Supabase Storage.
 *
 * Layout:
 *   `trip-documents/{user_id}/{document_id}.{ext}` — file lives here.
 *   `trip_documents` table — metadata (title, doc_type, expiry, trip_id).
 *
 * Reads are mediated through signed URLs minted on demand (5-min TTL).
 * The bucket is private; storage RLS enforces user-folder ownership.
 *
 * Filtering: pass `tripId = null` for personal docs only (passport, ID),
 * a tripId for that trip's docs (visa, vouchers), or `undefined` to skip
 * the query.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type DocType =
  | 'passport'
  | 'id_card'
  | 'visa'
  | 'vaccine'
  | 'insurance'
  | 'flight_ticket'
  | 'hotel_voucher'
  | 'event_ticket'
  | 'other';

export interface TripDocument {
  id: string;
  user_id: string;
  trip_id: string | null;
  doc_type: DocType;
  title: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  expiry_date: string | null;
  country_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const KEY = (userId: string | undefined, scope: 'personal' | 'trip', tripId?: string) =>
  ['trip-documents', userId, scope, tripId ?? null] as const;

/**
 * `tripId` semantics:
 *  - `null`  → personal docs (trip_id IS NULL)
 *  - string  → docs attached to that trip
 *  - `undefined` → no fetch
 */
export function useTripDocuments(tripId: string | null | undefined) {
  const { user } = useAuth();
  const scope: 'personal' | 'trip' = tripId === null ? 'personal' : 'trip';

  return useQuery({
    queryKey: KEY(user?.id, scope, tripId ?? undefined),
    enabled: !!user && tripId !== undefined,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<TripDocument[]> => {
      if (!user) return [];
      const q = supabase.from('trip_documents').select('*').order('expiry_date', {
        ascending: true,
        nullsFirst: false,
      });
      const { data, error } =
        tripId === null ? await q.is('trip_id', null) : await q.eq('trip_id', tripId!);
      if (error) throw error;
      return (data ?? []) as TripDocument[];
    },
  });
}

export interface UploadInput {
  file: File;
  title: string;
  doc_type: DocType;
  expiry_date?: string | null;
  trip_id?: string | null;
  country_id?: string | null;
  notes?: string | null;
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: UploadInput): Promise<TripDocument> => {
      if (!user) throw new Error('not authenticated');

      // Pre-allocate the metadata id so the storage path matches.
      const id = crypto.randomUUID();
      const ext = input.file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const storagePath = `${user.id}/${id}.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from('trip-documents')
        .upload(storagePath, input.file, {
          contentType: input.file.type || undefined,
          upsert: false,
        });
      if (storageErr) throw storageErr;

      const { data, error } = await supabase
        .from('trip_documents')
        .insert({
          id,
          user_id: user.id,
          trip_id: input.trip_id ?? null,
          doc_type: input.doc_type,
          title: input.title,
          storage_path: storagePath,
          file_size_bytes: input.file.size,
          mime_type: input.file.type || null,
          expiry_date: input.expiry_date ?? null,
          country_id: input.country_id ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();

      if (error) {
        // Roll back the upload so we don't leak orphan blobs.
        await supabase.storage.from('trip-documents').remove([storagePath]);
        throw error;
      }
      return data as TripDocument;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip-documents', user?.id] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (doc: TripDocument) => {
      // Storage first, then row — if row delete fails, the storage object is
      // gone but the next reload will still resolve cleanly (the row points
      // to a missing object, which the UI handles via a "missing file" state).
      // The reverse order would leave a row pointing at a deleted blob if the
      // storage call fails.
      const { error: storageErr } = await supabase.storage
        .from('trip-documents')
        .remove([doc.storage_path]);
      if (storageErr) throw storageErr;

      const { error } = await supabase.from('trip_documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trip-documents', user?.id] });
    },
  });
}

/**
 * Mint a 5-minute signed URL for downloading. The Storage bucket is
 * private — anonymous URLs never work.
 */
export async function getDocumentDownloadUrl(doc: TripDocument): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('trip-documents')
    .createSignedUrl(doc.storage_path, 5 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}
