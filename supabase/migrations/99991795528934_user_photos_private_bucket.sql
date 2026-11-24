-- user-photos becomes private; public content moves to public buckets.
--
-- Follows 99991795521071, which made uploads to user-photos possible. That
-- bucket was public, so a private profile photo or a chat photo was readable
-- by anyone holding its URL.

-- Chat photos: readable by every participant of the conversation. Path is
-- <uid>/chat-media/<conversation_id>/<file>, so the INSERT policy (first
-- folder = auth.uid()) still applies. The CASE keeps a malformed folder from
-- raising on the uuid cast.
DROP POLICY IF EXISTS "Participants can view chat photo objects" ON storage.objects;
CREATE POLICY "Participants can view chat photo objects" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-photos'
    AND (storage.foldername(name))[2] = 'chat-media'
    AND CASE
      WHEN (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.is_conversation_participant(((storage.foldername(name))[3])::uuid, auth.uid())
      ELSE false
    END
  );

-- The bucket was public, so a private profile photo or a chat photo was
-- readable by anyone holding its URL. It holds 0 objects and nothing links to
-- it (messages, groups, venues checked), so no stored URL breaks. Reads now go
-- through signed URLs under the policies above.
-- Upsert, not UPDATE: a database rebuilt from the migrations may not have the
-- bucket yet, and an UPDATE there would match nothing.
INSERT INTO storage.buckets (id, name, public) VALUES ('user-photos', 'user-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Public content moves to public buckets of its own.
--   group-images: group pictures, shown to everyone; owner-folder writes.
--   venue-images: venue photos from the provider import (service role).
INSERT INTO storage.buckets (id, name, public) VALUES
  ('group-images', 'group-images', true),
  ('venue-images', 'venue-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Users can upload their own group images" ON storage.objects;
CREATE POLICY "Users can upload their own group images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'group-images' AND (auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can update their own group images" ON storage.objects;
CREATE POLICY "Users can update their own group images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'group-images' AND (auth.uid())::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete their own group images" ON storage.objects;
CREATE POLICY "Users can delete their own group images" ON storage.objects FOR DELETE
  USING (bucket_id = 'group-images' AND (auth.uid())::text = (storage.foldername(name))[1]);
-- Needed by the storage API's INSERT ... RETURNING (see the avatars fix).
DROP POLICY IF EXISTS "Users can view their own group image objects" ON storage.objects;
CREATE POLICY "Users can view their own group image objects" ON storage.objects FOR SELECT
  USING (bucket_id = 'group-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

DO $verify$
BEGIN
  IF (SELECT public FROM storage.buckets WHERE id = 'user-photos') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'user-photos bucket is still public';
  END IF;
  IF (SELECT count(*) FROM storage.buckets WHERE id IN ('group-images', 'venue-images') AND public) <> 2 THEN
    RAISE EXCEPTION 'group-images / venue-images buckets missing or not public';
  END IF;
END
$verify$;
