create table if not exists public.tag_plural_exclusions (
  singular_slug text not null,
  plural_slug   text not null,
  reason        text not null,
  created_at    timestamptz not null default now(),
  primary key (singular_slug, plural_slug)
);

comment on table public.tag_plural_exclusions is
  'Slug pairs that look like singular/plural but are distinct concepts. Rejecting a plural merge in admin inserts here.';

alter table public.tag_plural_exclusions enable row level security;
drop policy if exists tag_plural_exclusions_read on public.tag_plural_exclusions;
create policy tag_plural_exclusions_read on public.tag_plural_exclusions for select using (true);
grant select on public.tag_plural_exclusions to anon, authenticated;
grant all on public.tag_plural_exclusions to service_role;

insert into public.tag_plural_exclusions (singular_slug, plural_slug, reason) values
  ('tv',         'tvs',          'TV = transvestite in queer usage; TVs = televisions'),
  ('brat',       'brats',        'brat = BDSM role (Roles & Dynamics); brats = sausages'),
  ('glass',      'glasses',      'glass = material; glasses = eyewear'),
  ('meat',       'meats',        'meat = objectification role (Roles & Dynamics); meats = menu item'),
  ('strawberry', 'strawberries', 'strawberry = Sexual Roles slang; strawberries = menu item'),
  ('smoothie',   'smoothies',    'smoothie = Roles & Dynamics term; smoothies = drink'),
  ('pet',        'pets',         'pet = pet play (Power Exchange); pets = pets-allowed venue amenity'),
  ('family',     'families',     'family = hotel_vibe facet; families = audience facet -- different silos')
on conflict do nothing;

create or replace function public.tag_plural_of(p_singular text, p_plural text)
returns boolean
language sql immutable parallel safe
set search_path = public
as $fn$
  with n as (
    select replace(coalesce(p_singular,''), '-', '') s,
           replace(coalesce(p_plural,''),   '-', '') p
  )
  select case
    when s = '' or p = '' or right(s,1) = 's' then false
    when length(s) < 3 then false
    when s ~ '(x|z|ch|sh)$' then p = s || 'es'
    when s ~ '[^aeiou]y$'   then p = left(s, length(s) - 1) || 'ies'
    else p = s || 's'
  end
  from n;
$fn$;

create or replace function public.tag_plural_irregular(p_singular text, p_plural text)
returns boolean
language sql immutable parallel safe
set search_path = public
as $fn$
  select (replace(coalesce(p_singular,''),'-',''), replace(coalesce(p_plural,''),'-','')) in (
    ('person','people'), ('man','men'), ('woman','women'), ('child','children'),
    ('foot','feet'), ('tooth','teeth'), ('goose','geese'), ('mouse','mice'),
    ('life','lives'), ('wife','wives'), ('knife','knives'), ('leaf','leaves')
  );
$fn$;

create or replace function public.tag_slugs_are_variants(a text, b text)
returns boolean
language sql immutable parallel safe
set search_path = public
as $fn$
  select a is not null and b is not null and (
    a = b
    or public.tag_plural_of(a, b) or public.tag_plural_of(b, a)
    or public.tag_plural_irregular(a, b) or public.tag_plural_irregular(b, a)
  );
$fn$;

create or replace function public.tag_plural_pairs(p_limit int default 500)
returns table (
  singular_id uuid, singular_slug text, singular_usage int,
  plural_id   uuid, plural_slug   text, plural_usage   int,
  rule text
)
language sql stable
set search_path = public
as $fn$
  select distinct on (p.id)
         s.id, s.slug, s.usage_count, p.id, p.slug, p.usage_count,
         case when public.tag_plural_irregular(s.slug, p.slug) then 'irregular'
              when replace(s.slug,'-','') ~ '(x|z|ch|sh)$' then 'es'
              when replace(s.slug,'-','') ~ '[^aeiou]y$'   then 'ies'
              else 's' end
  from public.unified_tags s
  join public.unified_tags p
    on p.id <> s.id
   and p.status = 'active'
   and (public.tag_plural_of(s.slug, p.slug) or public.tag_plural_irregular(s.slug, p.slug))
  where s.status = 'active'
    and not exists (
      select 1 from public.tag_plural_exclusions e
      where e.singular_slug = s.slug and e.plural_slug = p.slug)
    and not exists (
      select 1 from public.tag_relationship_exclusions x
      where x.tag1_id = least(s.id, p.id) and x.tag2_id = greatest(s.id, p.id))
  order by p.id, coalesce(s.usage_count, 0) desc, length(s.slug)
  limit greatest(p_limit, 0);
$fn$;

create or replace function public.run_tag_plural_merge(
  p_limit int default 200,
  p_dry_run boolean default false
)
returns table (singular_slug text, plural_slug text, rule text, merged boolean, note text)
language plpgsql security definer
set search_path = public
as $fn$
declare r record; v_audit uuid;
begin
  perform public.assert_admin_or_internal();
  perform set_config('app.actor', 'admin:tag-plural-merge', true);

  for r in select * from public.tag_plural_pairs(p_limit) loop
    if p_dry_run then
      singular_slug := r.singular_slug; plural_slug := r.plural_slug;
      rule := r.rule; merged := false; note := 'dry-run';
      return next;
      continue;
    end if;

    begin
      v_audit := public.merge_tag_concept(r.singular_id, r.plural_id, 'auto', 'auto:plural');

      update public.tag_aliases
         set alias_type = 'plural'
       where alias_slug = r.plural_slug and canonical_tag_id = r.singular_id;

      insert into public.tag_slug_redirects (old_slug, new_slug, tag_id)
      values (r.plural_slug, r.singular_slug, r.singular_id)
      on conflict (old_slug) do nothing;

      singular_slug := r.singular_slug; plural_slug := r.plural_slug;
      rule := r.rule; merged := true; note := v_audit::text;
    exception when others then
      singular_slug := r.singular_slug; plural_slug := r.plural_slug;
      rule := r.rule; merged := false; note := 'failed: ' || sqlerrm;
    end;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.run_tag_plural_merge(int, boolean) from public;
grant execute on function public.run_tag_plural_merge(int, boolean) to service_role;
grant execute on function public.tag_plural_pairs(int) to service_role, authenticated;
grant execute on function public.tag_plural_of(text, text) to anon, authenticated, service_role;
grant execute on function public.tag_plural_irregular(text, text) to anon, authenticated, service_role;

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'tag_plural_merge',
  'Tag plural auto-merge',
  'Merges plural tags into their singular via merge_tag_concept (reversible, audited in tag_merge_audit).',
  'system', true, '{"type":"schedule"}'::jsonb, '{}'::jsonb,
  jsonb_build_object('type','rpc','fn','run_tag_plural_merge','jobname','tag_plural_merge'),
  '25 4 * * *'
)
on conflict (slug) do update
  set schedule = excluded.schedule, action = excluded.action, enabled = excluded.enabled;

select cron.schedule('tag_plural_merge', '25 4 * * *',
  $cron$ select public.run_tag_plural_merge(200, false); $cron$);

do $do$
begin
  if public.tag_slugs_are_variants('market', 'marketplace')      then raise exception 'market/marketplace must not be a variant'; end if;
  if public.tag_slugs_are_variants('big-brother', 'brother')     then raise exception 'big-brother/brother must not be a variant'; end if;
  if public.tag_slugs_are_variants('nantaimori', 'nyotaimori')   then raise exception 'nantaimori/nyotaimori must not be a variant'; end if;
  if public.tag_slugs_are_variants('vampires', 'vampiress')      then raise exception 'vampires/vampiress must not be a variant'; end if;
  if public.tag_slugs_are_variants('top', 'bottom')              then raise exception 'top/bottom must not be a variant'; end if;
  if public.tag_slugs_are_variants('gay', 'gray')                then raise exception 'gay/gray must not be a variant'; end if;
  if public.tag_plural_of('tv', 'tvs')                           then raise exception 'tv/tvs must fail the length floor'; end if;

  if not public.tag_slugs_are_variants('pub', 'pubs')            then raise exception 'pub/pubs must be a variant'; end if;
  if not public.tag_slugs_are_variants('brewery', 'breweries')   then raise exception 'brewery/breweries must be a variant'; end if;
  if not public.tag_slugs_are_variants('night-club', 'nightclubs') then raise exception 'night-club/nightclubs must be a variant'; end if;
  if not public.tag_slugs_are_variants('gay-bar', 'gay-bars')    then raise exception 'gay-bar/gay-bars must be a variant'; end if;
  if not public.tag_slugs_are_variants('family', 'families')     then raise exception 'family/families must be a variant'; end if;
  if not public.tag_slugs_are_variants('church', 'churches')     then raise exception 'church/churches must be a variant'; end if;
  if not public.tag_slugs_are_variants('woman', 'women')         then raise exception 'woman/women must be a variant (irregular)'; end if;

  if public.tag_slugs_are_variants('pubs', 'pub') is distinct from public.tag_slugs_are_variants('pub', 'pubs') then
    raise exception 'tag_slugs_are_variants must be symmetric';
  end if;
end $do$;;