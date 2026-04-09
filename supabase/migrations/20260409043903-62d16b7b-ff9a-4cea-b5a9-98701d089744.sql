-- Feedback board: add feedback_status to community_submissions + feedback_votes table

-- 1. Add feedback_status column for Kanban board tracking
ALTER TABLE public.community_submissions
  ADD COLUMN IF NOT EXISTS feedback_status text NOT NULL DEFAULT 'new';

DO $$ BEGIN
  ALTER TABLE public.community_submissions
    ADD CONSTRAINT community_submissions_feedback_status_check
    CHECK (feedback_status IN ('new', 'under_review', 'planned', 'in_progress', 'done'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for filtering feedback submissions by status
CREATE INDEX IF NOT EXISTS idx_community_submissions_feedback
  ON public.community_submissions (content_type, feedback_status)
  WHERE content_type = 'feedback';

-- 2. Feedback votes table
CREATE TABLE IF NOT EXISTS public.feedback_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.community_submissions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_votes_submission
  ON public.feedback_votes (submission_id);

-- 3. RLS policies

-- community_submissions: allow anonymous read for feedback items
DROP POLICY IF EXISTS "Anyone can read feedback submissions" ON public.community_submissions;
CREATE POLICY "Anyone can read feedback submissions"
  ON public.community_submissions FOR SELECT
  USING (content_type = 'feedback');

-- community_submissions: allow anonymous insert for feedback
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.community_submissions;
CREATE POLICY "Anyone can submit feedback"
  ON public.community_submissions FOR INSERT
  WITH CHECK (content_type = 'feedback');

-- feedback_votes: enable RLS
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read feedback votes"
  ON public.feedback_votes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can vote"
  ON public.feedback_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own votes"
  ON public.feedback_votes FOR DELETE
  USING (auth.uid() = user_id);
