-- Dedup Phase 1: reversible duplicate-venue merge.
--
-- find_duplicate_clusters('venue') surfaces clusters of live venues by
-- normalized title + city; admins pick a canonical and merge the rest from the
-- /admin/duplicates review surface. Merge is SOFT + REVERSIBLE: it sets the
-- dropped venue's duplicate_of_id (the existing stack-wide "hidden duplicate"
-- flag, already excluded from search_documents, meilisearch-sync and the public
-- venue hooks), reparents high-value children to the canonical, records a slug
-- redirect, and audits the op so it can be undone.
--
-- NB: the admin guard is an inline, schema-qualified user_roles check rather than
-- public.is_admin() — that helper is defined with `SET search_path TO ''` and an
-- unqualified `FROM user_roles`, so it errors when called.

create table if not exists public.venue_merge_audit (
  id uuid primary key default gen_random_uuid(),
  keep_id uuid not null references public.venues(id) on delete cascade,
  drop_id uuid not null references public.venues(id) on delete cascade,
  actor uuid,
  reparented jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists venue_merge_audit_drop_idx on public.venue_merge_audit(drop_id);

create table if not exists public.venue_slug_redirects (
  old_slug text primary key,
  venue_id uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.venue_merge_audit enable row level security;
alter table public.venue_slug_redirects enable row level security;

drop policy if exists venue_merge_audit_admin_read on public.venue_merge_audit;
create policy venue_merge_audit_admin_read on public.venue_merge_audit
  for select using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));

drop policy if exists venue_slug_redirects_public_read on public.venue_slug_redirects;
create policy venue_slug_redirects_public_read on public.venue_slug_redirects
  for select using (true);

-- ── merge ─────────────────────────────────────────────────────────────────
create or replace function public.merge_venues(p_keep_id uuid, p_drop_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_drop_slug text; v_keep_dup uuid; v_drop_dup uuid;
  v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;

  select duplicate_of_id into v_keep_dup from public.venues where id = p_keep_id;
  if not found then raise exception 'keep venue % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep venue is itself a duplicate'; end if;

  select duplicate_of_id, slug into v_drop_dup, v_drop_slug from public.venues where id = p_drop_id;
  if not found then raise exception 'drop venue % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop venue already merged'; end if;

  -- high-value children with no user-unique constraint: straight reparent
  update public.events set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);
  update public.festivals set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('festivals', n);
  update public.marketplace_listings set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('marketplace_listings', n);
  update public.trip_places set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('trip_places', n);
  update public.venue_checkins set venue_id = p_keep_id where venue_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_checkins', n);

  -- user/guide/source-scoped children: reparent only where it won't collide with
  -- an existing canonical row; leftover conflicts stay on the (now hidden) dup.
  update public.venue_reviews r set venue_id = p_keep_id where r.venue_id = p_drop_id
    and not exists (select 1 from public.venue_reviews k where k.venue_id = p_keep_id and k.user_id = r.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_reviews', n);

  update public.venue_personal_visits v set venue_id = p_keep_id where v.venue_id = p_drop_id
    and not exists (select 1 from public.venue_personal_visits k where k.venue_id = p_keep_id and k.user_id = v.user_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_personal_visits', n);

  update public.venue_guide_picks g set venue_id = p_keep_id where g.venue_id = p_drop_id
    and not exists (select 1 from public.venue_guide_picks k where k.venue_id = p_keep_id and k.guide_id = g.guide_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_guide_picks', n);

  update public.venue_sources s set venue_id = p_keep_id where s.venue_id = p_drop_id
    and not exists (select 1 from public.venue_sources k where k.venue_id = p_keep_id
                    and k.source_slug = s.source_slug and k.source_entity_id is not distinct from s.source_entity_id);
  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venue_sources', n);

  -- slug redirect (old dup slug -> canonical), then hide the duplicate
  if v_drop_slug is not null then
    insert into public.venue_slug_redirects (old_slug, venue_id) values (v_drop_slug, p_keep_id)
      on conflict (old_slug) do update set venue_id = excluded.venue_id;
  end if;

  update public.venues set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.venue_merge_audit (keep_id, drop_id, actor, reparented)
    values (p_keep_id, p_drop_id, v_actor, v_counts) returning id into v_audit_id;

  return jsonb_build_object('audit_id', v_audit_id, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $$;

-- ── undo ──────────────────────────────────────────────────────────────────
-- v1: un-hide the duplicate + drop its redirect. Reparented children remain on
-- the canonical (a full row-split is deferred); the duplicate reappears with its
-- remaining rows, which restores visibility — the safety guarantee.
create or replace function public.unmerge_venues(p_audit_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.venue_merge_audit; v_slug text;
begin
  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into a from public.venue_merge_audit where id = p_audit_id;
  if not found then raise exception 'audit % not found', p_audit_id; end if;
  if a.undone_at is not null then raise exception 'merge already undone'; end if;

  select slug into v_slug from public.venues where id = a.drop_id;
  update public.venues set duplicate_of_id = null, updated_at = now()
    where id = a.drop_id and duplicate_of_id = a.keep_id;
  delete from public.venue_slug_redirects where old_slug = v_slug and venue_id = a.keep_id;
  update public.venue_merge_audit set undone_at = now() where id = p_audit_id;

  return jsonb_build_object('unmerged', a.drop_id, 'keep_id', a.keep_id);
end; $$;

revoke all on function public.merge_venues(uuid, uuid) from public, anon;
revoke all on function public.unmerge_venues(uuid) from public, anon;
grant execute on function public.merge_venues(uuid, uuid) to authenticated, service_role;
grant execute on function public.unmerge_venues(uuid) to authenticated, service_role;
