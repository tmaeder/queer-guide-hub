-- Four prod edits made by hand on 2026-08-29, written down.
--
-- WHY THIS EXISTS
--
-- 20261003110400_substance_aliases_and_category_hygiene closes with five
-- assertions. Three of them failed against live prod on three consecutive
-- deploys, each time aborting `db push` and blocking every merged migration
-- behind it (including four kinktionary revival waves and two of my own):
--
--   1. aliases/hygiene: 1 ordinary-word alias(es) are approved and therefore
--      auto-tagging rules
--   2. aliases/hygiene: 2 alias(es) shorter than 3 characters
--   3. aliases/hygiene: 3 food tag(s) still filed as substances
--
-- None was caused by that migration. All three are PRE-EXISTING state that its
-- own repair steps cannot reach, so it asserted a corpus invariant it had no
-- way to establish. I cleared each by hand with raw SQL to unblock the queue.
-- Those edits were correct but existed in no file, so a database rebuilt from
-- migrations alone would fail at exactly the same three assertions. This
-- migration is that missing file.
--
-- IT IS DELIBERATELY STAMPED BELOW 20261003110400. `db push` applies in version
-- order and aborts at the first failure, so a precondition stamped above the
-- migration that needs it is worthless on a rebuild. Applied via MCP first and
-- committed at the stamped version, per the CLAUDE.md early-apply convention;
-- check-migration-versions exempts an already-applied version. On prod every
-- statement below is already a no-op — its value is reproducibility, not effect.
--
-- WHAT WAS CHANGED, AND WHY EACH IS THE RULE THAT MIGRATION ITSELF STATES
--
-- (1) alias "Speed" -> amphetamine, review_status 'approved' -> 'auto'.
--     `approved` IS an auto-tagging rule: run_tag_assignment_reconcile builds
--     its map from approved aliases, and 20260910151200 made review_status the
--     gate precisely so an unreviewed alias cannot tag content. "Speed" is an
--     ordinary English word, so as an approved alias it would tag any content
--     mentioning speed as amphetamine. Demoted, not deleted — the alias is real
--     vocabulary and stays searchable; it just stops being a tagging rule.
--
-- (2) aliases "MD" -> ecstasy and "K2" -> synthetic-cannabinoids, DELETED.
--     Both are genuine street names, and deleting them loses real vocabulary —
--     that is a cost, not a tidy-up. But the rule is absolute and length-based
--     (`length(alias_name) < 3` raises regardless of review_status), and a
--     two-character alias is the worst case of the problem in (1): "MD" matches
--     a title, a degree and an American state abbreviation. If these terms are
--     wanted back they must be re-added in a form the rule permits — "MDMA"
--     already exists as an alias; a "K2 spice"-style form would be the
--     equivalent for the other.
--
-- (3) `category` TEXT cleared on mozzarella, patty-melt and waffles.
--     This one is a defect in the unfiling loop, not stale data. That loop ends
--     with `update ... set category_id = null, category = null where id = v_tag_id
--     and category_id = v_cat_id` — guarded on category_id. These three rows
--     already had category_id NULL while their TEXT column still read
--     'Substances & Harm Reduction', so the guard skipped them and left the
--     text standing. The assertion immediately below then counts by TEXT, so
--     the migration failed on rows its own repair had declined to touch. The
--     three are food; none is a substance.

select set_config('app.actor', 'migration:substance-alias-hygiene-preconditions', true);

do $mig$
declare v_cat uuid; v_n int; v_speed int; v_short int; v_food int;
begin
  select id into v_cat from public.tag_categories where name = 'Substances & Harm Reduction';
  if v_cat is null then
    raise exception 'substance alias preconditions: category vocabulary is missing';
  end if;

  -- (1) Ordinary-word aliases must not be auto-tagging rules. Scoped to the
  -- same vocabulary the consuming migration lists, so the two files cannot
  -- disagree about which words are "ordinary".
  update public.tag_aliases a
     set review_status = 'auto'
    from public.unified_tags t
   where t.id = a.canonical_tag_id
     and t.category = 'Substances & Harm Reduction'
     and a.review_status = 'approved'
     and lower(a.alias_name) in (
       'pilze','gras','schnee','trüffel','blüten','pappen','filze','speed',
       'pep','acid','blotter','ice','koks','emma','pillen','ballon','oxy',
       'lean','meow','downer','benzos','alk','hero','shore','ket','keti',
       'toleranz','entzug','mischkonsum'
     );
  get diagnostics v_speed = row_count;

  -- (2) No alias under three characters in this category.
  delete from public.tag_aliases a
   using public.unified_tags t
   where t.id = a.canonical_tag_id
     and t.category = 'Substances & Harm Reduction'
     and length(a.alias_name) < 3;
  get diagnostics v_short = row_count;

  -- (3) Food that is not a substance must not keep the category TEXT after the
  -- category_id-guarded unfiling loop has skipped it.
  update public.unified_tags
     set category = null, updated_at = now()
   where category = 'Substances & Harm Reduction'
     and category_id is null
     and slug in (
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
     );
  get diagnostics v_food = row_count;

  ----------------------------------------------------------------- assertions
  -- The three preconditions 20261003110400 requires, asserted here where they
  -- are established rather than discovered by a failed deploy.
  select count(*) into v_n
    from public.tag_aliases a join public.unified_tags t on t.id = a.canonical_tag_id
   where t.category = 'Substances & Harm Reduction' and length(a.alias_name) < 3;
  if v_n > 0 then
    raise exception 'substance alias preconditions: % alias(es) still under 3 characters', v_n;
  end if;

  select count(*) into v_n
    from public.tag_aliases a join public.unified_tags t on t.id = a.canonical_tag_id
   where t.category = 'Substances & Harm Reduction'
     and a.review_status = 'approved'
     and lower(a.alias_name) in (
       'pilze','gras','schnee','trüffel','blüten','pappen','filze','speed',
       'pep','acid','blotter','ice','koks','emma','pillen','ballon','oxy',
       'lean','meow','downer','benzos','alk','hero','shore','ket','keti',
       'toleranz','entzug','mischkonsum'
     );
  if v_n > 0 then
    raise exception 'substance alias preconditions: % ordinary-word alias(es) still approved', v_n;
  end if;

  select count(*) into v_n from public.unified_tags
   where category = 'Substances & Harm Reduction'
     and slug in ('avocado','waffles','grits','patty-melt','elotes','tartines',
                  'chocolate-fondue','wisdom-teeth','mozzarella','guava');
  if v_n > 0 then
    raise exception 'substance alias preconditions: % food tag(s) still filed as substances', v_n;
  end if;

  raise notice 'substance alias preconditions: % demoted, % deleted, % unfiled (0/0/0 on prod, where this is a replay)',
    v_speed, v_short, v_food;
end
$mig$;
