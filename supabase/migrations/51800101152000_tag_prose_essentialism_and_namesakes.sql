-- Round six: the unrepaired siblings, and 22 more namesake artifacts.
--
-- Continues 51700101143000. Same rule, same evidence base: repair only where
-- the row's own `description` establishes a sense that the short/long
-- description contradict, derive the new summary FROM that description, and
-- never write `description` itself — it is what justifies the change.
--
-- ── PART A: THREE ROWS ARE THE REMAINDER OF A REPAIR ALREADY MADE ──────────
-- This is the part that is NOT a judgement call, and the reason is that the
-- corpus already decided it. 51500101143000 repaired `woman` because its body
-- was gamete essentialism — "an organism is considered female if it produces
-- the ovum" — and today `woman`, `man` and `femme` read:
--
--   woman  "A feminine gender identity, held by trans and cis women alike."
--          body: "...That identity may or may not align with the sex she was
--          assigned at birth: trans women are women..."
--   man    "A masculine gender identity, held by trans and cis men alike."
--   femme  "A feminine gender expression, used across the queer community
--          regardless of gender."
--
-- Their siblings were never touched and still carry exactly the prose that
-- repair removed:
--
--   masc   summary "Male sex or gender identity"; body "The term 'Masc'
--          refers to individuals who identify as male. In biological terms, a
--          male is an organism that produces sperm..." — while its OWN
--          description says "A masculine gender expression, REGARDLESS OF
--          GENDER IDENTITY". The row contradicts itself on the page, and
--          `femme`, its exact counterpart, was fixed.
--   girl   summary "Female sex or gender"; body "...typically an IMMATURE or
--          young female. In biological terms, an organism is considered female
--          if it produces..." — against a description that says "A feminine
--          gender identity... can include trans or non-binary identities".
--   boy    summary "A male child or young person."; body "...a male human
--          being in the early stages of life, typically from birth to
--          adolescence" — against a description that says "A masculine gender
--          identity... can include trans or non-binary identities".
--
-- `styleguide_terms` independently rates this register `never`: the entry
-- "born a woman | born male | biologically female | biological man | natal
-- sex" prefers "assigned female at birth (AFAB), assigned male at birth
-- (AMAB)". So these three are a live violation of the published standard, not
-- a matter of taste, and the replacement summaries MIRROR the already-repaired
-- siblings rather than being authored fresh.
--
-- The bodies are NULLED rather than rewritten. `woman` has a real body and it
-- is the obvious model for writing `girl`, `boy` and `masc` properly, but
-- writing three identity definitions is authoring, not repair, and this file
-- does not author. Named here so whoever wants to write them knows where the
-- model is.
--
-- ── PART B: `femminiello` — A CULTURAL ROLE COLLAPSED INTO A DIFFERENT ONE ──
-- description: "A traditional gender role in Southern Italy, referring to
-- individuals who embody both masculine and feminine characteristics."
-- Published body: "A trans woman, or transgender woman, is a woman who was
-- assigned male at birth. Many trans women experience gender dysphoria..."
--
-- The femminiello is a Neapolitan social role with its own history; describing
-- it as simply a trans woman erases the distinction the word exists to carry,
-- and does so on the one page a reader would go to for it. Not a namesake and
-- not essentialism — a third shape, recorded separately because a future pass
-- sorting by either of the other two would miss it.
--
-- ── PART C: TWO ROWS DESCRIBE SEX WORK ON ROWS THAT ARE NOT ABOUT SEX WORK ──
--   whore   description "Promiscuous person"; summary "Person who has sex for
--           money"; body "Prostitution involves engaging in sexual activity in
--           exchange for payment..."
--   floozy  description "Promiscuous person"; summary "Colloquial term for a
--           sex worker".
--
-- Two defects at once. The subject is wrong against the row's own description,
-- AND "prostitute" is a `never`-severity avoid term in styleguide_terms
-- (preferred: "sex worker") — so `whore` was publishing the avoided register in
-- our own voice on a live indexable page. Conflating promiscuity with sex work
-- is also precisely the slippage the `sex-worker` entry exists to prevent.
-- Repairing to the row's own description fixes both without this file taking
-- any position on either word.
--
-- ── PART D: 22 MORE NAMESAKE ARTIFACTS, the 51700101143000 class ────────────
--   scat         → subcutaneous ADIPOSE TISSUE, on a defecation-play row
--   foot-switch  → a device for foot-operated control
--   owner        → a landlord who rents or leases property to tenants
--   pleaser      → "pleasure", the abstract noun, not a person
--   host         → a television presenter
--   puppet       → puppetry, the theatrical art form
--   toymaker     → TOYS, not the person who makes them
--   evolving     → biological evolution across generations
--   exploring    → exploration, the geographic activity
--   submission   → submitting an item for consideration or approval
--   flock        → a family name
--   cupcake      → a small cake baked in a paper cup
--   hole         → an opening in a solid body
--   big-spoon    → asserts it is a POLYAMORY term; it is a cuddling position
--   separated    → "Refers to various concepts", a non-answer
--   daddie       → "Term for older gay men", against a description that
--                  explicitly defines it as the FEMME-ALIGNED Daddy role
--   primal-top   → "Term for a specific gay male role", a non-answer
--
-- plus four where a neighbouring CONCEPT was substituted for the tag's own:
--   international-solidarity → humanitarianism
--   health-well-being        → a health-risk-assessment questionnaire
--   sensualism               → sensualism in EPISTEMOLOGY
--   protector / protecting   → LGBTQ+ advocacy, not the guardian dynamic the
--                              description and category establish
--
-- and two where the literal sense landed on a kink row:
--   mommy → "A mother is the female parent of a child..."
--   cunt  → the vulva, on a row whose description is "Vulgar term for
--           submissive"
--
-- `submission` is the one row here repaired on ONE field: its summary ("Act of
-- yielding to another's influence") is already right and only the body is
-- about manuscripts. The casting/trauma rule.
--
-- ── SCOPE, STATED HONESTLY ─────────────────────────────────────────────────
-- 51700101143000 closed 50; this closes 30. What remains in the workable set
-- is mostly two classes this file again declines: zoology on a role row (goat,
-- frog, bunny, tiger, panda, lamb, meerkat, strawberry, wolf), where the
-- description is too thin to author a sense from — the `lion` rule — and rows
-- whose prose is merely the generic dictionary sense without contradicting
-- anything (butler, poppet, doll, catboy, hedonist, freak). Neither is closed
-- by pretending the rule covers it.
--
-- TRAP: log_unified_tag_change() RAISEs when an actor matching `system:%`
-- modifies a human_reviewed row; 28 of these 30 are human_reviewed
-- (femminiello and health-well-being are not). The set_config is load-bearing.
--
-- TRAP: trg_search_documents_tag is column-scoped and DOES include
-- short_description, so each summary write enqueues one search_reindex_queue
-- row; long_description is not in that list.

begin;

select set_config('app.actor', 'migration:51800101152000', true);

-- ── A. The gamete-essentialism siblings ────────────────────────────────────

update unified_tags
   set short_description = 'A masculine gender expression, used regardless of gender identity.',
       long_description  = null
 where slug = 'masc' and status = 'active'
   and short_description = 'Male sex or gender identity';

update unified_tags
   set short_description = 'A feminine gender identity, which may or may not align with sex assigned at birth.',
       long_description  = null
 where slug = 'girl' and status = 'active'
   and short_description = 'Female sex or gender';

update unified_tags
   set short_description = 'A masculine gender identity, which may or may not align with sex assigned at birth.',
       long_description  = null
 where slug = 'boy' and status = 'active'
   and short_description = 'A male child or young person.';

-- ── B. A cultural role collapsed into a different one ──────────────────────

update unified_tags
   set short_description = 'A traditional Southern Italian gender role.',
       long_description  = null
 where slug = 'femminiello' and status = 'active'
   and short_description = 'Woman assigned male at birth';

-- ── C. Sex work described on rows that are not about sex work ──────────────

update unified_tags
   set short_description = 'A promiscuous person.', long_description = null
 where slug = 'whore' and status = 'active'
   and short_description = 'Person who has sex for money';

update unified_tags
   set short_description = 'A promiscuous person.'
 where slug = 'floozy' and status = 'active'
   and short_description = 'Colloquial term for a sex worker';

-- ── D. Namesake artifacts ──────────────────────────────────────────────────

update unified_tags
   set short_description = 'Play involving defecation.', long_description = null
 where slug = 'scat' and status = 'active'
   and short_description = 'Subcutaneous fat tissue';

update unified_tags
   set short_description = 'A switch in foot play.'
 where slug = 'foot-switch' and status = 'active'
   and short_description = 'Device for foot-operated control';

update unified_tags
   set short_description = 'A person who owns another.', long_description = null
 where slug = 'owner' and status = 'active'
   and short_description = 'Rents or leases property to tenants';

update unified_tags
   set short_description = 'A person who aims to please.', long_description = null
 where slug = 'pleaser' and status = 'active'
   and short_description = 'Experience that feels good';

update unified_tags
   set short_description = 'A person who entertains.', long_description = null
 where slug = 'host' and status = 'active'
   and short_description = 'Person introducing TV programs';

update unified_tags
   set short_description = 'A controlled figure.', long_description = null
 where slug = 'puppet' and status = 'active'
   and short_description = 'Theatrical performance art';

update unified_tags
   set short_description = 'A creator of toys.', long_description = null
 where slug = 'toymaker' and status = 'active'
   and short_description = 'Objects for entertainment and play';

update unified_tags
   set short_description = 'A person discovering their role.', long_description = null
 where slug = 'evolving' and status = 'active'
   and short_description = 'Change over generations';

update unified_tags
   set short_description = 'A person discovering kink.', long_description = null
 where slug = 'exploring' and status = 'active'
   and short_description = 'Activity with expectation of discovery';

-- Summary already correct; only the body is about submitting a manuscript.
update unified_tags
   set long_description = null
 where slug = 'submission' and status = 'active'
   and long_description like 'Submission refers to the act of putting forward an item%';

update unified_tags
   set short_description = 'A group of connected individuals.', long_description = null
 where slug = 'flock' and status = 'active'
   and short_description = 'Family name or social group term';

update unified_tags
   set short_description = 'A sweet, cute role.', long_description = null
 where slug = 'cupcake' and status = 'active'
   and short_description = 'Small, individual-sized cake';

update unified_tags
   set short_description = 'A sexual opening role.', long_description = null
 where slug = 'hole' and status = 'active'
   and short_description = 'Opening in a solid body';

update unified_tags
   set short_description = 'The partner who holds from behind when cuddling.',
       long_description  = null
 where slug = 'big-spoon' and status = 'active'
   and short_description = 'Term for a partner in a polyamorous relationship';

update unified_tags
   set short_description = 'Living apart while still legally married.'
 where slug = 'separated' and status = 'active'
   and short_description = 'Refers to various concepts';

update unified_tags
   set short_description = 'A femme-aligned Daddy role.'
 where slug = 'daddie' and status = 'active'
   and short_description = 'Term for older gay men';

update unified_tags
   set short_description = 'An instinctual dominant.'
 where slug = 'primal-top' and status = 'active'
   and short_description = 'Term for a specific gay male role';

-- ── E. A neighbouring concept substituted for the tag's own ────────────────

update unified_tags
   set short_description = 'Collective support and unity across borders.',
       long_description  = null
 where slug = 'international-solidarity' and status = 'active'
   and short_description = 'Valuing human life, assisting others globally';

update unified_tags
   set short_description = 'Information about health and well-being.',
       long_description  = null
 where slug = 'health-well-being' and status = 'active'
   and short_description = 'Assessing health risks through questionnaires';

update unified_tags
   set short_description = 'An approach that prioritises sensory pleasure and embodied experience.',
       long_description  = null
 where slug = 'sensualism' and status = 'active'
   and short_description = 'Philosophy that perceptions underlie cognition';

update unified_tags
   set short_description = 'A guardian role.', long_description = null
 where slug = 'protector' and status = 'active'
   and short_description = 'Supports LGBTQ+ community safety';

update unified_tags
   set short_description = 'A protective relationship dynamic.', long_description = null
 where slug = 'protecting' and status = 'active'
   and short_description = 'Safeguarding LGBTQ+ rights';

-- ── F. The literal sense on a kink row ─────────────────────────────────────

update unified_tags
   set short_description = 'A mother figure.', long_description = null
 where slug = 'mommy' and status = 'active'
   and short_description = 'Female parent of a child';

update unified_tags
   set short_description = 'A vulgar term for a submissive.', long_description = null
 where slug = 'cunt' and status = 'active'
   and short_description = 'External female genital organs';

do $verify$
declare
  v_bad int;
  v_slugs text[] := array[
    'masc','girl','boy','femminiello','whore','floozy',
    'scat','foot-switch','owner','pleaser','host','puppet','toymaker','evolving',
    'exploring','submission','flock','cupcake','hole','big-spoon','separated',
    'daddie','primal-top','international-solidarity','health-well-being','sensualism',
    'protector','protecting','mommy','cunt'];
begin
  -- HARD: the defects this file exists to remove are gone. Tests for the WRONG
  -- text, so a better fix written by someone else also satisfies it.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs) and short_description in (
     'Male sex or gender identity','Female sex or gender','A male child or young person.',
     'Woman assigned male at birth','Person who has sex for money',
     'Colloquial term for a sex worker','Subcutaneous fat tissue',
     'Device for foot-operated control','Rents or leases property to tenants',
     'Experience that feels good','Person introducing TV programs',
     'Theatrical performance art','Objects for entertainment and play',
     'Change over generations','Activity with expectation of discovery',
     'Family name or social group term','Small, individual-sized cake',
     'Opening in a solid body','Term for a partner in a polyamorous relationship',
     'Refers to various concepts','Term for older gay men',
     'Term for a specific gay male role','Valuing human life, assisting others globally',
     'Assessing health risks through questionnaires',
     'Philosophy that perceptions underlie cognition','Supports LGBTQ+ community safety',
     'Safeguarding LGBTQ+ rights','Female parent of a child',
     'External female genital organs');
  if v_bad <> 0 then
    raise exception '% wrong-subject summary(ies) still live', v_bad;
  end if;

  -- HARD, and the reason part A is not a matter of taste: the gamete-
  -- essentialism prose styleguide_terms rates `never` must be gone from the
  -- three identity rows.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug in ('masc','girl','boy')
     and long_description is not null;
  if v_bad <> 0 then
    raise exception '% identity row(s) still publish the essentialist body', v_bad;
  end if;

  -- HARD: the body that described a different entity is gone.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs) and long_description is not null
     and (long_description like 'Submission refers to the act of putting forward an item%'
       or long_description like 'Scat, also known as subcutaneous fat%'
       or long_description like 'A trans woman, or transgender woman, is a woman who was assigned male%'
       or long_description like 'Prostitution involves engaging in sexual activity%'
       or long_description like 'An owner, also known as a landlord%'
       or long_description like 'Puppetry is a form of theatrical performance%'
       or long_description like 'Evolution refers to the change in heritable characteristics%'
       or long_description like 'Humanitarianism is a set of beliefs%'
       or long_description like 'A mother is the female parent of a child%'
       or long_description like 'The vulva, also referred to as the cunt%');
  if v_bad <> 0 then
    raise exception '% disowned-entity body/bodies still live', v_bad;
  end if;

  -- HARD: nulling a body is only safe while every row keeps prose the
  -- thin-page gate can see. Asserted rather than reasoned about.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs)
     and not tag_has_prose(description, short_description);
  if v_bad <> 0 then
    raise exception '% row(s) fell below the thin-page gate', v_bad;
  end if;

  -- HARD: `description` is the evidence and is never written by this file.
  select count(*) into v_bad from unified_tags
   where status = 'active' and slug = any(v_slugs) and description is null;
  if v_bad <> 0 then
    raise exception '% row(s) lost the description this file reasoned from', v_bad;
  end if;

  -- REPORTS: the siblings whose already-repaired state is the precedent for
  -- part A. If one of them has regressed, part A's justification is weaker and
  -- somebody should know — but it is not this file's to enforce.
  if not exists (select 1 from unified_tags where slug = 'woman' and status = 'active'
                   and short_description like 'A feminine gender identity, held by trans and cis women%') then
    raise notice 'woman no longer carries the repaired summary this file used as its model';
  end if;
  if not exists (select 1 from unified_tags where slug = 'femme' and status = 'active'
                   and short_description like 'A feminine gender expression%') then
    raise notice 'femme no longer carries the repaired summary masc was mirrored on';
  end if;

  -- REPORTS: the two classes deliberately left, named so the next pass can
  -- tell "still deferred" from "already fixed".
  select count(*) into v_bad from unified_tags
   where status = 'active' and long_description is not null
     and slug in ('goat','frog','bunny','tiger','panda','lamb','meerkat','strawberry','wolf');
  if v_bad > 0 then
    raise notice '% zoology-on-a-role row(s) still deferred: the description is too thin to author a sense from (the lion rule)', v_bad;
  end if;

  select count(*) into v_bad from unified_tags
   where status = 'active' and slug in ('butler','poppet','doll','catboy','hedonist','freak');
  if v_bad > 0 then
    raise notice '% generic-dictionary-sense row(s) left: their prose does not contradict their own description', v_bad;
  end if;
end
$verify$;

commit;
