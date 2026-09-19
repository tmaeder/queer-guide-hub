-- Wrong-entity repair on the adult-performer personality cohort.
--
-- WHAT THIS IS. `/admin/inbox?queue=quality-personality` holds 1,513 open rows
-- from one 2026-08-15 `personality-link-adult-profiles` batch, each proposing a
-- porn-site profile URL for a personality. 401 of those rows sit on a
-- personality carrying a real `Q…` wikidata_qid. All 401 were pulled from
-- Wikidata on 2026-09-19 and classified on P31/P106. 125 of them — 31% — are
-- provably NOT that person:
--
--   50  are not a human at all: `Austin` (the city, Q16559, carrying
--       @austintexasgov), `Aceh` (Indonesian province), `Colt's Manufacturing`,
--       `Ignition` (1992 Offspring album), `Eycelli` (a Turkish mahalle),
--       `Big Beef Creek` (a stream), `Daimon` (an insect genus), `Sir`
--       (honorific prefix), `heavy metal music`, ~25 given-name/surname pages.
--    3  have no P31 at all and are plain concepts: `cabal`, `deity`, `adultery`.
--   72  are a DIFFERENT real named person. This is the defamation case the
--       `encyclopedic_provenance` tier exists to prevent, and it had already
--       happened in the data:
--         Jason Collins   Q2317740   NBA player, first openly gay active
--                                    major-league athlete — our row carried his
--                                    birth date, death date, IMDb id and his
--                                    @jasoncollins98 / jasoncollins_98 handles
--         Scott Miller    Q107984823 LGBTQ rights activist and philanthropist
--         Brad Davis      Q374175    actor, died 1991
--         Lee Smith       Q112628161 NZ Māori language and gay rights advocate
--                                    — PUBLIC and indexable, with two open rows
--                                    proposing xvideos and pornhub profiles
--         Mike Stone      Q120416052 trade unionist
--         Bobby Garcia    Q135321627 Filipino theatre director (d. 2024)
--         Steve Lucas     Q7613194   Canadian general
--         Marliese Arold  Q1902087   German children's author
--       plus ~40 ProQuest dissertation records and Peerage entries.
--
-- THE PRODUCER IS ALREADY SEALED AND THE ROWS WERE NEVER REPAIRED. The comment
-- block in `personality-refresh/index.ts` records a 2026-08 audit that measured
-- 59.7% of adult-cohort QIDs wrong and replaced the name-only
-- `wbsearchentities&limit=1` call with `resolveByNameAndProfession()` (requires
-- P31=Q5 plus an occupation overlap, refuses ambiguity). Nothing then went back
-- for the QIDs already written. Same shape as the glossary wrong-entity class
-- (`20261008100000`), one entity type over, and the same rule applies:
-- **nulling the identifier does not unpublish the data it produced.**
--
-- WHY `SKIP_`, NOT NULL — and the first draft of this paragraph was WRONG, which
-- is why the reasoning is spelled out rather than asserted. It claimed a null
-- "re-mints the same bad match", on the strength of `personality-refresh`
-- re-resolving by name whenever `wikidata_qid IS NULL`
-- (`if (!qid && !existingQid && p.name)`). The first half is true and
-- code-verified; the conclusion does not follow, because the resolver it calls
-- is the SEALED one. `resolveByNameAndProfession()` drops every candidate that
-- fails `isHuman()` — which refuses all 50 not-a-person rows outright — and then
-- scores Wikidata occupations against `profession-keywords.js`, where
-- `'adult performer'` maps to ['porn','adult','erotic','escort','pornographic'].
-- All 72 of the different-person rows were classified as carrying NO porn signal
-- in occupation or description, so every one scores 0 and is refused. A null
-- here would therefore NOT regenerate these identifiers.
--
-- `SKIP_` is still correct, for the reason that actually applies: a null records
-- no DECISION. It is indistinguishable from "never probed", so the row re-enters
-- name resolution on every future pass and pays a Wikidata round trip to
-- re-derive the same refusal forever. `SKIP_<uuid>` is this codebase's own
-- terminal sentinel — "a SKIP_ sentinel is a recorded decision that no match
-- exists — honour it" — and the promotion gate and truth engine already read it
-- that way. The column is UNIQUE, so each row gets its own uuid.
--
-- THIS DOES NOT CONTRADICT `99970101100100_personality_wikidata_not_a_person`,
-- which nulls instead, and the two cohorts are provably disjoint (0 shared QIDs;
-- that file takes 84 PUBLIC rows, this one takes 125 mostly-draft rows out of
-- the adult-link queue). Null is the right call there because every one of its 84
-- is a non-person that `isHuman()` alone refuses, so re-resolution can only
-- improve the row — `Alaska` may yet find the real drag queen. Here the set is
-- 72 real humans whose only disqualifier is an occupation mismatch, a narrower
-- and more fragile filter, and recording the refusal is worth more than leaving
-- the door open.
--
-- RETRACTION IS PER FIELD AND CONTENT-GUARDED, NEVER A BLANKET WIPE, and
-- measuring is what forced that: of the 28 rows carrying a birth_date, only 16
-- match the wrong entity's P569 — **12 differ and are kept**, because they came
-- from the adult source, not from Wikidata. Same per key for external_ids:
-- Jason Collins' twitter and instagram match the wrong item exactly and go,
-- while his stored imdb_id (nm2286393) differs from that item's (nm6547633) and
-- stays. Measured: description 101 exact of 107 present (2 differ, kept),
-- birth 16 of 28, death 7 of 9, external_ids 33 rows sharing >= 1 value.
--
-- `image_url` IS DELIBERATELY NOT TOUCHED. The obvious discriminator — an R2
-- `/personalities/<uuid>.webp` mirror means Wikidata Commons P18, a porn-CDN
-- thumbnail means the adult source — was TESTED AND REFUTED: 701 rows in this
-- cohort carry a `.webp` mirror while holding a `SKIP_` qid, i.e. no Wikidata
-- entity ever existed for them. The URL shape therefore proves nothing about
-- provenance, and retracting on it would have blanked 56 images, an unknown
-- share of them the performer's own. Under-reaching is the correct error.
--
-- REVERSIBILITY REUSES THE VERSIONING TRIGGER — no new audit table. `trg_content_revision`
-- is attached and `content_versioned_tables` has `personalities` enabled with
-- `ignore_columns = {name_initial, updated_at}`, so every column below is
-- captured as a before/after delta. Declaring `app.actor` makes the revision
-- `actor_kind='declared'`, which `run_content_revision_prune` never deletes (it
-- drops `system` only), and `content_revision_revert_fields()` already undoes it
-- per field. `set_config(...)` is used rather than `SET LOCAL`, which `db push`
-- discards with a bare WARNING 25P01 because it does not wrap a migration in a
-- transaction block.
--
-- THE OUTING GUARD IS REACHED AND MEASURED AT ZERO — stated because the
-- plausible-sounding claim here is the unmeasured one.
-- `trg_personalities_outing_guard` fires on `UPDATE OF wikidata_qid` and demotes
-- a living, public/indexable row carrying an lgbti_connection to draft once the
-- qid stops matching `^Q[0-9]+$`. That would be CORRECT — removing a false
-- encyclopedic identifier should remove the publication warrant — but it does
-- not happen here, because the guard's last conjunct also requires that NO
-- non-SKIP `personality_sources` row exists, and every one of these rows carries
-- the adult-source row that put it in the queue. Measured across all 401
-- real-QID rows before writing this: 56 hold a guard-matching lgbti_connection,
-- 377 are living, and **0 would demote**. The verify block still REPORTS the
-- count instead of asserting zero, so the day that changes is visible rather
-- than silent.
--
-- NOT DONE HERE, deliberately: the other 1,381 open rows in this queue are not
-- decided. 1,112 carry `SKIP_<uuid>` pseudo-QIDs and zero `wikipedia_url`, so
-- they have no identity evidence in either direction and remain undecidable by
-- construction — narrowing the gate to clear them is the move that would let
-- `encyclopedic_provenance` rows fall through to `auto`, which is the
-- defamation this tier exists to prevent.

create temp table _wrong_entity (
  qid       text primary key,
  wd_label  text,
  wd_class  text,
  wd_desc   text,
  wd_birth  date,
  wd_death  date,
  wd_ext    jsonb
);

insert into _wrong_entity (qid, wd_label, wd_class, wd_desc, wd_birth, wd_death, wd_ext) values
  ('Q102077115','Frank Myers','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q102121377','Steffen van Bakel','human: no occupation stated','Dr. Katholieke Universiteit Nijmegen 1993',null::date,null::date,'{"viaf": "161844781", "isni": "0000000111358479"}'::jsonb),
  ('Q102175579','Eric Stone','human: no occupation stated','Ph.D. Stanford University 2004',null::date,null::date,'{}'::jsonb),
  ('Q102196073','Dave Xianfeng Meng','human: no occupation stated','Ph.D. Tulane University 1998',null::date,null::date,'{}'::jsonb),
  ('Q102197862','David Boss Hunter','human: no occupation stated','Ph.D. University of Edinburgh 1958',null::date,null::date,'{"viaf": "16549965", "isni": "0000000037549188"}'::jsonb),
  ('Q102225548','Leo Rex Katzenstein','human: no occupation stated','Ph.D. The University of Chicago 1981',null::date,null::date,'{}'::jsonb),
  ('Q102273920','Tyler Douglas Lawson','human: no occupation stated','Ph.D. Stanford University 2004',null::date,null::date,'{}'::jsonb),
  ('Q102382725','David Dave Herman','human: no occupation stated','Ph.D. Northeastern University 2010',null::date,null::date,'{}'::jsonb),
  ('Q102389223','Jason Reed','human: no occupation stated','Ph.D. Carnegie Mellon University 2009',null::date,null::date,'{}'::jsonb),
  ('Q102402557','Shawn Allen Carey','human: no occupation stated','Ph.D. University of South Carolina 2008',null::date,null::date,'{}'::jsonb),
  ('Q102409332','Bryan Cole','human: no occupation stated','Ph.D. Boston University 2012',null::date,null::date,'{}'::jsonb),
  ('Q102976555','Blake Hunter','human: no occupation stated','Ph.D. University of California, Davis 2011',null::date,null::date,'{}'::jsonb),
  ('Q102985134','David Plaza','human: no occupation stated','Ph.D. Universidad de Talca 2013',null::date,null::date,'{}'::jsonb),
  ('Q103129689','Michael Lamar','human: no occupation stated','Ph.D. Brown University 2010',null::date,null::date,'{}'::jsonb),
  ('Q103208640','Isaac Jones','human: no occupation stated','(1702-1759)',null::date,null::date,'{}'::jsonb),
  ('Q103294448','Nick West','human: no occupation stated','Ph.D. Stanford University 2012',null::date,null::date,'{}'::jsonb),
  ('Q105811201','Logan James','human: no occupation stated','American professional wrestler','1998-02-26'::date,null::date,'{}'::jsonb),
  ('Q105944461','Jason Starkey','human: no occupation stated','Ringo Starr''s son','1967-08-19'::date,null::date,'{"imdb_id": "nm4202692"}'::jsonb),
  ('Q107984823','Scott Miller','human: philanthropist; LGBTQ rights activist; banker','LGBTQ rights activist, philanthropist and asset manager','1979-05-13'::date,null::date,'{}'::jsonb),
  ('Q108683163','Christopher Young','human: no occupation stated','Quebecois political candidate',null::date,null::date,'{}'::jsonb),
  ('Q108909096','Noah Smith','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q109908966','Jeremy George Augustus Ive','human: no occupation stated','historian',null::date,null::date,'{"isni": "0000000135875913"}'::jsonb),
  ('Q110140349','George Lee','human: no occupation stated','Master of Architecture, University of Washington',null::date,null::date,'{}'::jsonb),
  ('Q111008584','Rafael Ferreira','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q112058490','Ethan T Adams','human: no occupation stated','Ph.D., Classical Languages and Literature, University of Washington, 2003',null::date,null::date,'{}'::jsonb),
  ('Q112302306','Joe Parker','human: no occupation stated',null,'1913-01-29'::date,'1970-04-28'::date,'{"imdb_id": "nm0662362"}'::jsonb),
  ('Q112438851','Christopher White','human: no occupation stated',null,'1984-10-24'::date,null::date,'{}'::jsonb),
  ('Q112628161','Lee Smith','human: no occupation stated','New Zealand Māori language and gay rights advocate','1950-12-05'::date,'2019-10-15'::date,'{}'::jsonb),
  ('Q114604964','Tom Long','human: no occupation stated','American businessperson and board member, Co-Chief Executive Officer, Energy Transfer LP',null::date,null::date,'{}'::jsonb),
  ('Q114978498','Corey Jay','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q116042283','Simon Best','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q116626497','Dylan West','human: no occupation stated','Owner of the website Pixel Empire',null::date,null::date,'{}'::jsonb),
  ('Q116641682','<deleted Wikidata item>','missing',null,null::date,null::date,'{}'::jsonb),
  ('Q117251640','Ash Williams','human: no occupation stated','Vice-Chair, JP Morgan',null::date,null::date,'{}'::jsonb),
  ('Q117863377','Daren Dai','human: no occupation stated','graduated from University of Washington with a Graduate Degree from the College of Built Environments',null::date,null::date,'{}'::jsonb),
  ('Q120416052','Mike Stone','human: no occupation stated',null,'1927-06-11'::date,null::date,'{}'::jsonb),
  ('Q120435492','Patrick Rougevin-Bâville','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q121991606','Jaxon Ford','human: no occupation stated','Canadian gridiron football player (born 2000)',null::date,null::date,'{}'::jsonb),
  ('Q122639242','Steve Masters','human: no occupation stated','English speedway rider',null::date,null::date,'{}'::jsonb),
  ('Q123020669','Mike Paniccia','human: no occupation stated','American agent',null::date,null::date,'{}'::jsonb),
  ('Q123362574','Brandon Moore','human: no occupation stated','American criminal',null::date,null::date,'{}'::jsonb),
  ('Q123653334','Kevin Kramer','human: no occupation stated','researcher at University of Zurich',null::date,null::date,'{}'::jsonb),
  ('Q124364963','Tony Romero','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q124713055','Mario Romo','human: no occupation stated','Dutch criminal',null::date,null::date,'{}'::jsonb),
  ('Q125179851','Jay Johnson','human: no occupation stated','American business executive and model',null::date,null::date,'{}'::jsonb),
  ('Q125746133','James Stevens','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q126851149','Mike Mann','human: no occupation stated','candidate in the 2024 United Kingdom general election',null::date,null::date,'{}'::jsonb),
  ('Q127259156','Freddy Wolf Musaph','human: no occupation stated','Engelandvaarder','1917-08-12'::date,null::date,'{}'::jsonb),
  ('Q12795232','Luca','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q130802177','Christopher Brooks','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q130964883','David Griffin','human: no occupation stated',null,null::date,null::date,'{}'::jsonb),
  ('Q131166872','Benjamin Porter','human: no occupation stated','4 Feb 1711 - 28 Oct 1793',null::date,null::date,'{}'::jsonb),
  ('Q13258171','Alex','unisex given name','unisex given name',null::date,null::date,'{}'::jsonb),
  ('Q133687901','<no label>','human: no occupation stated',null,null::date,null::date,'{"viaf": "8741496", "isni": "0000000114375207"}'::jsonb),
  ('Q134204','Blain','commune of France; human settlement','commune in Loire-Atlantique, France',null::date,null::date,'{"viaf": "153659072", "freebase_id": "/m/03nwc2s", "twitter": "Ville_de_Blain"}'::jsonb),
  ('Q13461585','Chaos','academic journal','journal "An Interdisciplinary Journal of Nonlinear Science"',null::date,null::date,'{"viaf": "42150468197804170808", "freebase_id": "/m/0100p_db"}'::jsonb),
  ('Q135321627','Bobby Garcia','human: no occupation stated','Filipino theatre (1969–2024)',null::date,'2024-12-17'::date,'{}'::jsonb),
  ('Q139281369','<no label>','human: no occupation stated',null,null::date,null::date,'{"viaf": "25337522", "isni": "0000000013579534"}'::jsonb),
  ('Q139347708','<no label>','human: no occupation stated',null,null::date,null::date,'{"viaf": "3578550", "isni": "0000000025929028"}'::jsonb),
  ('Q1416414','cabal','no P31 class stated','clever scheme or artful plot, usually crafted for evil purposes',null::date,null::date,'{"freebase_id": "/m/01_nl"}'::jsonb),
  ('Q146624','Zander','family name','family name',null::date,null::date,'{}'::jsonb),
  ('Q14915796','Tantrum Desire','musical duo',null,null::date,null::date,'{"twitter": "tantrumdesireuk", "instagram": "tantrumdesireuk", "facebook": "tantrumdesire"}'::jsonb),
  ('Q15710454','Dex','video game','2015 video game',null::date,null::date,'{"freebase_id": "/m/0zgcvmv"}'::jsonb),
  ('Q16559','Austin','city of Texas; big city; county seat','capital city of the U.S. state of Texas and seat of Travis County',null::date,null::date,'{"viaf": "411145424580086830801", "freebase_id": "/m/0vzm", "twitter": "austintexasgov"}'::jsonb),
  ('Q168983','conflagration','fire incident type','large and destructive fire that threatens human life, animal life, health, and/or property',null::date,null::date,'{"freebase_id": "/m/04lcnst"}'::jsonb),
  ('Q17863942','Danny','unisex given name','unisex given name',null::date,null::date,'{}'::jsonb),
  ('Q178885','deity','no P31 class stated','natural or supernatural god or goddess, divine being',null::date,null::date,'{"freebase_id": "/m/09tdq"}'::jsonb),
  ('Q18096864','Daimon','taxon','genus of insects',null::date,null::date,'{}'::jsonb),
  ('Q1823','Aceh','province of Indonesia','province of Indonesia',null::date,null::date,'{"viaf": "125827289", "freebase_id": "/m/016wj_"}'::jsonb),
  ('Q18857387','Greg','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q18978364','Killian','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q1902087','Marliese Arold','human: writer; science fiction writer; librarian; children''s writer; young adult author','German author','1958-03-29'::date,null::date,'{"viaf": "208676985", "isni": "0000000358466666"}'::jsonb),
  ('Q19800846','Trevor','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q19801832','Brett','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q19810348','Mika','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q19817033','Brent','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q19819798','Mickey','male given name; hypocorism','male given name',null::date,null::date,'{}'::jsonb),
  ('Q20098789','J.J.','given name; initials instead of given names','given name with these initials. Full name undetermined, not generally used or not determinable',null::date,null::date,'{}'::jsonb),
  ('Q2093070','Pierre','male given name; unisex given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q209690','Sir','title of honor; noble title; form of address in the United Kingdom; honorific prefix','honorific prefix',null::date,null::date,'{"freebase_id": "/m/01gzdk"}'::jsonb),
  ('Q21290538','Wagner Vittoria','human: no occupation stated',null,null::date,null::date,'{"twitter": "wagnerediego", "instagram": "wagnervittoria", "facebook": "brasilianoroma"}'::jsonb),
  ('Q21475944','Renzo','peninsula','peninsula in Antarctic Treaty area, Antarctica',null::date,null::date,'{}'::jsonb),
  ('Q2317740','Jason Collins','human: basketball player','American basketball player (1978–2026)','1978-12-02'::date,'2026-05-12'::date,'{"viaf": "308698265", "freebase_id": "/m/06r7g7", "imdb_id": "nm6547633", "twitter": "jasoncollins98", "instagram": "jasoncollins_98"}'::jsonb),
  ('Q234213','adultery','no P31 class stated','extramarital sex without the consent of the married participant''s spouse',null::date,null::date,'{"freebase_id": "/m/0g1nj"}'::jsonb),
  ('Q24969195','Kyler','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q25110345','LeoVegas','business; enterprise; public company','Swedish mobile gaming company and provider of online casino and sports betting services',null::date,null::date,'{"twitter": "leovegasuk", "instagram": "leovegassverige"}'::jsonb),
  ('Q2712864','Harrison','family name; family name based on given name','family name',null::date,null::date,'{}'::jsonb),
  ('Q33129699','Porfirio','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q354507','Raphael','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q3579048','Diego','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q372250','Adrian','male given name; unisex given name; female given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q374175','Brad Davis','human: stage actor; film actor; television actor; actor','American actor (1949–1991)','1949-11-06'::date,'1991-09-08'::date,'{"viaf": "59269166", "isni": "0000000116521255", "freebase_id": "/m/020vs2", "imdb_id": "nm0001113"}'::jsonb),
  ('Q38848','heavy metal music','music genre; conflation','genre of rock music characterized by slack-tuned instruments, and unconventional changes of tonality (key) and time signature (metre)',null::date,null::date,'{"freebase_id": "/m/03lty"}'::jsonb),
  ('Q44165','Diablo','video game series','video game series initially developed by Blizzard North and continued by Blizzard Entertainment',null::date,null::date,'{"freebase_id": "/m/04cxkz2"}'::jsonb),
  ('Q45727','Ignition','album','1992 studio album by The Offspring',null::date,null::date,'{"freebase_id": "/m/0179cm"}'::jsonb),
  ('Q4822728','Eycelli','mahalle','mahalle (administrative quarter) in Nazilli, Aydın, southwestern Turkey',null::date,null::date,'{"freebase_id": "/m/0kvgx78"}'::jsonb),
  ('Q482994','album','music release type','grouping of album releases by an artist usually released at the same time with the same title and tracks but in different formats for consumption (digital, CD, LP)',null::date,null::date,'{"freebase_id": "/m/02lx2r"}'::jsonb),
  ('Q4924358','Blake Daniels Cottage','house','building in Massachusetts, United States',null::date,null::date,'{"freebase_id": "/m/05h2dln"}'::jsonb),
  ('Q4927937','Robert','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q49855817','Big Beef Creek','stream','tributary to Hood Canal in Kitsap County, Washington, United States',null::date,null::date,'{}'::jsonb),
  ('Q50968686','Cevenna (Pauly-Wissowa)','cross-reference','cross-reference in Paulys Realencyclopädie der classischen Altertumswissenschaft (RE)',null::date,null::date,'{}'::jsonb),
  ('Q54871254','Davin','family name','family name',null::date,null::date,'{}'::jsonb),
  ('Q5807533','Dionisio','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q6166921','Jay Michaels','human: no occupation stated','Canadian broadcaster',null::date,null::date,'{"freebase_id": "/m/07t_lk", "imdb_id": "nm1450694", "twitter": "maddogvirgin"}'::jsonb),
  ('Q62084764','Sam Swift','fictional human; television character',null,null::date,null::date,'{}'::jsonb),
  ('Q628099','association football coach','profession','person doing training of association footballers (profession/occupation); for team position (head coach or manager) use Q136659823',null::date,null::date,'{}'::jsonb),
  ('Q63204650','Dempsey','given name','given name',null::date,null::date,'{}'::jsonb),
  ('Q64138507','Cory Adams','human: no occupation stated',null,'1958-01-01'::date,'2016-11-15'::date,'{"viaf": "61151897119224070126"}'::jsonb),
  ('Q6750969','Manny','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q6847825','Mike Martinez','human: no occupation stated','American politician in Texas (born 1969)','1969-08-01'::date,null::date,'{"freebase_id": "/m/0gg5v2s"}'::jsonb),
  ('Q745019','Colt''s Manufacturing Company','business; enterprise; subsidiary company','American firearms manufacturer',null::date,null::date,'{"viaf": "125714542", "isni": "0000000102408390", "freebase_id": "/m/023rzc"}'::jsonb),
  ('Q75476690','Bradley Hudson','human: no occupation stated','Peerage person ID=165748',null::date,null::date,'{}'::jsonb),
  ('Q75486251','Oscar Patrick Wood','human: no occupation stated','(died 1994)',null::date,'1994-01-29'::date,'{}'::jsonb),
  ('Q75486845','Jake Bolton','human: no occupation stated','(born 1996)','1996-04-11'::date,null::date,'{}'::jsonb),
  ('Q75655567','Christian Kirwan','human: no occupation stated','Peerage person ID=275688',null::date,null::date,'{}'::jsonb),
  ('Q75699212','Carlos Anthony Kiri Cook','human: no occupation stated','Peerage person ID=293037',null::date,null::date,'{}'::jsonb),
  ('Q76031597','Michael Patrick Brawn','human: no occupation stated','(born 1958)','1958-05-16'::date,null::date,'{}'::jsonb),
  ('Q7613194','Steve Lucas','human: no occupation stated','Canadian general','1952-02-24'::date,null::date,'{"viaf": "121997021", "freebase_id": "/m/02q9yh4"}'::jsonb),
  ('Q76166339','Christian Xavier du Bouzet','human: no occupation stated','(born 1942)',null::date,null::date,'{}'::jsonb),
  ('Q76290169','John Danter','human: no occupation stated','Peerage person ID=666157',null::date,null::date,'{}'::jsonb),
  ('Q76333040','Phillip Fox','human: no occupation stated','Peerage person ID=695629',null::date,null::date,'{}'::jsonb),
  ('Q852779','Valentin','male given name','male given name',null::date,null::date,'{}'::jsonb),
  ('Q96007415','Edwin Sykes','human: no occupation stated','historical figure',null::date,null::date,'{}'::jsonb),
  ('Q96398370','Papi Chulo','single','2020 single by Octavian and Skepta',null::date,null::date,'{}'::jsonb),
  ('Q98669171','Jacen','male given name','male given name',null::date,null::date,'{}'::jsonb);

do $repair$
declare
  v_actor      text := 'migration:99991789833562_personality_wrong_entity_repair';
  v_rejected   int;
  v_repaired   int;
begin
  perform set_config('app.actor', v_actor, true);

  -- 1. Reject the open adult-link proposals whose subject is the wrong entity.
  --    reviewer_id stays NULL and the note carries an `auto-` prefix: the house
  --    convention that keeps a machine close distinguishable from a human one.
  --    status is 'rejected' and never a new value, because every producer's
  --    idempotency keys on status='open' and uq_erq_open is partial over open
  --    rows -- any other value is re-inserted as open on the next pass.
  with hit as (
    select q.id, w.qid, w.wd_label, w.wd_class
      from public.entity_review_queue q
      join public.personalities p on p.id = q.entity_id
      join _wrong_entity w        on w.qid = p.wikidata_qid
     where q.entity_type = 'personality'
       and q.status      = 'open'
       and q.model like 'adult-profile-probe:%'
  )
  update public.entity_review_queue q
     set status        = 'rejected',
         reviewed_at   = now(),
         reviewer_note = 'auto-wrong-entity: personalities.wikidata_qid ' || hit.qid
                         || ' is ' || hit.wd_label || ' (' || hit.wd_class
                         || '), not this performer'
    from hit
   where q.id = hit.id;
  get diagnostics v_rejected = row_count;

  -- 2. Retract only the fields this row provably inherited from the wrong
  --    entity, swap the identifier for the SKIP_ sentinel, and record the
  --    finding. Every branch is guarded on the wrong entity's own value, so a
  --    human who has already corrected a field keeps their work.
  update public.personalities p
     set description  = case when p.description is not distinct from w.wd_desc  then null else p.description end,
         birth_date   = case when p.birth_date  is not distinct from w.wd_birth then null else p.birth_date  end,
         death_date   = case when p.death_date  is not distinct from w.wd_death then null else p.death_date  end,
         external_ids = (
           select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
             from jsonb_each_text(coalesce(p.external_ids, '{}'::jsonb)) e
            where w.wd_ext ->> e.key is distinct from e.value
         ),
         wikidata_qid = 'SKIP_' || gen_random_uuid()::text,
         needs_attention = true,
         enrichment_status = coalesce(p.enrichment_status, '{}'::jsonb)
           || jsonb_build_object('wrong_entity_candidate', jsonb_build_object(
                'state', 'confirmed',
                'qid',   w.qid,
                'label', w.wd_label,
                'class', w.wd_class,
                'by',    v_actor,
                'at',    now()
              ))
    from _wrong_entity w
   where p.wikidata_qid = w.qid;
  get diagnostics v_repaired = row_count;

  raise notice 'rejected % review rows, repaired % personalities', v_rejected, v_repaired;
end $repair$;

do $verify$
declare
  v_qid_left     int;
  v_open_left    int;
  v_desc_left    int;
  v_null_qid     int;
  v_controls     int;
  v_demoted      int;
  v_flagged      int;
begin
  -- Soft on preconditions, hard on postconditions: every check below asserts the
  -- state this file exists to REACH, so a concurrent session that repaired some
  -- of these rows first composes instead of aborting db push for the whole repo.

  -- (1) no personality still carries one of the 125 wrong identifiers
  select count(*) into v_qid_left
    from public.personalities p join _wrong_entity w on w.qid = p.wikidata_qid;
  if v_qid_left <> 0 then
    raise exception 'wrong-entity repair: % personalities still carry a refuted wikidata_qid', v_qid_left;
  end if;

  -- (2) the identifier was replaced, never nulled -- a NULL would let
  --     personality-refresh re-resolve by name and re-mint the same bad match
  select count(*) into v_null_qid
    from public.personalities p
   where p.enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed'
     and (p.wikidata_qid is null or p.wikidata_qid !~ '^SKIP_');
  if v_null_qid <> 0 then
    raise exception 'wrong-entity repair: % repaired rows lack a SKIP_ sentinel', v_null_qid;
  end if;

  -- (3) no open adult-link proposal survives on a confirmed wrong-entity row
  select count(*) into v_open_left
    from public.entity_review_queue q
    join public.personalities p on p.id = q.entity_id
   where q.entity_type = 'personality' and q.status = 'open'
     and q.model like 'adult-profile-probe:%'
     and p.enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed';
  if v_open_left <> 0 then
    raise exception 'wrong-entity repair: % open adult-link rows remain on refuted rows', v_open_left;
  end if;

  -- (4) no repaired row still publishes the wrong entity's own description
  select count(*) into v_desc_left
    from public.personalities p join _wrong_entity w
      on w.qid = p.enrichment_status -> 'wrong_entity_candidate' ->> 'qid'
   where w.wd_desc is not null and p.description = w.wd_desc;
  if v_desc_left <> 0 then
    raise exception 'wrong-entity repair: % rows still carry the wrong entity description', v_desc_left;
  end if;

  -- (5) CONTROLS. These four are correct identifiers on public, indexable rows
  --     and MUST survive: a sweep that cleared everything would satisfy (1)-(4).
  select count(*) into v_controls
    from public.personalities
   where wikidata_qid in ('Q947588','Q24955325','Q1286616','Q6446890');
  if v_controls <> 4 then
    raise exception 'wrong-entity repair: expected 4 control QIDs intact, found %', v_controls;
  end if;

  -- reported, not gated: the outing guard legitimately demotes some rows
  select count(*) into v_flagged from public.personalities
   where enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed';
  select count(*) into v_demoted from public.personalities
   where enrichment_status -> 'wrong_entity_candidate' ->> 'state' = 'confirmed'
     and not seo_indexable;
  raise notice 'wrong-entity repair OK: % flagged, % now non-indexable', v_flagged, v_demoted;
end $verify$;

drop table _wrong_entity;
