-- =============================================================================
-- DRAFT — DO NOT APPLY WITHOUT REVIEW
-- Phase 1 of the CMS strategic overhaul.
-- See: ~/.claude/plans/how-to-improve-workflows-happy-hamming.md
--
-- Scope:
--   1. content_metadata           — co-located replacement for cms_content_metadata
--   2. content_translations       — universal i18n sidecar
--   3. content_threads            — generalized comments (supersedes cms_review_comments
--                                   for new use; old table kept for backfill)
--   4. cms_scheduled_publish      — pg_cron-driven scheduled state transitions
--   5. cms_can_edit() SECURITY DEFINER — centralized RLS predicate
--
-- Rollout strategy:
--   - Apply in a release with the dual-write feature flag enabled
--     (`cms_dual_write_metadata`). Application code writes to BOTH
--     cms_content_metadata and content_metadata until the flag is removed.
--   - Backfill existing cms_content_metadata into content_metadata in batches.
--   - Run nightly count audit; flip flag off only after 7d of zero divergence.
--   - All new tables use cms_can_edit() in their RLS policies — no per-table
--     role checks, no policy duplication across the 14 content types.
-- =============================================================================

-- 1. content_metadata --------------------------------------------------------
-- Co-located workflow + visibility + scheduling for any (content_type, content_id).
-- Replaces cms_content_metadata. Keys are (content_type, content_id) so we can
-- drop the synthetic id and avoid two writes for one logical update.

CREATE TABLE IF NOT EXISTS public.content_metadata (
  content_type        text         NOT NULL,
  content_id          uuid         NOT NULL,
  workflow_state      text         NOT NULL DEFAULT 'draft'
                                   CHECK (workflow_state IN ('draft','review','published','archived')),
  visibility_level    text         NOT NULL DEFAULT 'public'
                                   CHECK (visibility_level IN ('public','private','restricted')),
  publish_at          timestamptz,
  unpublish_at        timestamptz,
  published_at        timestamptz,
  published_by        uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Generated column makes "is this currently published" a pure SQL question.
  -- pg_cron flips workflow_state when publish_at <= now(); the generated col
  -- is a fast read for list views without re-evaluating the rule per row.
  published_effective_at timestamptz GENERATED ALWAYS AS (
    CASE
      WHEN workflow_state = 'published' AND (unpublish_at IS NULL OR unpublish_at > now())
      THEN COALESCE(published_at, publish_at)
      ELSE NULL
    END
  ) STORED,
  meta_title          text,
  meta_description    text,
  canonical_url       text,
  last_edited_by      uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  last_edited_at      timestamptz  NOT NULL DEFAULT now(),
  locked_by           uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at           timestamptz,
  editor_notes        text,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (content_type, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_metadata_state
  ON public.content_metadata (content_type, workflow_state);
CREATE INDEX IF NOT EXISTS idx_content_metadata_publish_at
  ON public.content_metadata (publish_at)
  WHERE workflow_state = 'review' AND publish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_metadata_published_effective
  ON public.content_metadata (content_type, published_effective_at DESC)
  WHERE published_effective_at IS NOT NULL;

-- FK validation via trigger (we cannot FK to a polymorphic target).
-- The allowlist mirrors contentTypeRegistry.ts. Keep in sync.
CREATE OR REPLACE FUNCTION public.assert_content_metadata_target()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  allowed text[] := ARRAY[
    'venues','events','personalities','news_articles','cities','countries',
    'unified_tags','marketplace_listings','community_groups','cms_pages',
    'hotels_bnbs','queer_villages','feedback'
  ];
  exists_cnt int;
  q text;
BEGIN
  IF NOT (NEW.content_type = ANY (allowed)) THEN
    RAISE EXCEPTION 'content_metadata: unknown content_type %', NEW.content_type;
  END IF;
  q := format('SELECT 1 FROM public.%I WHERE id = $1 LIMIT 1', NEW.content_type);
  EXECUTE q INTO exists_cnt USING NEW.content_id;
  IF exists_cnt IS NULL THEN
    RAISE EXCEPTION 'content_metadata: % % does not exist', NEW.content_type, NEW.content_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_metadata_target ON public.content_metadata;
CREATE TRIGGER trg_content_metadata_target
  BEFORE INSERT OR UPDATE OF content_type, content_id ON public.content_metadata
  FOR EACH ROW EXECUTE FUNCTION public.assert_content_metadata_target();


-- 2. content_translations ----------------------------------------------------
-- One row per (content, locale, field). Per-table localized views (added in a
-- follow-up migration) JOIN this and fall back to the source column.

CREATE TABLE IF NOT EXISTS public.content_translations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type  text NOT NULL,
  content_id    uuid NOT NULL,
  locale        text NOT NULL,            -- BCP-47 (e.g. 'fr', 'pt-BR')
  field         text NOT NULL,            -- column on the source table
  value         text,
  source        text NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','ai','import')),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, content_id, locale, field)
);

CREATE INDEX IF NOT EXISTS idx_content_translations_lookup
  ON public.content_translations (content_type, content_id, locale);


-- 3. content_threads ---------------------------------------------------------
-- Generalized threaded comments. Replaces cms_review_comments for new code;
-- old table is kept until reads are fully migrated.

CREATE TABLE IF NOT EXISTS public.content_threads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type       text NOT NULL,
  content_id         uuid NOT NULL,
  thread_kind        text NOT NULL DEFAULT 'review'
                     CHECK (thread_kind IN ('review','moderation','community','annotation')),
  parent_comment_id  uuid REFERENCES public.content_threads(id) ON DELETE CASCADE,
  body               text NOT NULL CHECK (length(body) > 0),
  comment_type       text NOT NULL DEFAULT 'comment'
                     CHECK (comment_type IN ('comment','approval','rejection','change_request','flag')),
  resolved           boolean NOT NULL DEFAULT false,
  resolved_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at        timestamptz,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_threads_target
  ON public.content_threads (content_type, content_id, created_at);
CREATE INDEX IF NOT EXISTS idx_content_threads_unresolved
  ON public.content_threads (content_type, content_id)
  WHERE resolved = false;


-- 4. cms_scheduled_publish ---------------------------------------------------
-- Append-only audit of scheduled state flips driven by pg_cron.

CREATE TABLE IF NOT EXISTS public.cms_scheduled_publish (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL,
  content_id   uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  action       text NOT NULL CHECK (action IN ('publish','unpublish')),
  executed_at  timestamptz,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','executed','failed','canceled')),
  error        text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_scheduled_publish_due
  ON public.cms_scheduled_publish (scheduled_at)
  WHERE status = 'pending';

-- pg_cron job (every minute): flip due rows. Idempotent.
CREATE OR REPLACE FUNCTION public.cms_run_scheduled_publish()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM public.cms_scheduled_publish
     WHERE status = 'pending' AND scheduled_at <= now()
     ORDER BY scheduled_at ASC LIMIT 200
  LOOP
    BEGIN
      UPDATE public.content_metadata
         SET workflow_state = CASE r.action WHEN 'publish' THEN 'published' ELSE 'draft' END,
             published_at  = CASE r.action WHEN 'publish'   THEN now() ELSE published_at END,
             unpublish_at  = CASE r.action WHEN 'unpublish' THEN now() ELSE unpublish_at END,
             updated_at    = now()
       WHERE content_type = r.content_type AND content_id = r.content_id;
      UPDATE public.cms_scheduled_publish
         SET status = 'executed', executed_at = now()
       WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.cms_scheduled_publish
         SET status = 'failed', error = SQLERRM, executed_at = now()
       WHERE id = r.id;
    END;
  END LOOP;
END;
$$;
-- SELECT cron.schedule('cms-scheduled-publish', '* * * * *',
--   $$SELECT public.cms_run_scheduled_publish();$$);
-- (uncomment when applying — keep behind feature flag during rollout)


-- 5. cms_can_edit() ----------------------------------------------------------
-- Central RLS predicate so each new CMS table has ONE policy, not 14.

CREATE OR REPLACE FUNCTION public.cms_can_edit(
  p_content_type text,
  p_content_id   uuid,
  p_user_id      uuid DEFAULT auth.uid()
) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public AS $$
DECLARE
  is_admin   boolean;
  is_editor  boolean;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_user_id AND role IN ('admin','moderator')
  ) INTO is_admin;
  IF is_admin THEN RETURN true; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_user_id AND role = 'editor'
  ) INTO is_editor;
  -- Editors can touch any content; community types may want a stricter rule
  -- (e.g. owner-only for feedback). Tighten per content_type here once we
  -- formalize per-type ACLs in the registry.
  RETURN is_editor;
END;
$$;


-- 6. RLS policies ------------------------------------------------------------

ALTER TABLE public.content_metadata        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_translations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_threads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_scheduled_publish   ENABLE ROW LEVEL SECURITY;

-- Read: published content + own drafts. Tighten public read for non-public visibility.
CREATE POLICY content_metadata_read ON public.content_metadata FOR SELECT
  USING (
    workflow_state = 'published' AND visibility_level = 'public'
    OR public.cms_can_edit(content_type, content_id)
  );
CREATE POLICY content_metadata_write ON public.content_metadata FOR ALL
  USING (public.cms_can_edit(content_type, content_id))
  WITH CHECK (public.cms_can_edit(content_type, content_id));

CREATE POLICY content_translations_read ON public.content_translations FOR SELECT
  USING (true);
CREATE POLICY content_translations_write ON public.content_translations FOR ALL
  USING (public.cms_can_edit(content_type, content_id))
  WITH CHECK (public.cms_can_edit(content_type, content_id));

CREATE POLICY content_threads_read ON public.content_threads FOR SELECT
  USING (
    public.cms_can_edit(content_type, content_id)
    OR (thread_kind = 'community' AND created_by = auth.uid())
  );
CREATE POLICY content_threads_write ON public.content_threads FOR ALL
  USING (
    public.cms_can_edit(content_type, content_id)
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.cms_can_edit(content_type, content_id)
    OR created_by = auth.uid()
  );

CREATE POLICY cms_scheduled_publish_rw ON public.cms_scheduled_publish FOR ALL
  USING (public.cms_can_edit(content_type, content_id))
  WITH CHECK (public.cms_can_edit(content_type, content_id));


-- 7. Backfill (run once, gated by feature flag) -----------------------------
-- INSERT INTO public.content_metadata (
--   content_type, content_id, workflow_state, visibility_level,
--   publish_at, published_at, meta_title, meta_description, canonical_url,
--   last_edited_by, last_edited_at, editor_notes, created_at, updated_at
-- )
-- SELECT
--   source_table, source_id::uuid, workflow_state, visibility_level,
--   scheduled_publish_at, published_at, meta_title, meta_description, canonical_url,
--   last_edited_by, last_edited_at, editor_notes, created_at, updated_at
-- FROM public.cms_content_metadata
-- ON CONFLICT (content_type, content_id) DO NOTHING;

-- Nightly audit (cron):
-- SELECT
--   (SELECT count(*) FROM cms_content_metadata)         AS legacy_rows,
--   (SELECT count(*) FROM content_metadata)             AS new_rows,
--   (SELECT count(*) FROM cms_content_metadata m
--      LEFT JOIN content_metadata n
--        ON n.content_type = m.source_table AND n.content_id::text = m.source_id::text
--     WHERE n.content_id IS NULL)                       AS missing_in_new;
