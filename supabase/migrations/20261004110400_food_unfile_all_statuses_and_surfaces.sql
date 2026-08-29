-- The food-unfiling loop in 20261003110400 was narrower than the defect it
-- repaired, in two independent ways. Both are fixed here, on the same 81 slugs.
--
-- FAULT 1 — THE STATUS GATE MADE A LIVE FOOD TAG UNREACHABLE, AND THAT ABORTED
-- EVERY MIGRATION IN THE REPO
--
-- That loop read `where slug = r.slug and status = 'deprecated'`, and its
-- comment made the omission deliberate: "A food slug that somehow went live
-- again is left alone and shows up in the assertion below instead." The
-- assertion is `raise exception`, and `supabase db push` applies in version
-- order and stops at the first error — so a single live food tag does not
-- surface a row for review, it stops the entire chain, repo-wide, for everyone.
--
-- It did. `deploy-supabase-functions` on 2026-08-29 ran the SAME commit
-- (9353d042a) three times:
--
--   05:21  ERROR: aliases/hygiene: 2 alias(es) shorter than 3 characters
--   05:23  ERROR: aliases/hygiene: 3 food tag(s) still filed as substances
--   05:25  success
--
-- Nothing in the repo changed between those runs. The rows the assertions named
-- were edited on production by hand until the assertions stopped firing — which
-- is how three live food tags came to be deprecated with no migration recording
-- it. The code path that could not handle them was never exercised.
--
-- Being live makes a miscategorised tag WORSE, not safer: a deprecated
-- `waffles` filed under Substances & Harm Reduction is an admin-count defect,
-- a live one is a reader-visible claim. So the loop below unfiles regardless of
-- status. It never changes status itself — a food tag that is live stays live
-- and keeps its prose, it simply stops being a substance — and an assertion
-- pins that, so this migration cannot quietly become a deprecation sweep.
--
-- FAULT 2 — THE UPDATE WAS GATED ON `category_id`, SO TEXT-ONLY FILINGS SURVIVED
--
-- That loop deleted the junction row unconditionally but then ran
-- `update unified_tags set category_id = null, category = null
--    where id = v_tag_id and category_id = v_cat_id`.
-- A tag filed as a substance ONLY by the denormalized `category` text — no
-- `category_id`, no `tag_category_assignments` row — never matched that gate,
-- so its junction row was removed (there was none) and its text was left
-- standing. Measured on prod after 20261003110400 applied: **20 of the 81 food
-- slugs still read `category = 'Substances & Harm Reduction'`**, every one of
-- them with `category_id IS NULL` and zero assignments — applesauce,
-- caesar-salad, chevre, cole-slaw, confit, curry-sauce, danishes, gastronomy,
-- green-peppers, hot-cheese, maple, mint, picante, porchetta, roasted-chicken,
-- roasted-garlic, tasting-menu, tuna-toasts, vanilla-yogurt, white-chocolate.
--
-- The old assertion did not catch this because it sampled TEN slugs
-- (avocado, waffles, grits, patty-melt, elotes, tartines, chocolate-fondue,
-- wisdom-teeth, mozzarella, guava) and not one of the 20 survivors is among
-- them. A sample that happens to contain only rows the loop could reach proves
-- the loop reached the rows it could reach. The assertion below is taken over
-- the FULL 81, across all three filing surfaces.
--
-- Text-only filing is not a curiosity of the food rows: 39 of the 276 tags whose
-- `category` text names this category carry `category_id IS NULL`. Twenty are
-- the food slugs above. The other nineteen — aperitivo, bitters, bratwurst,
-- cachaca, day-drinking, drug-education, hot-chocolate, kombucha, liqueurs,
-- matcha, mezcal, moscow-mule, painkillers, pilsner, pinot-grigio, rye,
-- schnapps, tequila, tropical-drinks — are NOT all defensible, and an earlier
-- draft of this header claimed they were without reading them. Thirteen are
-- alcohol and two (drug-education, painkillers) are squarely in scope, but
-- bratwurst is a sausage and hot-chocolate, kombucha and matcha are ordinary
-- drinks. All nineteen are `deprecated`, so none is reader-visible, and none is
-- in the 81-slug cohort 20261003110400 defined. They are left alone
-- DELIBERATELY: unfiling slugs the original list never named is a second
-- vocabulary decision, and widening a repair migration past its reviewed scope
-- is the move to avoid, not the thorough one.
--
-- WHY THE TEXT IS RECOMPUTED RATHER THAN NULLED
--
-- `sync_tag_category_assignment` only writes `unified_tags.category` when the
-- new `category_id` is NOT NULL, so clearing the id alone leaves the text behind
-- — that is the trap 20261003110400 documented and then half-fell into. Setting
-- the text to a flat NULL would be the mirror mistake for any row that also
-- belongs to some other category. Measured: zero food rows are in that shape
-- today (0 of 276 substance-texted rows carry a different non-null
-- `category_id`), but the UPDATE derives the text from whatever `category_id`
-- survives so the shape cannot go wrong later.

set local statement_timeout = '600s';

do $mig$
declare
  v_cat_id     uuid;
  v_cat_name   text;
  v_tag_id     uuid;
  v_live_before int;
  v_live_after  int;
  v_fixed      int := 0;
  v_n          int;
  r            record;
begin
  perform set_config('app.actor', 'admin:food-unfile-all-surfaces', true);

  select id, name into strict v_cat_id, v_cat_name
    from public.tag_categories where slug = 'substances-harm-reduction';

  create temp table _food (slug text primary key) on commit drop;
  insert into _food (slug)
  select unnest(array[
    'applesauce','avocado','bay','beef-tartare','beef-tongue','belgian',
    'big-portions','broccoli','caesar-salad','cashews','cheese','cherry-sauce',
    'chevre','chicken-tamales','chocolate-fondue','cole-slaw','confit',
    'coriander','cranberries','creamy-mushrooms','creme-brulee','curry-sauce',
    'danishes','eggplant','eggs','elotes','french-toast','fresh-ginger',
    'fresh-lime-juice','fried-zucchini','frijoles','gambas','garlic',
    'gastronomy','green-peppers','green-sauce','grits','guava','hot-cheese',
    'hot-potatoes','insalata','jams','lollipops','mackerel','maigre','maple',
    'menudo','mint','mozzarella','mustard','nuts','oat-milk','orange-juice',
    'patty-melt','picante','pistachios','porchetta','potato-chips',
    'pretzels-and-sausage','pudding','red-onions','rillettes','roasted-chicken',
    'roasted-garlic','scrambled-eggs','sea-salt','seasonal-fruits',
    'sesame-seeds','skewers','sour-cherries','spicy-dogs','tangerine',
    'tartines','tasting-menu','tuna-toasts','vanilla-yogurt','waffles',
    'white-chocolate','wild-boar-sloppy-joe','wisdom-teeth','yams'
  ]);

  -- Snapshot for the "status is never touched" assertion below.
  select count(*) into v_live_before
    from _food f join public.unified_tags t on t.slug = f.slug
   where t.status <> 'deprecated';

  ---------------------------------------------------------------------------
  -- Unfile. No status filter, and all three filing surfaces.
  ---------------------------------------------------------------------------
  for r in select slug from _food order by slug loop
    select id into v_tag_id from public.unified_tags where slug = r.slug;
    continue when v_tag_id is null;

    delete from public.tag_category_assignments
     where tag_id = v_tag_id and category_id = v_cat_id;

    update public.unified_tags t
       set category_id = nullif(t.category_id, v_cat_id),
           -- Derived from whatever id survives, so a row that belongs to
           -- another category keeps that category's name instead of a NULL.
           category = (
             select c.name from public.tag_categories c
              where c.id = nullif(t.category_id, v_cat_id)
           ),
           updated_at = now()
     where t.id = v_tag_id
       and (t.category_id = v_cat_id or t.category = v_cat_name);
    if found then v_fixed := v_fixed + 1; end if;
  end loop;

  ---------------------------------------------------------------------------
  -- Assertions. Over the full 81, over every surface.
  ---------------------------------------------------------------------------
  select count(*) into v_n
    from _food f join public.unified_tags t on t.slug = f.slug
   where t.category = v_cat_name
      or t.category_id = v_cat_id
      or exists (
           select 1 from public.tag_category_assignments ca
            where ca.tag_id = t.id and ca.category_id = v_cat_id);
  if v_n > 0 then
    raise exception 'food unfile: % food tag(s) still filed as substances on some surface', v_n;
  end if;

  -- This migration unfiles; it does not retire. A change here means the loop
  -- grew a side effect on status.
  select count(*) into v_live_after
    from _food f join public.unified_tags t on t.slug = f.slug
   where t.status <> 'deprecated';
  if v_live_after is distinct from v_live_before then
    raise exception 'food unfile: status changed (% live before, % after) — this migration must never retire a tag',
      v_live_before, v_live_after;
  end if;

  -- The rows must still exist and must not have been merged away.
  select count(*) into v_n
    from _food f left join public.unified_tags t on t.slug = f.slug
   where t.id is not null and (t.status = 'merged' or t.merged_into_id is not null);
  if v_n > 0 then
    raise exception 'food unfile: % food tag(s) were merged rather than unfiled', v_n;
  end if;

  raise notice 'food unfile: % row(s) repaired, % still live (unchanged), all 81 clear of the category',
    v_fixed, v_live_after;
end
$mig$;
