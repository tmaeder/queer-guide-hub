-- Binding rules must state their reason, and 14 of the seeded ones did not.
--
-- The editor micro-guide on /admin/styleguide tells contributors, in the UI:
--   "Fill in the reason. The reason is not decoration: it is what lets an
--    editor apply the rule to a case you did not think of, and it is shown to
--    readers on the public page. A rule with no reason gets argued about
--    forever."
-- and then 14 of the 30 seeded `must`/`never` rules shipped with
-- `rationale IS NULL`. The schema already enforces the equivalent for terms
-- (`preferred IS NOT NULL OR rationale IS NOT NULL`) and enforced nothing here,
-- so the standard was advice for other people.
--
-- `should` is deliberately exempt. A preference can reasonably be "this reads
-- better" with nothing further to say; a MUST or a NEVER is an instruction a
-- writer cannot argue with, and one of those without a stated reason is how a
-- rule outlives the situation that produced it.

-- ---------------------------------------------------------------
-- 1. Fill the fourteen
-- ---------------------------------------------------------------
--
-- Guarded on `rationale IS NULL` per row, so a human who has written a better
-- reason in the meantime keeps it and this migration no-ops on that row.

UPDATE public.styleguide_rules AS r
   SET rationale = v.rationale
  FROM (VALUES
    ('concrete-over-abstract',
     $b$An adjective is a claim the reader cannot check. A detail is one they can act on, and it is also the thing that proves we actually know the place rather than having generated a paragraph about it.$b$),
    ('no-second-person-in-reference',
     $b$Reference copy gets quoted, translated and excerpted into contexts we do not control. "You" assumes a reader we can no longer see, and the sentence stops being true when it travels.$b$),
    ('community-words-in-their-real-sense',
     $b$These words carry precise meanings that outsiders routinely flatten. Using them loosely is the clearest possible signal to a queer reader that the writer is not one, and it makes the entry less accurate, not just less credible.$b$),
    ('reclaimed-words',
     $b$Reclamation is contextual and not transitive. A word a community uses about itself is not thereby a word a platform may use about a person, and the difference is consent rather than vocabulary.$b$),
    ('intersectional-by-default',
     $b$A fact is not one fact for everybody. "The bar is cash-only, upstairs, and the door is strict" lands differently on a disabled reader, a poor one, and a trans one, and separating that into a paragraph at the bottom is how it gets cut for length.$b$),
    ('not-only-gay-men',
     $b$A reader who travels somewhere on our word and finds nothing for them has been failed by the entry, not by the city. Naming who a place is actually for costs one clause and is the difference between a listing and a directory row.$b$),
    ('no-tokenism',
     $b$Adding a community to a sentence to look complete is a claim about coverage we have not earned, and readers from that community are the ones who find out first that it was decorative.$b$),
    ('gender-neutral-by-default',
     $b$Guessing is wrong often enough to matter and costs nothing to avoid. Getting it wrong about a real person is not a style error, it is being publicly misgendered by a platform that exists to not do that.$b$),
    ('sexual-health-without-shame',
     $b$Shame is the reason people do not test and do not disclose, so language that carries it produces worse health outcomes, not merely worse prose. U=U in particular is the fact that ends the argument for treating positive people as hazards.$b$),
    ('neurodivergence-not-deficit',
     $b$A quiet room is a facility in the same way a ramp is. Describing it as an accommodation for a deficit turns a fact a reader can plan around into a judgement about them.$b$),
    ('legal-claims-are-sourced',
     $b$A reader deciding whether to travel needs to know how old the claim is and who made it, because laws change and our copy does not change with them. An unsourced legal statement cannot be re-checked by anyone, including us.$b$),
    ('never-out-anyone',
     $b$Outing is the harm this platform exists to protect against, and inference is how it usually happens — nobody sets out to out a person, they publish a detail that only makes sense one way.$b$),
    ('respect-the-gate',
     $b$The safety layer hides these entries from anonymous readers for a reason, and prose that identifies a cruising ground or a private venue precisely enough to find it is equally useful to someone looking for it in order to police it.$b$),
    ('length-discipline',
     $b$Padding is where invention happens. A writer with nothing left to say and a field to fill produces the plausible sentence, which is the failure mode every other rule here is trying to prevent.$b$)
  ) AS v(slug, rationale)
 WHERE r.slug = v.slug
   AND r.rationale IS NULL;

-- ---------------------------------------------------------------
-- 2. Make it structural
-- ---------------------------------------------------------------

ALTER TABLE public.styleguide_rules
  DROP CONSTRAINT IF EXISTS styleguide_rules_binding_needs_reason;

ALTER TABLE public.styleguide_rules
  ADD CONSTRAINT styleguide_rules_binding_needs_reason
  CHECK (severity = 'should' OR rationale IS NOT NULL);

-- ---------------------------------------------------------------
-- 3. Postconditions
-- ---------------------------------------------------------------

DO $verify$
DECLARE
  v_missing int;
  v_total int;
BEGIN
  SELECT count(*) INTO v_missing
    FROM public.styleguide_rules
   WHERE severity IN ('must', 'never') AND rationale IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% binding rule(s) still carry no rationale', v_missing;
  END IF;

  -- Positive control: prove the constraint rejects, rather than merely existing.
  BEGIN
    INSERT INTO public.styleguide_rules (slug, section, title, body, severity, rationale)
    VALUES ('reason-probe', 'persona', 'probe', 'probe', 'must', NULL);
    RAISE EXCEPTION 'a MUST rule with no rationale was accepted — the constraint is not enforcing';
  EXCEPTION
    WHEN check_violation THEN NULL;  -- expected
  END;

  -- And prove it does NOT over-reach: `should` must still be storable bare.
  BEGIN
    INSERT INTO public.styleguide_rules (slug, section, title, body, severity, rationale)
    VALUES ('should-probe', 'persona', 'probe', 'probe', 'should', NULL);
    DELETE FROM public.styleguide_rules WHERE slug = 'should-probe';
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'the constraint rejects a bare SHOULD rule, which it must not';
  END;

  SELECT count(*) INTO v_total FROM public.styleguide_rules WHERE rationale IS NOT NULL;
  RAISE NOTICE 'every binding rule states its reason (% rules carry one)', v_total;
END
$verify$;
