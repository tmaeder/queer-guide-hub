-- Taxonomy vocabulary merge — Phase 3 (2026-07-25)
--
-- The 8 settings vocabularies (venue_categories, venue_services, event_types,
-- event_amenities, event_services, accessibility_attributes, target_groups,
-- professions) are small curated lists with NO foreign keys. Introspection shows
-- the entity columns that *could* reference them are largely disconnected free
-- text (e.g. venues.category matches 0 vocab rows; personalities.profession is
-- 1431 distinct free-text values) — these lists are being superseded by
-- unified_tags. So "merge" here de-duplicates the curated LIST: it captures the
-- dropped label as an alias on the survivor and soft-deactivates the dropped row.
-- It deliberately does NOT rewrite entity free-text (that data is separate and
-- governed by the tag ontology, not these lookup lists) — which also makes the
-- operation fully reversible.

-- ---------------------------------------------------------------------------
-- 0. aliases[] where missing (professions already has it) + reversible audit.
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_categories         ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.venue_services           ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.event_types              ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.event_amenities          ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.event_services           ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.accessibility_attributes ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.target_groups            ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.vocab_merge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vocab text NOT NULL,
  keep_id uuid NOT NULL,
  drop_id uuid NOT NULL,
  drop_name text,
  drop_slug text,
  drop_was_active boolean,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz
);
CREATE INDEX IF NOT EXISTS vocab_merge_audit_open_idx ON public.vocab_merge_audit(vocab, created_at DESC) WHERE undone_at IS NULL;

ALTER TABLE public.vocab_merge_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vocab_merge_audit_admin_read ON public.vocab_merge_audit;
CREATE POLICY vocab_merge_audit_admin_read ON public.vocab_merge_audit FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- ---------------------------------------------------------------------------
-- 1. merge_vocab_term — whitelist-gated curated-list de-dup (alias + deactivate).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_vocab_term(p_vocab text, p_keep_id uuid, p_drop_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_has_slug boolean;
  v_keep_name text;
  v_drop_name text; v_drop_slug text; v_drop_active boolean;
  v_audit_id uuid;
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role='admin') then
    raise exception 'forbidden: admin only';
  end if;
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;
  if p_vocab not in ('venue_categories','venue_services','event_types','event_amenities',
                     'event_services','accessibility_attributes','target_groups','professions') then
    raise exception 'unsupported vocabulary %', p_vocab;
  end if;

  v_has_slug := exists (select 1 from information_schema.columns
    where table_schema='public' and table_name=p_vocab and column_name='slug');

  execute format('select name from public.%I where id=$1', p_vocab) into v_keep_name using p_keep_id;
  if v_keep_name is null then raise exception 'keep term % not found in %', p_keep_id, p_vocab; end if;
  if v_has_slug then
    execute format('select name, slug, is_active from public.%I where id=$1', p_vocab)
      into v_drop_name, v_drop_slug, v_drop_active using p_drop_id;
  else
    execute format('select name, is_active from public.%I where id=$1', p_vocab)
      into v_drop_name, v_drop_active using p_drop_id;
  end if;
  if v_drop_name is null then raise exception 'drop term % not found in %', p_drop_id, p_vocab; end if;
  if v_drop_active is false then raise exception 'drop term % already merged/inactive', p_drop_id; end if;

  -- capture the dropped label(s) as survivor aliases (non-lossy), de-dup
  execute format('update public.%I set aliases = (select array_agg(distinct a) from unnest(aliases || $1) a where a is not null), updated_at = now() where id = $2', p_vocab)
    using array_remove(array[v_drop_name, v_drop_slug], null), p_keep_id;
  -- soft-deactivate the dropped row
  execute format('update public.%I set is_active = false, updated_at = now() where id = $1', p_vocab) using p_drop_id;

  insert into public.vocab_merge_audit (vocab, keep_id, drop_id, drop_name, drop_slug, drop_was_active, actor)
    values (p_vocab, p_keep_id, p_drop_id, v_drop_name, v_drop_slug, v_drop_active, v_actor)
    returning id into v_audit_id;
  return jsonb_build_object('audit_id', v_audit_id, 'vocab', p_vocab, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'alias_added', v_drop_name);
end; $function$;

-- ---------------------------------------------------------------------------
-- 2. unmerge_vocab_term — reactivate the dropped term + remove the captured alias.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unmerge_vocab_term(p_audit_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare v_actor uuid := auth.uid(); r record;
begin
  if v_actor is not null and not exists (select 1 from public.user_roles where user_id = v_actor and role='admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into r from public.vocab_merge_audit where id = p_audit_id and undone_at is null;
  if not found then raise exception 'vocab merge audit % not found or already undone', p_audit_id; end if;

  execute format('update public.%I set is_active = coalesce($1, true), updated_at = now() where id = $2', r.vocab)
    using r.drop_was_active, r.drop_id;
  execute format('update public.%I set aliases = array_remove(array_remove(aliases, $1), $2), updated_at = now() where id = $3', r.vocab)
    using r.drop_name, r.drop_slug, r.keep_id;
  update public.vocab_merge_audit set undone_at = now() where id = p_audit_id;
  return jsonb_build_object('undone', true, 'vocab', r.vocab, 'drop_id', r.drop_id);
end; $function$;

GRANT EXECUTE ON FUNCTION public.merge_vocab_term(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmerge_vocab_term(uuid) TO authenticated;
