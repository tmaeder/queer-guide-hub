-- Spots P2: stop minting shadow organisations, and fold the existing ones into their venue.
--
-- Spec: docs/superpowers/specs/2026-11-22-spots-unification-design.md
-- Plan: docs/superpowers/plans/2026-11-22-spots-unification.md (P2)
--
-- The seven-night drift gate is enforced HERE, not by whoever merges: spots_fold_batch()
-- does nothing until spots_drift_log holds seven distinct nights in the last eight days and
-- every run in that window is zero. So this file can ship with P1; the fold starts by itself
-- once the spine has proved itself, and stops by itself if drift ever appears.
--
-- What takes effect at merge (not gated):
--   * cms_location_identity_insert is disabled: new venues no longer get a shadow org.
--     Shipped with the CMS change that lists venues as their own content type again, so a
--     new venue is editable without one.
--   * org_spine_backfill is retired: registry row disabled first, then a guarded unschedule
--     (house rule; deleting the row would make the reconciler treat the cron as unregistered).
--
-- What the fold touches, per organisation (measured 2026-11-22: 102,008 qualify):
--   Only PURE shadows: roles exactly {venue}, not a duplicate, unclaimed, no legal name,
--   founding date or editorial text, exactly one venue (which is not itself a duplicate), no
--   merged duplicate pointing at it, and no hotel / merchant / brand / news source / partner
--   linked to it. Everything else stays an organisation with its venue as a child spot.
--   * spot_fold_audit gets the full org row and every row it moved; unfold_spot() restores.
--   * the org logo is copied to the venue when the venue has none (80 measured).
--   * the org slug becomes a venue_slug_redirects row, so /organizations/<slug> can resolve
--     to the venue (100,606 slugs differ from their venue's).
--   * news_article_entities mentions move to the venue (2 measured).
--   * machine-generated rows keyed on the org are deleted, not restored by unfold (they
--     regenerate): content_embeddings (~102k vectors), entity_quality_findings (~854k),
--     business_brand_quality_events (~192k), governance_remediation_items (~11k),
--     geo_address_queue (~4k). Org search documents go with the org's own delete trigger.
--   * venues.organization_id is nulled (spots.parent_id follows via trg_spots_sync), then the
--     org row is deleted.
--
-- Batch 300, every 5 minutes: ~340 batches, ~28 hours. 300 is the house cap for writes that
-- fire the venue search trigger.

set lock_timeout = '10s';

create table public.spot_fold_audit (
  id bigserial primary key,
  organization_id uuid not null,
  venue_id uuid not null,
  org_row jsonb not null,
  moved jsonb not null default '{}'::jsonb,
  folded_at timestamptz not null default now(),
  unfolded_at timestamptz
);
create index spot_fold_audit_org_idx on public.spot_fold_audit (organization_id);
alter table public.spot_fold_audit enable row level security;
revoke all on public.spot_fold_audit from public, anon, authenticated;

create function public.spots_fold_gate_open()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select count(distinct (run_at at time zone 'UTC')::date) >= 7 and coalesce(bool_and(drift_count = 0), false)
  from public.spots_drift_log
  where run_at > now() - interval '8 days'
$$;

create function public.spots_fold_batch(p_limit integer default 300)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
  v_folded integer := 0;
  v_news jsonb;
begin
  if not public.spots_fold_gate_open() then
    return jsonb_build_object('gated', true, 'folded', 0);
  end if;

  for r in
    select o.id as org_id, o.slug as org_slug, o.logo_url, to_jsonb(o) as org_row,
           v.id as venue_id, v.slug as venue_slug
    from public.organizations o
    join public.venues v on v.organization_id = o.id
    where o.duplicate_of_id is null
      and o.roles = array['venue']
      and o.claimed_by is null
      and coalesce(o.claim_status, 'unclaimed') = 'unclaimed'
      and o.legal_name is null and o.founded_at is null
      and o.editorial_hook is null and o.editorial_long is null
      and v.duplicate_of_id is null
      and (select count(*) from public.venues v2 where v2.organization_id = o.id) = 1
      and not exists (select 1 from public.organizations d where d.duplicate_of_id = o.id)
      and not exists (select 1 from public.hotels x where x.organization_id = o.id)
      and not exists (select 1 from public.marketplace_merchants x where x.organization_id = o.id)
      and not exists (select 1 from public.marketplace_brands x where x.organization_id = o.id)
      and not exists (select 1 from public.news_sources x where x.organization_id = o.id)
      and not exists (select 1 from public.affiliate_partners x where x.organization_id = o.id)
    limit greatest(1, least(coalesce(p_limit, 300), 300))
    for update of o skip locked
  loop
    select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) into v_news
    from public.news_article_entities n
    where n.entity_type = 'organisation' and n.entity_id = r.org_id;

    insert into public.spot_fold_audit (organization_id, venue_id, org_row, moved)
    values (r.org_id, r.venue_id, r.org_row, jsonb_build_object(
      'news_article_entities', v_news,
      'logo_copied', (r.logo_url is not null
                      and exists (select 1 from public.venues where id = r.venue_id and logo_url is null)),
      'redirect_slug', case when r.org_slug is distinct from r.venue_slug then r.org_slug end));

    update public.venues set logo_url = r.logo_url
    where id = r.venue_id and logo_url is null and r.logo_url is not null;

    if r.org_slug is distinct from r.venue_slug then
      insert into public.venue_slug_redirects (old_slug, venue_id)
      values (r.org_slug, r.venue_id)
      on conflict (old_slug) do nothing;
    end if;

    -- A mention the venue already has would collide on the unique key; drop that copy.
    delete from public.news_article_entities n
    where n.entity_type = 'organisation' and n.entity_id = r.org_id
      and exists (select 1 from public.news_article_entities m
                  where m.article_id = n.article_id and m.entity_type = 'venue' and m.entity_id = r.venue_id);
    update public.news_article_entities set entity_type = 'venue', entity_id = r.venue_id
    where entity_type = 'organisation' and entity_id = r.org_id;

    update public.venues set organization_id = null where id = r.venue_id;

    delete from public.content_embeddings where content_type = 'organization' and content_id = r.org_id;
    delete from public.entity_quality_findings where entity_type = 'organization' and entity_id = r.org_id;
    delete from public.business_brand_quality_events where entity_type = 'organization' and entity_id = r.org_id;
    delete from public.governance_remediation_items where entity_type = 'organization' and entity_id = r.org_id::text;
    delete from public.geo_address_queue where entity_type = 'organization' and entity_id = r.org_id;

    delete from public.organizations where id = r.org_id;
    v_folded := v_folded + 1;
  end loop;

  return jsonb_build_object('gated', false, 'folded', v_folded);
end;
$$;

-- Restores the org row, its venue link, the logo copy, the redirect and news mentions.
-- Deleted machine rows (embeddings, findings, queue items) are regenerated by their jobs.
create function public.unfold_spot(p_audit_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  a public.spot_fold_audit;
begin
  select * into a from public.spot_fold_audit where id = p_audit_id for update;
  if a.id is null then raise exception 'spot_fold_audit % not found', p_audit_id; end if;
  if a.unfolded_at is not null then raise exception 'spot_fold_audit % already unfolded', p_audit_id; end if;

  insert into public.organizations select * from jsonb_populate_record(null::public.organizations, a.org_row);
  update public.venues set organization_id = a.organization_id where id = a.venue_id;
  if (a.moved ->> 'logo_copied')::boolean then
    update public.venues set logo_url = null where id = a.venue_id and logo_url = a.org_row ->> 'logo_url';
  end if;
  if a.moved ->> 'redirect_slug' is not null then
    delete from public.venue_slug_redirects where old_slug = a.moved ->> 'redirect_slug' and venue_id = a.venue_id;
  end if;
  update public.news_article_entities n set entity_type = 'organisation', entity_id = a.organization_id
  from jsonb_array_elements(a.moved -> 'news_article_entities') e
  where n.id = (e ->> 'id')::uuid;

  update public.spot_fold_audit set unfolded_at = now() where id = p_audit_id;
  return jsonb_build_object('unfolded', a.organization_id, 'venue', a.venue_id);
end;
$$;

revoke execute on function public.spots_fold_gate_open() from public, anon, authenticated;
revoke execute on function public.spots_fold_batch(integer) from public, anon, authenticated;
revoke execute on function public.unfold_spot(bigint) from public, anon, authenticated;

-- Stop minting shadows. DISABLE, not DROP: DROP TRIGGER takes ACCESS EXCLUSIVE on venues and
-- would block every venue read until this transaction commits; DISABLE takes SHARE ROW
-- EXCLUSIVE, which blocks writes only. P5 drops it.
alter table public.venues disable trigger cms_location_identity_insert;

update public.admin_automations set enabled = false where slug = 'org_spine_backfill';
do $unschedule$
begin
  if exists (select 1 from cron.job where jobname = 'org_spine_backfill') then
    perform cron.unschedule('org_spine_backfill');
  end if;
end
$unschedule$;

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('spots_fold', 'Spots: fold shadow organisations',
        'Every 5 min: folds up to 300 pure shadow organisations into their venue (spots P2). '
        'No-op until spots_fold_gate_open() (seven clean drift nights); no-op once none are left.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"spots_fold_batch"}'::jsonb, '*/5 * * * *')
on conflict (slug) do update set schedule = excluded.schedule, enabled = excluded.enabled,
  description = excluded.description, name = excluded.name, action = excluded.action,
  trigger = excluded.trigger;

select cron.schedule('spots_fold', '*/5 * * * *', $cron$ select public.spots_fold_batch(300); $cron$);

do $verify$
begin
  if exists (select 1 from pg_trigger where tgname = 'cms_location_identity_insert'
             and tgrelid = 'public.venues'::regclass and tgenabled <> 'D') then
    raise exception 'cms_location_identity_insert still enabled';
  end if;
  if exists (select 1 from cron.job where jobname = 'org_spine_backfill') then
    raise exception 'org_spine_backfill still scheduled';
  end if;
  -- The CI snapshot (scripts/ci/db-snapshot.sh) omits private automation state, so the row
  -- may be absent there; where it exists it must be off.
  if exists (select 1 from public.admin_automations where slug = 'org_spine_backfill' and enabled) then
    raise exception 'org_spine_backfill registry row not disabled';
  end if;
  if not exists (select 1 from cron.job where jobname = 'spots_fold') then
    raise exception 'spots_fold not scheduled';
  end if;
end
$verify$;
