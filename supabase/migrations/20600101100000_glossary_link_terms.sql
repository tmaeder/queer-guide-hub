-- Inline glossary links in body text — the vocabulary of record.
--
-- Until now every content→tag link on this platform has been a CHIP or a RAIL,
-- never a link inside a sentence: TagChipRow, FromTheGlossary (which links to
-- /tags, the index, not the term), TagChipHover, TagInterchange. The one
-- component that renders a term in editorial context, InfographicTermChip, is
-- confined to figures. This table is what lets prose link a term where it is
-- actually mentioned.
--
-- WHY THIS IS A CURATED TABLE AND NOT A QUERY OVER unified_tags.name
-- ------------------------------------------------------------------
-- Measured on prod before writing this, matching every active tag name against
-- 800 city descriptions:
--
--     A            747 hits   -- a real status='active', seo_indexable tag
--     Town         219
--     River        152
--     Community    129
--     Middle        26        -- is_adult = true  ("Middle East")
--     Offering      17        -- is_adult = true  ("offering visitors…")
--     Public        15        -- is_adult = true  ("public transport")
--
-- Over a 400-city sample: 1,628 matches, 4.1 per description, 93 of them adult
-- tags. That is the same defect class as the alias auto-tagging incident fixed
-- in 20260910151200, which had put 'culture' → Crops on 2,609 news articles,
-- 'cbt' → Cock & Ball Torture and 'covid-19' → Seafood, because every alias was
-- a silent auto-tagging rule. A string that matches is not a term that is meant,
-- and nothing but a human can tell the difference.
--
-- tag_aliases cannot be that human-reviewed list: of its ~15,244 rows ~14,931
-- are unreviewed 'multilingual' machine imports, which is exactly why the
-- reconciler had to be taught to trust only review_status='approved'.

create table if not exists public.glossary_link_terms (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references public.unified_tags (id) on delete cascade,

  -- The string matched in prose. Several surface forms may resolve to one tag
  -- ("deadnaming", "dead naming"); the matcher dedupes by SLUG, so that is one
  -- link, not two.
  surface_form text not null,

  -- Normalisation is `lower(btrim(...))` and NOT unaccent, deliberately twice
  -- over. (1) Both unaccent() overloads are STABLE on this database, not
  -- immutable, so neither can appear in a generated column or an index
  -- expression — checked, do not "fix" this by adding unaccent back. (2) More
  -- importantly this must agree byte-for-byte with what the TypeScript matcher
  -- does (`surface.trim().toLowerCase()`), or the uniqueness this column
  -- guarantees would not be the uniqueness the matcher relies on.
  surface_form_key text generated always as (lower(btrim(surface_form))) stored,

  -- 'exact_plural' opts into the three REGULAR English plural patterns only
  -- (consonant+y → -ies, sibilant → -es, else +s). Irregulars are a second
  -- reviewed row, never a guess.
  match_mode text not null default 'exact'
    check (match_mode in ('exact', 'exact_plural')),

  -- 'candidate' is proposed by the seed script and links NOTHING. Only a human
  -- moves a row to 'active'.
  status text not null default 'candidate'
    check (status in ('candidate', 'active', 'rejected')),

  rejection_reason text,
  notes text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A rejection without a reason is the thing that makes the next reviewer
  -- re-litigate it from scratch.
  constraint glossary_link_terms_rejection_has_reason
    check (status <> 'rejected' or nullif(btrim(coalesce(rejection_reason, '')), '') is not null),

  -- Backstop under the review, not a substitute for it: the worst false
  -- positive measured was a ONE-character tag. Mirrors MIN_SURFACE_FORM_LENGTH
  -- in src/lib/glossaryLinks.ts, which enforces the same floor at match time so
  -- neither layer is load-bearing alone.
  constraint glossary_link_terms_surface_form_length
    check (length(btrim(surface_form)) >= 3)
);

-- The tombstone. A rejected row keeps its key, so the seeding pass structurally
-- CANNOT re-propose a surface form a human has already refused — the same
-- mechanism 20261012090300 used for rejected tag relations. Deleting rejected
-- rows instead would make every seed run re-offer the same junk forever.
create unique index if not exists glossary_link_terms_surface_form_key_uq
  on public.glossary_link_terms (surface_form_key);

create index if not exists glossary_link_terms_tag_id_idx
  on public.glossary_link_terms (tag_id);

create index if not exists glossary_link_terms_status_idx
  on public.glossary_link_terms (status) where status = 'active';

drop trigger if exists trg_glossary_link_terms_updated_at on public.glossary_link_terms;
create trigger trg_glossary_link_terms_updated_at
  before update on public.glossary_link_terms
  for each row execute function public.set_updated_at();

comment on table public.glossary_link_terms is
  'Human-reviewed vocabulary of surface forms that may become inline links to a glossary entry in body text. Nothing links until status=''active''. Read through glossary_link_terms_public, which applies the tag-side gates.';
comment on column public.glossary_link_terms.surface_form_key is
  'lower(btrim(surface_form)). Must match src/lib/glossaryLinks.ts normalisation exactly. NOT unaccented: both unaccent() overloads are STABLE here and cannot be used in a generated column.';
comment on column public.glossary_link_terms.status is
  'candidate = proposed, links nothing. active = links. rejected = tombstone, keeps the unique key so the seed cannot re-propose it.';

-- ---------------------------------------------------------------------------
-- The gated read surface.
--
-- Gates live HERE, not in the callers. There are three readers (the SPA hook,
-- the Cloudflare edge builder, the sentinel) and a gate restated three times is
-- a gate that will disagree with itself.
-- ---------------------------------------------------------------------------
create or replace view public.glossary_link_terms_public as
  select
    t.surface_form,
    t.match_mode,
    u.slug
  from public.glossary_link_terms t
  join public.unified_tags u on u.id = t.tag_id
  where t.status = 'active'
    and u.status = 'active'
    and u.merged_into_id is null
    and coalesce(u.seo_indexable, false)
    -- An adult term is never injected into prose. FromTheGlossary already drops
    -- adult terms from its rail for unaffirmed visitors; an inline link has no
    -- affirmation step at all, and the measurement above found `Middle`,
    -- `Public` and `Offering` landing in ordinary travel copy.
    and not coalesce(u.is_adult, false)
    -- Reuse the platform's own anon gate rather than inventing one. Note this
    -- is NOT `not is_sensitive`: that would drop PrEP (sensitive, reviewed,
    -- usage_count 113), Poppers and Naloxone — precisely the harm-reduction
    -- vocabulary a reader most needs clickable. tag_is_anon_gated only excludes
    -- sensitive terms that have NOT been reviewed or locked.
    and not public.tag_is_anon_gated(u.is_sensitive, u.verification_status)
    -- Linking to an entry with no definition is worse than not linking.
    and (
      nullif(btrim(coalesce(u.description, '')), '') is not null
      or nullif(btrim(coalesce(u.short_description, '')), '') is not null
      or nullif(btrim(coalesce(u.long_description, '')), '') is not null
    );

comment on view public.glossary_link_terms_public is
  'The only vocabulary any renderer may read. Applies every tag-side gate (active, not merged, indexable, not adult, not anon-gated, has prose) so the SPA, the edge and the sentinel cannot drift apart.';

-- New tables need explicit anon GRANTs in this project.
grant select on public.glossary_link_terms_public to anon, authenticated, service_role;

alter table public.glossary_link_terms enable row level security;

-- The raw table is admin-only. Readers use the view above.
drop policy if exists glossary_link_terms_admin_all on public.glossary_link_terms;
create policy glossary_link_terms_admin_all
  on public.glossary_link_terms
  for all
  -- `public.is_admin()` has no zero-argument overload on this database; the
  -- `(select auth.uid())` wrapper is the form that lets the planner hoist it
  -- out of the per-row loop.
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

grant select, insert, update, delete on public.glossary_link_terms to authenticated;
grant all on public.glossary_link_terms to service_role;

-- ---------------------------------------------------------------------------
-- Postconditions. These exercise the real objects rather than restating their
-- predicates: a restated gate is a second copy that can drift from the first.
-- Rows are inserted and removed inside this transaction, so the table still
-- ships empty — nothing links until a human activates a seeded candidate.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_prep uuid;
  v_adult uuid;
  v_key text;
  v_cnt int;
begin
  -- PrEP is the load-bearing case for the gate choice: is_sensitive = true but
  -- verification_status = 'reviewed', so it is NOT anon-gated and MUST remain
  -- linkable. A blanket `not is_sensitive` would silently drop it along with
  -- Poppers and Naloxone.
  select id into v_prep from public.unified_tags where slug = 'prep' limit 1;
  select id into v_adult
    from public.unified_tags
   where status = 'active' and coalesce(is_adult, false)
     and coalesce(seo_indexable, false)
     and nullif(btrim(coalesce(description, short_description, long_description, '')), '') is not null
   limit 1;

  if v_prep is null or v_adult is null then
    raise notice 'glossary_link_terms: fixture tags absent, structural checks only';
  else
    insert into public.glossary_link_terms (tag_id, surface_form, status)
      values (v_prep, '  PrEP  ', 'active')
      returning surface_form_key into v_key;
    if v_key <> 'prep' then
      raise exception 'surface_form_key normalisation disagrees with the matcher: %', v_key;
    end if;

    select count(*) into v_cnt from public.glossary_link_terms_public where slug = 'prep';
    if v_cnt <> 1 then
      raise exception 'a sensitive-but-reviewed term must stay linkable, got % rows', v_cnt;
    end if;

    -- An adult term must never reach a renderer, whatever its status says.
    insert into public.glossary_link_terms (tag_id, surface_form, status)
      values (v_adult, 'zzz adult fixture term', 'active');
    select count(*) into v_cnt
      from public.glossary_link_terms_public p
      join public.unified_tags u on u.slug = p.slug
     where u.id = v_adult;
    if v_cnt <> 0 then
      raise exception 'an adult term reached the public view (% rows)', v_cnt;
    end if;

    -- The tombstone: a refused surface form can never be re-proposed.
    begin
      insert into public.glossary_link_terms (tag_id, surface_form) values (v_prep, 'prep');
      raise exception 'the unique key did not block a duplicate surface form';
    exception when unique_violation then null;
    end;

    delete from public.glossary_link_terms;
  end if;

  -- A one-character surface form is what the whole review exists to stop; the
  -- schema refuses it even if review is bypassed.
  begin
    insert into public.glossary_link_terms (tag_id, surface_form)
      values (coalesce(v_prep, (select id from public.unified_tags limit 1)), 'A');
    raise exception 'a one-character surface form was accepted';
  exception when check_violation then null;
  end;

  if (select count(*) from public.glossary_link_terms) <> 0 then
    raise exception 'glossary_link_terms must ship empty';
  end if;
end $verify$;
