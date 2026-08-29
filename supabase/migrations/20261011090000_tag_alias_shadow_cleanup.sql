-- 94 tag_aliases rows shadowed an ACTIVE unified_tags slug (measured on prod
-- 2026-08-29). tag_alias_reject_shadow() blocks this shape on INSERT/UPDATE,
-- so all 94 predate the trigger or arrived through paths that bypass it. Every
-- row was read individually against both tags' prose; three dispositions:
--
--   (1) 39 SELF-ALIASES — alias_slug equals the parent tag's own slug
--       (ac-dc -> ac-dc, drag-queen -> drag-queen, ...). Pure junk; deleted by
--       predicate, not by list, so any row a concurrent session adds in the
--       same shape dies too. The predicate also catches 88 rows of the same
--       shape whose parent is already deprecated/merged — invisible to the
--       active-only measurement, equally worthless (a self-alias redirects
--       nowhere), so the dry run measured 127, not 39.
--
--   (2) 32 WRONG-CONCEPT ALIASES — the alias string names a genuinely
--       DIFFERENT concept than its parent, so the alias (a silent auto-tagging
--       rule) is the bug and the active tag is right. Examples:
--       'queening' -> face-sitting shadows the drag-performance tag;
--       'femme' -> spouse (FR femme = wife) shadows the core lesbian identity;
--       'it' -> italy is the ISO-code-as-ordinary-word class;
--       'partner' -> life-partner shadows the word every business article uses.
--       15 of the 32 point at parents already 'deprecated'/'merged'
--       (bareback -> barebacking, mdma -> ecstasy, sport -> sports, ...) —
--       stale trails where the SHADOW is the live concept. Deleted by
--       (alias_slug, parent_slug) pair, guarded on the shadow still being
--       active, so a pair a sibling session already resolved is skipped.
--
--   (3) 23 TRUE TWINS — parent and shadow are the same concept and belong to
--       merge_tag_concept (asexual/asexuality, sildenafil/viagra,
--       gay-pride/lgbt-pride, ...). 22 merges (swinger AND swinging both fold
--       into swinging-sexual-practice). Three pairs merge AGAINST the alias
--       direction, keeping the community-standard, correctly-categorized name:
--       demiboy (Gender) wins over demiman (misfiled Orientation),
--       demigirl (Gender) over demifemme (misfiled Slang & Language),
--       vaginismus (Sexual Health) over sexual-pain-penetration-disorder
--       (misfiled Fetishes — a medical condition must not publish as a
--       fetish). For those three the alias row occupies the WINNER's slug and
--       is deleted, and its search_synonyms rewrite dies with it (FK is
--       ON DELETE SET NULL, so an unclaimed synonym would otherwise keep
--       rewriting 'vaginismus' queries toward the merged loser).
--
-- Trap handling, in order of the wounds they reopen:
--   * merge_tag_concept re-parents the loser's category rows VERBATIM,
--     is_primary included (two-primaries trap, repaired twice already; the
--     one-primary unique index lands in 20261008130000 and would turn the
--     third occurrence into a hard abort of this whole migration). The
--     loser's primaries are demoted BEFORE each merge whenever the winner
--     already holds one.
--   * merge_tag_concept does NOT re-parent the loser's OTHER aliases
--     (cornudo/cocu/hahnrei -> cuckold, vaginismo/vaginisme/scheidenkrampf ->
--     sexual-pain-penetration-disorder, ...). They are re-parented here,
--     guarded against the shadow trigger, which fires on UPDATE too.
--   * The surviving redirect alias (loser slug -> winner) is promoted to
--     ('synonym','approved') to match what merge_tag_concept writes when it
--     creates the trail itself — an 'auto' redirect is invisible to
--     run_tag_assignment_reconcile since 20260910151200.
--
-- Kept deliberately: lycan/werewolf and milf/milf-porn stay separate tags
-- (distinct prose, defensible distinction) — only their aliases die.

set local statement_timeout = '600s';

do $$
declare
  v_n int;
  v_canon uuid; v_canon_slug text; v_dup uuid; v_dup_status text;
  v_merged int := 0; v_skipped int := 0;
  r record;
begin
  perform set_config('app.actor', 'migration:20261011090000_tag_alias_shadow_cleanup', true);

  ---------------------------------------------------------------------------
  -- (1) self-aliases: alias_slug = the parent's own slug
  ---------------------------------------------------------------------------
  delete from public.search_synonyms s
   using public.tag_aliases al, public.unified_tags t
   where s.tag_alias_id = al.id
     and t.id = al.canonical_tag_id and t.slug = al.alias_slug;

  delete from public.tag_aliases al
   using public.unified_tags t
   where t.id = al.canonical_tag_id
     and t.slug = al.alias_slug;
  get diagnostics v_n = row_count;
  raise notice 'self-aliases deleted: % (dry run measured 127)', v_n;

  ---------------------------------------------------------------------------
  -- (2) wrong-concept aliases: the shadowed active tag is the real concept
  ---------------------------------------------------------------------------
  with doomed(alias_slug, parent_slug) as (values
    ('agender','enby'),                       -- agender is its own identity, not an enby synonym
    ('bareback','barebacking'),               -- parent deprecated; shadow is the live tag
    ('cocaine','crack-cocaine'),              -- parent merged away; cocaine != crack
    ('community-center','community-center-venue'), -- parent deprecated
    ('country-music','country'),              -- active country-music tag is the genre's home
    ('demigender','enby'),                    -- demigender is its own umbrella identity
    ('diazepam','valium'),                    -- parent merged away
    ('femme','spouse'),                       -- FR 'femme'=wife; shadow is the lesbian identity
    ('flunitrazepam','rohypnol'),             -- parent deprecated
    ('gender-neutral','neutrois'),            -- adjective vs identity
    ('gutsbesitzer','lady-of-the-manor'),     -- gendered mismatch, both junky profession imports
    ('it','italy'),                           -- ISO code = ordinary English word
    ('ketamine','special-k'),                 -- parent deprecated
    ('lake','pool'),                          -- a lake is not a pool
    ('lorazepam','ativan'),                   -- parent deprecated
    ('lsd','acid'),                           -- parent deprecated
    ('lycan','werewolf'),                     -- shadow has distinct BDSM-archetype prose; keep both tags
    ('maestro','educator'),                   -- ES 'maestro'=teacher collision
    ('man','peanuts'),                        -- absurd junk row
    ('mdma','ecstasy'),                       -- parent deprecated
    ('milf','milf-porn'),                     -- slang term vs porn genre; keep both tags
    ('monosexual','monosexuality'),           -- parent deprecated
    ('partner','life-partner'),               -- ordinary-word collision
    ('pcp','phencyclidine'),                  -- parent deprecated
    ('polyfidelity','polyamory'),             -- polyfidelity is a distinct structure
    ('queening','face-sitting'),              -- shadows the drag-performance tag
    ('richter','justice'),                    -- DE 'richter'=judge collision
    ('rudern','crew'),                        -- DE 'rudern'=rowing collision
    ('salon','lounge'),                       -- shadow is the rope-bondage salon concept
    ('single','single-person'),               -- parent deprecated
    ('situationship','casual-dating'),        -- parent deprecated; shadow is the live tag
    ('sport','sports')                        -- parent merged away; shadow is the live tag
  ),
  victims as (
    select al.id
      from public.tag_aliases al
      join public.unified_tags p on p.id = al.canonical_tag_id
      join doomed d on d.alias_slug = al.alias_slug and d.parent_slug = p.slug
     where exists (select 1 from public.unified_tags s
                    where s.slug = al.alias_slug and s.status = 'active')
  ),
  syn as (
    delete from public.search_synonyms s
     where s.tag_alias_id in (select id from victims)
    returning 1
  )
  delete from public.tag_aliases al where al.id in (select id from victims);
  get diagnostics v_n = row_count;
  raise notice 'wrong-concept aliases deleted: % (expected 32)', v_n;

  ---------------------------------------------------------------------------
  -- (3) reversed twins: the alias occupies the WINNER's slug — delete before
  --     merging, and take the synonym rewrite with it
  ---------------------------------------------------------------------------
  with doomed(alias_slug, parent_slug) as (values
    ('demiboy','demiman'),
    ('demigirl','demifemme'),
    ('vaginismus','sexual-pain-penetration-disorder')
  ),
  victims as (
    select al.id
      from public.tag_aliases al
      join public.unified_tags p on p.id = al.canonical_tag_id
      join doomed d on d.alias_slug = al.alias_slug and d.parent_slug = p.slug
  ),
  syn as (
    delete from public.search_synonyms s
     where s.tag_alias_id in (select id from victims)
    returning 1
  )
  delete from public.tag_aliases al where al.id in (select id from victims);
  get diagnostics v_n = row_count;
  raise notice 'reversed-twin aliases deleted: % (expected 3)', v_n;

  ---------------------------------------------------------------------------
  -- (4) twin merges
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('asexuality','asexual'),
      ('asexuality','asexuell'),
      ('coffee-shop','coffee-bar'),
      ('cuckolding','cuckold'),
      ('daddy','papi'),
      ('demiboy','demiman'),
      ('demigirl','demifemme'),
      ('demisexuality','demisexual'),
      ('doctor','arzt'),
      ('eating-pussy','cunnilingus'),
      ('flashing','exhibitionist'),
      ('intersectional','intersectionality'),
      ('lgbt-pride','gay-pride'),
      ('neurodivergence','neurodivergent'),
      ('otters','otter'),
      ('pro-domme','domina'),
      ('swinging-sexual-practice','swinger'),
      ('swinging-sexual-practice','swinging'),
      ('urophilia','urolagnia'),
      ('vaginismus','sexual-pain-penetration-disorder'),
      ('vampires','vampire'),
      ('viagra','sildenafil')
    ) as m(canon_slug, dup_slug)
  loop
    select id into v_canon from public.unified_tags where slug = r.canon_slug;
    select id, status into v_dup, v_dup_status from public.unified_tags where slug = r.dup_slug;

    -- A sibling session may have merged or retired either side already;
    -- skip rather than abort — the remaining pairs still deserve their fix.
    if v_canon is null or v_dup is null or v_dup_status <> 'active' then
      v_skipped := v_skipped + 1;
      raise notice 'merge skipped (state moved): % <- %', r.canon_slug, r.dup_slug;
      continue;
    end if;

    -- Two-primaries trap: demote the loser's primary filings before the merge
    -- re-parents them verbatim, but only when the winner already has a primary
    -- (zero primaries is worse than inheriting one).
    update public.tag_category_assignments
       set is_primary = false
     where tag_id = v_dup and is_primary
       and exists (select 1 from public.tag_category_assignments
                    where tag_id = v_canon and is_primary);

    perform public.merge_tag_concept(v_canon, v_dup,
      'migration:20261011090000', 'alias-shadow-repair');
    v_merged := v_merged + 1;

    -- The loser's other aliases are NOT re-parented by the merge core.
    -- An alias equal to the winner's slug must die, never move (part 3 got
    -- the known three; this catches drift). The rest move, guarded against
    -- the shadow trigger, which also fires on UPDATE of canonical_tag_id.
    delete from public.tag_aliases
     where canonical_tag_id = v_dup and lower(alias_slug) = lower(r.canon_slug);
    update public.tag_aliases al
       set canonical_tag_id = v_canon
     where al.canonical_tag_id = v_dup
       and not exists (select 1 from public.unified_tags u
                        where lower(u.slug) = lower(al.alias_slug)
                          and u.status = 'active' and u.id <> v_canon);

    -- The surviving redirect trail must be what merge_tag_concept would have
    -- written had it created it: ('synonym','approved').
    update public.tag_aliases
       set alias_type = 'synonym', review_status = 'approved'
     where alias_slug = r.dup_slug and canonical_tag_id = v_canon
       and (alias_type <> 'synonym' or review_status <> 'approved');
  end loop;

  raise notice 'twin merges: % done, % skipped', v_merged, v_skipped;

  ---------------------------------------------------------------------------
  -- (5) verify
  ---------------------------------------------------------------------------
  select count(*) into v_n from (
    select tag_id from public.tag_category_assignments
     where is_primary group by tag_id having count(*) > 1) x;
  if v_n > 0 then
    raise exception 'alias-shadow repair left % tag(s) with two primary categories', v_n;
  end if;

  select count(*) into v_n
    from public.tag_aliases al
    join public.unified_tags t on t.slug = al.alias_slug and t.status = 'active'
   where al.canonical_tag_id <> t.id;
  raise notice 'aliases still shadowing a different active tag: % (0 unless a sibling session added new ones)', v_n;
end $$;
