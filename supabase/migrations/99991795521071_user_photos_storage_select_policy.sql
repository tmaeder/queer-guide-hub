-- Profile photo uploads never worked: the user-photos bucket holds 0 objects
-- and public.user_photos 0 rows.
--
-- Same cause as the avatars bucket (99991795520795): the storage API writes
-- with INSERT ... RETURNING / upsert, which needs a SELECT policy, and this
-- bucket had INSERT/UPDATE/DELETE policies only. createSignedUrl, which the
-- gallery uses to show a photo, needs SELECT on the object as well.
--
-- Who may read an object mirrors who may read its photo row: the owner's own
-- folder, or any object whose public.user_photos row the caller can see. That
-- subquery runs under the caller's RLS on user_photos, so the table's read
-- policy (owner / admin / is_public / accepted relationship) stays the single
-- rule. TO authenticated because anon holds no SELECT on user_photos.
DROP POLICY IF EXISTS "Users can view readable user photo objects" ON storage.objects;
CREATE POLICY "Users can view readable user photo objects" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'user-photos'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR EXISTS (SELECT 1 FROM public.user_photos p WHERE p.storage_path = storage.objects.name)
    )
  );
