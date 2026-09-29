-- One retired maker URL is still a 200 dead end: the backfill covered 12 of my 13.
--
-- `99991790384358` filled `marketplace_brand_slug_redirects` and sealed the
-- producer, which is the right fix and is why 12 of the 13 slugs retired by
-- `20260919194058` / `20260920083621` / `20260920084019` now 301 to their
-- survivor. **`mr-s-leather-77da` was missed** and still answers HTTP 200 with
-- "No maker here" beside a live `/marketplace/brands/mr-s-leather` (139
-- listings) — verified on prod 2026-09-26 by curl and by the e2e, which is red on
-- exactly that one row while the other twelve pass.
--
-- A 200 empty state is the defect `99991790384358`'s own header names: worse for
-- the index than a 404 because it looks alive, and worse for a reader than a 301
-- because it is a dead end next to a live page. One row is still one row.
--
-- ── WHY IT WAS MISSED, AND WHY THIS FILE DOES NOT GUESS ──
-- That backfill derives its cohort from previous slugs recorded in
-- `content_revisions`. This retirement is the one whose RETIRED row carries
-- `brand_key = 'mr-s-leather'` while its SURVIVOR holds `slug = 'mr-s-leather'` —
-- the same string in two different columns on two different rows — so any
-- key/slug-shaped lookup over that cohort is ambiguous for this pair and for no
-- other. Rather than re-deriving the target by name (the "never resolve by name
-- alone" rule this repo applies to city links, news links and brand logos), this
-- reads the authoritative record the retiring migration LEFT ON THE ROW:
--
--     auto-merge brand-canon: same brand as brand_key=<survivor> (...);
--     listings re-keyed, editorial content carried. prior slug=<old slug>
--
-- Both the survivor's `brand_key` and the dead slug are parsed out of that
-- stamp. That stamp was written in a machine-readable shape on purpose; this is
-- the first time it has been read back, and it is the reason no id is hardcoded
-- here.
--
-- ── IT CLOSES THE CLASS, NOT THE INSTANCE ──
-- The insert covers EVERY row retired by those merges whose prior slug has no
-- redirect yet, so it is idempotent (12 are already present and are skipped by
-- `on conflict do nothing`) and it would also cover a future gap of the same
-- shape. `reason = 'consolidated_duplicate'` matches what `99991790384358` used
-- for this cohort, so the two are indistinguishable afterwards.
--
-- ── THE GUARDS ARE THE WHOLE VALUE ──
-- A redirect to a row with a NULL slug, or to a row that is not published, is a
-- redirect that silently does nothing — indistinguishable from the soft 404 it
-- was meant to replace, which is `99991790384358`'s own stated failure mode. So
-- the target must be approved AND slugged, and the old slug must not be held by
-- any live row (redirecting a URL that still resolves would shadow a real page).
-- The postcondition then re-reads the table rather than trusting the INSERT's
-- row count: `on conflict do nothing` reports zero for both "already correct" and
-- "refused by a guard", and those are not the same outcome.

begin;

with retired as (
  select
    b.id,
    -- the stamp is `... prior slug=<slug>` and is the last field, so take the tail
    nullif(btrim(split_part(b.reviewer_note, 'prior slug=', 2)), '') as old_slug,
    -- and `... brand_key=<key> (` — stop at the space before the parenthetical
    nullif(btrim(split_part(split_part(b.reviewer_note, 'brand_key=', 2), ' (', 1)), '')
      as survivor_key
  from public.marketplace_brands b
  where b.reviewer_note like '%auto-merge brand-canon%'
    and b.slug is null
), eligible as (
  select r.old_slug, s.id as brand_id
  from retired r
  join public.marketplace_brands s on s.brand_key = r.survivor_key
  where r.old_slug is not null
    and r.old_slug <> '(null)'
    and r.survivor_key is not null
    -- the target must actually be able to serve the redirect
    and s.status = 'approved'
    and s.slug is not null
    -- and the dead slug must really be dead: never shadow a live page
    and not exists (select 1 from public.marketplace_brands x where x.slug = r.old_slug)
)
insert into public.marketplace_brand_slug_redirects (old_slug, brand_id, reason)
select old_slug, brand_id, 'consolidated_duplicate' from eligible
on conflict (old_slug) do nothing;

do $verify$
declare
  v_missing   int;
  v_unfixable int;
  v_txt     text;
  v_broken  int;
begin
  -- a. every slug that NEEDS a redirect and CAN have one now has it.
  --
  --    Both qualifiers were added after this file's own dry run on a throwaway
  --    Postgres 17 raised on a perfectly correct state — the `20810101100100`
  --    failure mode, which aborts `db push` on main and strands every migration
  --    queued behind it. Two shapes must be excluded, and neither is a defect:
  --
  --    * A SHAPE-B prior slug is now held by the SURVIVOR. `20260920083621` and
  --      `20260920084019` free the clean slug off the retiring row and re-claim it
  --      (`fort-troff`, `mr-riegillio`, `rocks-off`, `strap-on-me`), so that URL
  --      already resolves to the right page. Redirecting it would shadow a live
  --      page, which is why the INSERT refuses it — so demanding a redirect for it
  --      contradicts the insert one block above.
  --    * A survivor that is not approved+slugged cannot be a redirect target at
  --      all. Those are REPORTED, not raised: this file cannot fix them and
  --      failing on them would block the repo over someone else's row.
  --
  --    Re-read the table rather than trusting the INSERT's count: `on conflict do
  --    nothing` reports 0 both when the row was already right and when a guard
  --    refused it, and those are not the same outcome.
  select count(*), string_agg(t.old_slug, ', ') into v_missing, v_txt
  from (
    select
      nullif(btrim(split_part(b.reviewer_note, 'prior slug=', 2)), '') as old_slug,
      nullif(btrim(split_part(split_part(b.reviewer_note, 'brand_key=', 2), ' (', 1)), '')
        as survivor_key
    from public.marketplace_brands b
    where b.reviewer_note like '%auto-merge brand-canon%' and b.slug is null
  ) t
  where t.old_slug is not null
    and t.old_slug <> '(null)'
    -- excluded: the slug is live again on the survivor (Shape B re-claim)
    and not exists (select 1 from public.marketplace_brands x where x.slug = t.old_slug)
    -- excluded: no usable target exists, reported below instead
    and exists (
      select 1 from public.marketplace_brands s
      where s.brand_key = t.survivor_key and s.status = 'approved' and s.slug is not null
    )
    and not exists (
      select 1 from public.marketplace_brand_slug_redirects r where r.old_slug = t.old_slug
    );
  if v_missing <> 0 then
    raise exception 'brand redirect: % retired slug(s) still have no redirect: %', v_missing, v_txt;
  end if;

  -- a2. the unfixable residue, named rather than silently passed over.
  select count(*), string_agg(t.old_slug, ', ') into v_unfixable, v_txt
  from (
    select
      nullif(btrim(split_part(b.reviewer_note, 'prior slug=', 2)), '') as old_slug,
      nullif(btrim(split_part(split_part(b.reviewer_note, 'brand_key=', 2), ' (', 1)), '')
        as survivor_key
    from public.marketplace_brands b
    where b.reviewer_note like '%auto-merge brand-canon%' and b.slug is null
  ) t
  where t.old_slug is not null
    and t.old_slug <> '(null)'
    and not exists (select 1 from public.marketplace_brands x where x.slug = t.old_slug)
    and not exists (
      select 1 from public.marketplace_brands s
      where s.brand_key = t.survivor_key and s.status = 'approved' and s.slug is not null
    );
  if v_unfixable <> 0 then
    raise notice 'brand redirect: % retired slug(s) have no usable survivor and stay dead ends: %',
      v_unfixable, v_txt;
  end if;

  -- b. the specific row this file exists for, named so a silent no-op cannot pass.
  if not exists (
    select 1
    from public.marketplace_brand_slug_redirects r
    join public.marketplace_brands b on b.id = r.brand_id
    where r.old_slug = 'mr-s-leather-77da'
      and b.slug = 'mr-s-leather'
      and b.status = 'approved'
  ) then
    raise exception 'brand redirect: mr-s-leather-77da does not resolve to the live mr-s-leather row';
  end if;

  -- c. NO redirect anywhere points at an unusable target. A redirect to a
  --    NULL-slug or unapproved row does nothing and looks exactly like the soft
  --    404 it replaced.
  select count(*) into v_broken
  from public.marketplace_brand_slug_redirects r
  left join public.marketplace_brands b on b.id = r.brand_id
  where b.id is null or b.slug is null or b.status <> 'approved';
  if v_broken <> 0 then
    raise exception 'brand redirect: % redirect(s) point at an unusable target', v_broken;
  end if;

  raise notice 'brand redirect OK: every retired merge slug redirects, all targets live';
end $verify$;

commit;
