-- Group join requests: request-to-join flow for private community_groups.
-- Adds group_join_requests table, RLS, approve/reject RPCs,
-- and a discovery SELECT policy so authenticated users can see private
-- group metadata in /groups listings (content/membership remain gated).

-- 1. Table
CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   UUID        NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  message    TEXT,
  decided_by UUID        REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open request per user per group
CREATE UNIQUE INDEX IF NOT EXISTS group_join_requests_one_pending_per_user
  ON public.group_join_requests (group_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS group_join_requests_group_status_idx
  ON public.group_join_requests (group_id, status);

CREATE INDEX IF NOT EXISTS group_join_requests_user_idx
  ON public.group_join_requests (user_id);

ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

-- 2. RLS policies on group_join_requests

-- Requester can read their own request rows.
CREATE POLICY "Requesters read own requests"
ON public.group_join_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Group admins/moderators can read requests for their group.
CREATE POLICY "Group admins read requests"
ON public.group_join_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = group_join_requests.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  )
);

-- Authenticated users may submit a request for themselves on a private group
-- they are not already a member of.
CREATE POLICY "Users submit own join request"
ON public.group_join_requests
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.community_groups cg
    WHERE cg.id = group_join_requests.group_id AND cg.is_private = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = group_join_requests.group_id
      AND gm.user_id = auth.uid()
  )
);

-- Requester can cancel their own pending row (update to cancelled).
CREATE POLICY "Requesters cancel own pending"
ON public.group_join_requests
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status IN ('pending', 'cancelled'));

-- Group admins/moderators can update any request for their group
-- (the approve/reject RPCs are preferred, but direct update is allowed
--  for admins to e.g. correct state).
CREATE POLICY "Group admins manage requests"
ON public.group_join_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = group_join_requests.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  )
);

-- 3. Expose private groups in discovery for authenticated users.
-- Without this, Groups.tsx cannot show private groups a user hasn't joined.
-- Content (posts) and memberships remain gated by their own RLS.
CREATE POLICY "Authenticated users discover private groups"
ON public.community_groups
FOR SELECT
TO authenticated
USING (is_private = true);

-- 4. Approve RPC - creates membership atomically.
CREATE OR REPLACE FUNCTION public.approve_group_join_request(request_id UUID)
RETURNS public.group_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.group_join_requests;
BEGIN
  SELECT * INTO req FROM public.group_join_requests WHERE id = request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join request not found';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Join request is not pending (status=%)', req.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = req.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized to approve requests for this group';
  END IF;

  INSERT INTO public.group_memberships (group_id, user_id, role)
  VALUES (req.group_id, req.user_id, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  UPDATE public.group_join_requests
    SET status = 'approved', decided_by = auth.uid(), decided_at = now()
    WHERE id = request_id
    RETURNING * INTO req;

  RETURN req;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_group_join_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_group_join_request(UUID) TO authenticated;

-- 5. Reject RPC
CREATE OR REPLACE FUNCTION public.reject_group_join_request(request_id UUID)
RETURNS public.group_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.group_join_requests;
BEGIN
  SELECT * INTO req FROM public.group_join_requests WHERE id = request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Join request not found';
  END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Join request is not pending (status=%)', req.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = req.group_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Not authorized to reject requests for this group';
  END IF;

  UPDATE public.group_join_requests
    SET status = 'rejected', decided_by = auth.uid(), decided_at = now()
    WHERE id = request_id
    RETURNING * INTO req;

  RETURN req;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_group_join_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_group_join_request(UUID) TO authenticated;
