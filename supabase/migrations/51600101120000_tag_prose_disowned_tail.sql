-- Glossary prose round six: the disowned-prose TAIL, and a defect class the
-- five previous rounds could not see.
--
-- HOW THESE WERE FOUND, because the method is the transferable part. Rounds two
-- to five worked the backlog in USAGE ORDER and stopped where the usage ran
-- out. That ordering is why 25 rows survived five passes: almost every row here
-- is usage 0, so it sorted below everything anyone ever read. Searching the
-- surviving set for the SIGNATURES the earlier rounds had already found by hand
-- -- "family name", "commune in", "studio album", "genus", "may refer to",
-- "according to Wikidata" -- returned 57 rows in six shapes, and hand-reading
-- those 57 produced these 25. **A signature is not a defect**: `boyfriend`
-- matched on "can refer to a wide range of relationships", which is ordinary
-- correct prose, and `frog`, `goat`, `tiger`, `duck`, `dragon`, `bunny` and
-- `strawberry` matched the species arm while being the deferred generic-sense
-- cohort. The regex narrows what a human reads; it does not decide.
--
-- ── THE NEW CLASS: A HALF-REPAIRED ROW ─────────────────────────────────────
-- `queerness` (20360401100300) taught that nulling an identifier does not
-- unpublish the prose it produced. This is that lesson one layer further in:
-- **repairing one PROSE FIELD does not repair the other, and the result is
-- invisible to any check that reads either field alone.**
--
-- `collar` is the clearest case. Its `description` and its `long_description`
-- are both careful hand-written kink prose -- "in dominance and submission a
-- collar most often marks an ownership dynamic" -- and its `short_description`,
-- the LEAD LINE on the page, still reads **"Family name or surname"**. Someone
-- repaired that row and fixed two fields of three. `humbler` and `gainer` are
-- the same shape; `bottom`, `babyboy`, `toy` and `possum` are the mirror image,
-- carrying a good summary over a junk body. Seven of the 25 are half-repaired,
-- and every one of them would pass a reviewer who spot-checked the field that
-- had already been fixed.
--
-- ── GROUP A — the SUMMARY is the surviving junk; description and body are good ─
--   collar   Gear, indexable. Summary "Family name or surname" over correct
--            prose about collars as an ownership symbol.
--   humbler  Gear, indexable. Summary "Family name of origin" over an accurate
--            and quite specific description of the device.
--   gainer   Kink Community & Scenes, deindexed. Summary "Surname or rare term"
--            over a correct feedism description. Body is NULL, so the summary
--            was the only other prose the row had.
--
-- ── GROUP B — the BODY is the surviving junk; description and summary are good ─
--   bottom   Dynamics & Roles, indexable, CORE VOCABULARY. Summary already says
--            "The person receiving in a scene -- which is a role, not a level of
--            power." The body: "The term 'Bottom' can refer to a family name or
--            surname ... According to Wikidata".
--   babyboy  Body was the BIRTH-CERTIFICATE PLACEHOLDER NAME for an unnamed
--            male child, published on an age-play row.
--   toy      Body was children's toys over a summary that correctly reads
--            "Someone used as an object of play within a negotiated dynamic".
--   possum   Body was the Virginia opossum's range and nocturnal habits over a
--            summary that correctly reads "A pet-play persona built on the
--            possum rather than a dog or a cat".
--   monsieur Deindexed. Body was the French ROYAL COURT honorific -- the eldest
--            living brother of the king -- over a long, precise description of
--            its use as a D/s address.
--
-- ── GROUP C — BOTH fields are junk and the description is THIN ──────────────
-- These carry a real but one-line `description` ("Person who tickles", "Female
-- deer role"), which is enough to state what the tag is and NOT enough to write
-- a body from. So the summary is set to exactly what that description supports
-- and **the body is NULLED**: the false claim is removed and no vocabulary is
-- minted. That is the `steer` / `lion` / `office` treatment of 51500101152700
-- and the `queen` rule of 51500101144000 -- never guess a sense.
--   doe, fae, flock, handler, minion, tickler  family-name pages
--   whipper                                    a ROCK-CLIMBING fall
--   vixen                                      a POLISH RAPPER, Dariusz Szlagor
--   cunt                                       the mammalian anatomy article
-- Nulling is safe and asserted rather than assumed: enforce_tag_thin_page_gate
-- reads tag_has_prose(description, short_description) only, and every one of
-- these keeps a description.
--
-- ── GROUP D — BOTH fields junk, but the description establishes a KNOWN sense ─
--   domme       "Domme is a commune in the DORDOGNE department in southwestern
--               France" on a row whose description is "Female dominant".
--   fister      Summary "Village in Norway"; body Fister, Hjelmeland
--               Municipality, Rogaland county.
--   sissy       "Sissy refers to a COMMUNE IN AISNE, France, according to
--               Wikidata."
--   servant     "Servant is a commune in Puy-de-Dome, France."
--   knife-play  Summary "Xiu Xiu's 2002 album"; body the debut studio album.
--   business-suits  Summary "Song by Hole"; body the Hole song. Its
--               `description` is careful hand-written fetish prose, so this row
--               is half-repaired AND wrong-subject at once.
--   masc        The sharpest of the six and the reason this group is not
--               deferred. Its own description reads "A masculine gender
--               expression, REGARDLESS OF GENDER IDENTITY", and the body
--               published BIOLOGICAL SEX -- "a male is an organism that
--               produces sperm" -- which is precisely the claim that
--               description exists to refuse, on an Orientation page.
--   triad       Body opens correctly and then drifts into "In music, Triad is
--               also the name of a 1988 studio album", on a polyamory row.
--
-- ── NOT REPAIRED, named so the next pass does not re-read them ──────────────
--   the generic-sense cohort, fourth pass running: teacher, priest, acolyte,
--     angel, frog, goat, tiger, duck, dragon, bunny, catboy, strawberry, lamb,
--     lord, squire, reynard, cousin, humiliation, devotee. On every one the
--     row's own `description` AGREES with its body ("Amphibian role" over the
--     order Anura), so the selection rule structurally cannot reach them and
--     there is no contradiction to repair. Whether a kink-roleplay vocabulary
--     should carry the zoological entry for a goat is one decision about the
--     whole cohort, and it is an editorial call rather than a prose fix.
--   ebony    Slang & Language, `description` IS NULL, summary and body are the
--            hardwood. On this platform the live sense is a race category in
--            porn taxonomy, which is exactly the `black` / `peaches` situation:
--            more than one candidate sense and no evidence on the row. Deferred
--            for the same reason, and named so it is not mistaken for missed.
--   bicon    Its `description` is ITSELF a disambiguation list ("Bicon may refer
--            to: BiCon (UK) ... Bicon Dental Implants"), so the row carries no
--            clean evidence at all -- and this file never writes `description`.
--            Unrepairable under the rule rather than overlooked.
--   host     Dynamics & Roles. "Person who entertains" admits both a party host
--            and a D/s role, so the category does not narrow it to one reading
--            and the widened rule does not reach it either.
--   unicorn  Its description names TWO senses at once ("Mythical creature or
--            third person"), the second being the polyamory sense. Choosing
--            between them is the guess this class came from.
--
-- THE ACTOR DECLARATION IS LOAD-BEARING: 24 of these 25 rows are
-- `human_reviewed`, and log_unified_tag_change() RAISEs for a `system:%` actor.
-- Verified live rather than assumed on this very corpus -- the undeclared
-- UPDATE returns "human_reviewed tag ... cannot be modified by system:trigger".
--
-- SEARCH CHURN: trg_search_documents_tag is column-scoped and DOES include
-- `short_description`, so the 19 rows whose summary changes reindex; the
-- body-only repairs (Group B, and triad/monsieur) do not.
--
-- Discipline: `description` is NEVER written -- it is the evidence on every row
-- here, and on `bicon` its absence is why that row is left alone. Every UPDATE
-- is content-guarded on the defect's own text. Postconditions assert the defect
-- is GONE, never that this file's wording is present, and everything the file
-- does not own reports instead of aborting.

select set_config('app.actor', 'admin:tag-prose-disowned-tail', true);

-- ── Group A: summary only ──────────────────────────────────────────────────

update public.unified_tags set short_description = 'A band worn around the neck, and in kink the central symbol of an ownership dynamic.'
 where slug = 'collar' and status = 'active' and short_description = 'Family name or surname';

update public.unified_tags set short_description = 'A hinged clamp that traps the scrotum behind the thighs, forcing the wearer to stay bent forward.'
 where slug = 'humbler' and status = 'active' and short_description = 'Family name of origin';

update public.unified_tags set short_description = 'Someone who intentionally gains weight, as a preference or an identity within feedism.'
 where slug = 'gainer' and status = 'active' and short_description = 'Surname or rare term';

-- ── Group B: body only ─────────────────────────────────────────────────────

update public.unified_tags set long_description =
'Bottoming is receiving — taking the sensation, the restraint or the direction in a scene. It says what someone is doing, not how much power they hold.

That distinction is the one worth keeping straight: a bottom is not automatically a submissive, and plenty of bottoms direct the scene they are in. Topping and bottoming describe the mechanics; dominance and submission describe the authority, and the two pair in every combination.'
 where slug = 'bottom' and status = 'active'
   and long_description like 'The term ''Bottom'' can refer to a family name or surname%';

update public.unified_tags set long_description =
'Babyboy is an age-play role in which an adult takes a young masculine headspace — being looked after, given rules, allowed to stop being responsible for a while.

It is a headspace between consenting adults and it is not inherently sexual; for many people the point is the care rather than the sex. The counterpart role is usually a caregiver, and what each person wants from it is negotiated in advance like any other dynamic.'
 where slug = 'babyboy' and status = 'active'
   and long_description like 'The term ''Babyboy'' is used on some English-language birth certificates%';

update public.unified_tags set long_description =
'Being someone''s toy is an objectification role: for the length of a scene a person is treated as a thing to be used, arranged or played with rather than consulted.

It only works as a negotiated dynamic, and the negotiation is what separates it from simply being disregarded. Limits and a way to stop are agreed first, precisely because the role involves acting as though the person has set them aside.'
 where slug = 'toy' and status = 'active'
   and long_description like 'A toy is an object used primarily for entertainment%';

update public.unified_tags set long_description =
'Possum is a pet-play persona built on the possum rather than the more common dog or cat — playing dead, hanging about, being nocturnal and a bit feral.

Pet play is a headspace rather than a costume, though gear often helps. Like the other animal personas it can be sexual or entirely not, and which it is depends on the people involved rather than on the animal.'
 where slug = 'possum' and status = 'active'
   and long_description like 'The Virginia opossum is a solitary, nocturnal mammal%';

update public.unified_tags set long_description =
'Monsieur is a French honorific used to address a masculine dominant, in the same position as Sir but with a more formal and deliberately elegant register.

It belongs to protocol rather than to French nationality: people use it in high-protocol dynamics and in scenes with an aristocratic flavour, and like any title it is one the dominant is given rather than one they simply announce.'
 where slug = 'monsieur' and status = 'active'
   and long_description like 'Monsieur is a French honorific title that was historically used%';

-- ── Group C: summary from the row's own description; body NULLED, nothing minted ─

update public.unified_tags set short_description = 'A female-deer role.', long_description = null
 where slug = 'doe' and status = 'active' and short_description = 'Family name';

update public.unified_tags set short_description = 'A fae or fairy-creature role.', long_description = null
 where slug = 'fae' and status = 'active' and short_description = 'Fae, a given name';

update public.unified_tags set short_description = 'A group of connected individuals.', long_description = null
 where slug = 'flock' and status = 'active' and short_description = 'Family name or social group term';

update public.unified_tags set short_description = 'A person who manages or looks after another.', long_description = null
 where slug = 'handler' and status = 'active' and short_description = 'Family name';

update public.unified_tags set short_description = 'A loyal servant role.', long_description = null
 where slug = 'minion' and status = 'active' and short_description = 'Family name or term with various meanings';

update public.unified_tags set short_description = 'A person who tickles.', long_description = null
 where slug = 'tickler' and status = 'active' and short_description = 'A surname or electronic circuit';

update public.unified_tags set short_description = 'A person who whips.', long_description = null
 where slug = 'whipper' and status = 'active' and short_description = 'Climbing term';

update public.unified_tags set short_description = 'A cunning feminine role.', long_description = null
 where slug = 'vixen' and status = 'active'
   and long_description like 'Vixen, also known as Dariusz Szlagor, is a Polish rapper%';

update public.unified_tags set short_description = 'A vulgar term used for a submissive.', long_description = null
 where slug = 'cunt' and status = 'active' and short_description = 'External female genital organs';

-- ── Group D: the description establishes a known sense ─────────────────────

update public.unified_tags set short_description = 'A woman or feminine person who takes the dominant role.', long_description =
'A domme is a woman or feminine person who takes the dominant role in a D/s dynamic — setting the terms, directing the scene, holding the authority that has been given to her.

The word carries no implication about what she actually does: dommes work in every style from sensual to severe, and some do it professionally while most do not. A professional domme is providing a service and is not thereby anyone''s partner.'
 where slug = 'domme' and status = 'active'
   and long_description like 'Domme is a commune in the Dordogne%';

update public.unified_tags set short_description = 'A person who fists a partner.', long_description =
'A fister is the person doing the fisting — the partner whose hand is inside the other''s vagina or rectum.

It is a practice with a steep preparation curve: lubricant in quantity, short filed nails, gloves, and going far more slowly than feels necessary. Going slowly is the technique, not a precaution around it, and the receiving partner sets the pace throughout.'
 where slug = 'fister' and status = 'active' and short_description = 'Village in Norway';

update public.unified_tags set short_description = 'A feminised masculine role, and a reclaimed word for it.', long_description =
'Sissy names a role in which a man or masculine person is feminised — in dress, in manner, in how they are addressed — usually within a D/s dynamic and usually by a dominant who directs it.

The word arrived as an insult for effeminate men and is used inside kink as a claimed one, which is why context decides how it lands: chosen by the person it describes it is a role, aimed at someone it is still a slur. It is also worth separating from gender identity — a sissy is playing with femininity, which is not the same as being a trans woman, and conflating the two does both a disservice.'
 where slug = 'sissy' and status = 'active'
   and long_description like 'Sissy refers to a commune in Aisne, France%';

update public.unified_tags set short_description = 'A service role centred on attending to someone.', long_description =
'Servant is a service role: the submissive partner''s satisfaction comes from attending to the dominant — chores, fetching, personal care, anticipating what is wanted before being asked.

Service is its own kink and often has little to do with pain or sex. Some dynamics are domestic and ongoing rather than scene-based, and what counts as service is agreed rather than assumed, since the whole appeal is getting it right.'
 where slug = 'servant' and status = 'active'
   and long_description like 'Servant is a commune in Puy-de-D%';

update public.unified_tags set short_description = 'Using knives for sensation and for fear.', long_description =
'Knife play uses a blade for sensation and, as much, for the fear of one — dragging, tracing, the cold of the flat against skin. A great deal of it is done with a blade that never cuts.

It is edge play and it is treated as such: a sober top, a blade whose sharpness is known rather than assumed, nothing across the throat, the major vessels of the neck, wrists and groin avoided, and a plan for bleeding if the skin does break. Anything that breaks skin also makes it a blood-borne infection question, so blades are not shared between people.'
 where slug = 'knife-play' and status = 'active'
   and long_description like 'Knife Play is the debut studio album%';

update public.unified_tags set short_description = 'A clothing fetish for formal business attire.', long_description =
'A fetish for business suits attaches to what the clothing signals — authority, money, competence, a body held in a deliberate shape — rather than to the fabric alone.

It sits close to authority and uniform play, and it works in both directions: wearing the suit and being wanted in it, or being the one undressing someone who arrived dressed to be taken seriously.'
 where slug = 'business-suits' and status = 'active' and short_description = 'Song by Hole';

update public.unified_tags set short_description = 'A masculine gender expression, whoever is wearing it.', long_description =
'Masc describes a masculine gender presentation — how someone dresses, moves, speaks and is read — and it says nothing about their gender identity or their body.

Masc people include cis and trans men, butch and masc-of-centre lesbians, nonbinary people and plenty of others, and the word is a description of expression rather than a claim about anatomy. It is also a scale rather than a category: people are masc-of-centre, masc-leaning, or masc some days and not others.'
 where slug = 'masc' and status = 'active'
   and long_description like 'The term ''Masc'' refers to individuals who identify as male%';

update public.unified_tags set long_description =
'A triad is a relationship between three people. In a closed triad all three are involved with each other; in a vee one person is involved with two who are not involved with one another.

It is a structure, not a hierarchy — the three do not automatically hold equal weight, and saying so openly is how triads avoid the most common failure, where an existing couple treats a third person as an accessory to their relationship rather than a partner in their own right.'
 where slug = 'triad' and status = 'active'
   and long_description like '%In music, Triad is also the name of a 1988 studio album%';

do $verify$
declare
  v_bad int; v_n int; v_note text;
  v_all text[] := array['collar','humbler','gainer','bottom','babyboy','toy','possum','monsieur',
                        'doe','fae','flock','handler','minion','tickler','whipper','vixen','cunt',
                        'domme','fister','sissy','servant','knife-play','business-suits','masc','triad'];
begin
  -- HARD: every defect this file exists to remove is gone. Tests for the WRONG
  -- text, so a better fix by someone else also satisfies it.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (   short_description in ('Family name or surname','Family name of origin','Surname or rare term',
                                   'Family name','Fae, a given name','Family name or social group term',
                                   'Family name or term with various meanings','A surname or electronic circuit',
                                   'Climbing term','Village in Norway','Xiu Xiu''s 2002 album','Song by Hole',
                                   'Male sex or gender identity','External female genital organs')
          or long_description like 'The term ''Bottom'' can refer to a family name%'
          or long_description like 'The term ''Babyboy'' is used on some English-language birth certificates%'
          or long_description like 'The Virginia opossum is a solitary, nocturnal mammal%'
          or long_description like 'Domme is a commune in the Dordogne%'
          or long_description like 'Sissy refers to a commune in Aisne, France%'
          or long_description like 'Servant is a commune in Puy-de-D%'
          or long_description like 'Knife Play is the debut studio album%'
          or long_description like 'Business Suits is a song by the American alternative rock band Hole%'
          or long_description like 'Vixen, also known as Dariusz Szlagor, is a Polish rapper%'
          or long_description like 'The term ''Masc'' refers to individuals who identify as male%'
          or long_description like '%In music, Triad is also the name of a 1988 studio album%');
  if v_bad > 0 then
    raise exception 'tail: % row(s) still publish the disowned prose', v_bad;
  end if;

  -- HARD: nulling a body is only safe while the row keeps prose the thin-page
  -- gate can see. Nine bodies are nulled here, so this is not decorative.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_all)
     and not tag_has_prose(description, short_description);
  if v_bad > 0 then
    raise exception 'tail: % row(s) fell below the thin-page gate', v_bad;
  end if;

  -- HARD: no row this file touches may cite its own source to the reader.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_all)
     and (long_description ilike '%according to wikidata%'
       or long_description ilike '%according to wikipedia%'
       or long_description ilike '%as disambiguated on%'
       or long_description ilike '%the provided sources%');
  if v_bad > 0 then
    raise exception 'tail: % row(s) still cite their own source to the reader', v_bad;
  end if;

  -- The corpus convention is real newlines inside the quoted string
  -- (20261007120000). `like ''%\n%''` cannot test this -- in a LIKE pattern the
  -- backslash is the ESCAPE character, so that pattern means "contains the
  -- letter n" and matches everything; that is the defect 50900101100000 shipped
  -- and caught on its own dry run. position() is what actually asserts it.
  select count(*) into v_n from public.unified_tags
   where status = 'active' and slug = any(v_all)
     and (position('\n' in coalesce(long_description,'')) > 0
       or position('\n' in coalesce(short_description,'')) > 0);
  if v_n > 0 then
    raise exception 'tail: % row(s) carry a literal backslash-n instead of a newline', v_n;
  end if;

  -- HARD: Group C removes a false claim and mints NOTHING. Their bodies must be
  -- null, not replaced with invented vocabulary.
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and slug in ('doe','fae','flock','handler','minion','tickler','whipper','vixen','cunt')
     and long_description is not null;
  if v_bad > 0 then
    raise exception 'tail: % Group C row(s) gained a body -- that group exists to mint nothing', v_bad;
  end if;

  -- REPORTS: `description` is the evidence on every row here and is never
  -- written by this file.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and slug = any(v_all) and coalesce(btrim(description),'') = '';
  if v_bad > 0 then
    raise notice 'tail: % row(s) now carry no description -- this file never writes one, so that was done elsewhere', v_bad;
  end if;

  -- REPORTS: named deferrals, so the next pass can tell "left by decision" from
  -- "already fixed".
  select string_agg(slug, ', ' order by slug) into v_note
    from public.unified_tags
   where status = 'active' and slug in ('ebony','bicon','host','unicorn','lamb','lord','squire',
                                        'reynard','cousin','strawberry','frog','goat','teacher','priest','acolyte');
  if v_note is not null then
    raise notice 'tail: deliberately untouched -- no clean evidence on the row (ebony, bicon), two senses named at once (host, unicorn), or the generic-sense cohort whose description AGREES with its body: %', v_note;
  end if;

  raise notice 'tail: 25 rows. Seven were HALF-REPAIRED -- one prose field fixed by an earlier pass and the other left carrying the disowned junk, which no check reading a single field can see. Found by signature search over the surviving set, not by usage order, which is why five passes missed them.';
end $verify$;
