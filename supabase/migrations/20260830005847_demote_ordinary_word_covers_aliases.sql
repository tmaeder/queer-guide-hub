-- Three `covers` aliases are ordinary words, and approved means auto-tagging.
--
-- WHAT HAPPENED
--
-- The alias truth pass introduced alias_type='covers' for a narrower term
-- deliberately routed to its covering tag ("Also covers"), and created these
-- rows as review_status='approved'. The typing is right and the display intent
-- is right. The review_status is the problem.
--
-- Since 20260910151200, run_tag_assignment_reconcile() builds its free-text map
-- from APPROVED aliases and ignores everything else. It gates on review_status,
-- not on alias_type — so an approved 'covers' row is an unconditional
-- auto-tagging rule exactly like an approved 'synonym' row.
--
-- Nine of the twelve approved 'covers' aliases are unambiguous substance names
-- (BDO, GBL, Changa, Iboga, Peyote, MDA, MDEA, Chems, Snus) and are left alone.
-- Three are ordinary English words:
--
--   Slam -> safer-injecting        a poetry slam, a grand slam, slamming a door
--   DOC  -> dom-doi-dob-doc        a doctor, a document, Dept of Corrections
--   DOI  -> dom-doi-dob-doc        a Digital Object Identifier — the string that
--                                  appears in essentially every academic citation
--
-- DOI is the sharpest: any article carrying a citation would be tagged as a
-- substituted amphetamine psychedelic.
--
-- CAUGHT BEFORE IT FIRED. All three currently have zero entity assignments, so
-- this is prevention rather than cleanup — the reconciler had not yet met a
-- matching document. That is luck, not design, and it is why the rule is worth
-- restating rather than patching after the fact.
--
-- 20261003110200 demoted 'slam' and 'bumping' for exactly this reason and
-- asserted the invariant; the alias was recreated later by a different pass,
-- which is the recurring shape here — an assertion inside one migration cannot
-- bind a migration written afterwards.
--
-- DEMOTED, NOT DELETED. These are real vocabulary. 'auto' keeps them recorded,
-- keeps them in TagAliasesDisplay, and keeps them eligible for search synonyms;
-- it only stops the reconciler acting on them. Same disposition as `rack` in
-- 20260816105401 and the CLAUDE.md rule that ordinary-word street names (Speed,
-- Acid, Ice, Emma, Vitamin K, ART, CBT) stay 'auto' permanently.

update public.tag_aliases
   set review_status = 'auto'
 where review_status = 'approved'
   and alias_name in ('Slam', 'DOC', 'DOI');

do $mig$
declare v_n int;
begin
  select count(*) into v_n
    from public.tag_aliases
   where review_status = 'approved'
     and alias_name in ('Slam', 'DOC', 'DOI');
  if v_n > 0 then
    raise exception 'ordinary-word covers aliases: % still approved and therefore auto-tagging', v_n;
  end if;

  -- The three must still exist. Demotion, not deletion.
  select count(*) into v_n
    from public.tag_aliases
   where alias_name in ('Slam', 'DOC', 'DOI');
  if v_n < 3 then
    raise exception 'ordinary-word covers aliases: expected 3 rows to survive, found %', v_n;
  end if;

  -- The unambiguous substance names must NOT have been swept up.
  select count(*) into v_n
    from public.tag_aliases
   where review_status = 'approved'
     and alias_name in ('BDO','GBL','Changa','Iboga','Peyote','MDA','MDEA','Chems','Snus');
  if v_n < 9 then
    raise exception 'ordinary-word covers aliases: % unambiguous substance alias(es) were demoted by mistake', 9 - v_n;
  end if;
end
$mig$;