-- Editorial tasks ("Merkliste") — a shared staff to-do / watchlist, ported from
-- the PHP tool's merkliste. Any editor sees and edits the same list (matching
-- the PHP semantics); the creator is recorded. Items may optionally reference a
-- personality. This is deliberately NOT the moderation review_queue — it is a
-- free-form reminder list for the editorial team.

CREATE TABLE IF NOT EXISTS public.editorial_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  personality_id uuid REFERENCES public.personalities(id) ON DELETE SET NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_editorial_tasks_open
  ON public.editorial_tasks (created_at DESC)
  WHERE done = false;

ALTER TABLE public.editorial_tasks ENABLE ROW LEVEL SECURITY;

-- Shared staff list: all editors+ read and write every row.
DROP POLICY IF EXISTS "editorial_tasks_staff_select" ON public.editorial_tasks;
CREATE POLICY "editorial_tasks_staff_select" ON public.editorial_tasks
  FOR SELECT USING (
    has_role_jwt('admin') OR has_role_jwt('moderator') OR has_role_jwt('editor')
  );

DROP POLICY IF EXISTS "editorial_tasks_staff_write" ON public.editorial_tasks;
CREATE POLICY "editorial_tasks_staff_write" ON public.editorial_tasks
  FOR ALL USING (
    has_role_jwt('admin') OR has_role_jwt('moderator') OR has_role_jwt('editor')
  ) WITH CHECK (
    has_role_jwt('admin') OR has_role_jwt('moderator') OR has_role_jwt('editor')
  );
