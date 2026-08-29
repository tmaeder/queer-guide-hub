-- A merge made the weaker page canonical, and three label facts left the site.
--
-- WHAT HAPPENED. `sildenafil` was merged into `viagra` (sildenafil is now
-- status='merged' and /tags/sildenafil 301s to /tags/viagra). The merge kept
-- the surviving row's prose, and the surviving row was the one this audit had
-- never rewritten:
--
--   sildenafil  1,088 chars  the label-checked text from 20261002100100
--   viagra        361 chars  the original auto-generated blurb
--
-- So the generic — the clinical name, the one carrying the corrections — became
-- invisible, and every reader following the redirect lands on the pre-audit
-- stub. Caught by e2e/tags-health-facts.spec.ts, which asserts the label nuance
-- on /tags/sildenafil and now follows the redirect to a page that lacks it.
--
-- WHAT WAS ACTUALLY LOST, and why it is worth a migration rather than a shrug:
--
--   1. There is NO label-stated waiting interval after sildenafil before
--      nitrates. The label says it is unknown. The "wait 24 hours" repeated
--      everywhere is clinical convention derived from the half-life, not
--      something the manufacturer or the FDA has stated. Correcting that was
--      one of the two headline findings of the whole fact-check.
--   2. The sildenafil label is the ONLY one in its class whose contraindications
--      name nitrites in any form — which is what poppers are. That is the
--      sentence that makes the contraindication unambiguous for this readership.
--   3. Guanylate cyclase stimulators (riociguat) are a hard contraindication and
--      are routinely omitted from popular summaries.
--
-- The core safety fact was NOT lost: `viagra`.description already said the drug
-- must never be combined with poppers, which is why 23 of 24 e2e assertions
-- still passed. This is about the three nuances that sat only in the long form.
--
-- NOT REVERSING THE MERGE. One concept on two pages is worse than a brand-named
-- canonical, the redirect works, and `viagra`.description opens "Sildenafil,
-- prescribed for..." so the generic name is on the page. Reversing it would also
-- fight another session's deliberate decision. Porting the prose is the smaller,
-- safer change.
--
-- The orphaned `sildenafil + poppers` row in `substance_interactions` is left
-- in place deliberately: `get_substance_interactions` filters on the other side
-- being active, so it renders nowhere and harms nothing, and `viagra + poppers`
-- already carries the same warning on the same chart. Deleting it would destroy
-- the only record that the pair was ever assessed, and it becomes live again by
-- itself if the merge is ever undone.

select set_config('app.actor', 'admin:viagra-label-facts-20260829', true);

update public.unified_tags set long_description =
'Sildenafil, sold as Viagra, blocks the enzyme PDE5, which lets the signalling molecule cGMP accumulate and relax the smooth muscle of the blood vessels supplying the penis. It also treats pulmonary hypertension.

Nitrates and nitrites work on the same pathway from the other end: they donate nitric oxide, which drives cGMP production. Taken together the two remove both the accelerator''s limit and the brake, and the resulting fall in blood pressure is not self-limiting — fainting, heart attack and stroke are the documented consequences. In a controlled study, adding sildenafil to nitroglycerin produced an extra fall of roughly 24 mmHg systolic.

The sildenafil label is the only one of the four in this class whose contraindications name nitrites explicitly, in any form — which is what poppers are. It also names guanylate cyclase stimulators such as riociguat.

There is no label-stated waiting time. The label says it is unknown when nitrates can be given safely after a dose. The 24-hour figure repeated everywhere is a clinical convention derived from the drug''s half-life, not something the manufacturer or the regulator has stated.'
where slug = 'viagra';

do $verify$
declare v_bad int;
begin
  -- Only what THIS migration changes. An earlier migration in this series
  -- asserted a row a LATER migration repaired and failed `db push` for it;
  -- the rule that came out of that is one guard, one migration's own writes.
  select count(*) into v_bad from public.unified_tags
   where slug = 'viagra'
     and (coalesce(long_description,'') !~* 'convention'
       or coalesce(long_description,'') !~* 'unknown'
       or coalesce(long_description,'') !~* 'riociguat'
       or coalesce(long_description,'') !~* 'nitrite');
  if v_bad > 0 then
    raise exception 'viagra label facts: the canonical page is still missing a label nuance';
  end if;

  -- The page a reader actually lands on must be active. If a later merge moves
  -- `viagra` too, this fires rather than leaving the prose on a hidden row —
  -- which is the exact failure being repaired here.
  select count(*) into v_bad from public.unified_tags
   where slug = 'viagra' and status <> 'active';
  if v_bad > 0 then
    raise exception 'viagra label facts: viagra is not active, so this prose is invisible';
  end if;
end
$verify$;
