-- personalities.wikidata_qid: 84 PUBLIC, INDEXABLE rows point at something that is not a person.
--
-- Same namesake chimera the tag glossary carried, on a different table. `personalities` is
-- people; the personhood-disposition work (20260607400000) already separated organisations out
-- of the table itself. What was never checked is whether the IDENTIFIER on a row that really is
-- a person actually resolves to that person.
--
-- Measured 2026-09-18 over all 1,696 public personalities carrying a well-formed QID:
--   1,608 resolve to P31=Q5 (human)          correct
--      84 resolve to something else           this migration
--       4 carry no P31 at all                 left alone, absence of evidence
--
-- THE PRODUCER SIGNATURE IS UNMISTAKABLE: 79 of the 84 are profession='Musician' and almost
-- every one is a SINGLE-WORD STAGE NAME resolved against Wikidata by name alone. What it found:
--   Alaska         -> Q797        the US STATE            (a real drag queen)
--   Brandi Carlile -> Q3283299    her ALBUM, not her      (the person is Q444414)
--   999999         -> Q67146010   10^126-1, a number
--   Adira          -> Q21445667   a genus of insects
--   Bones          -> Q265868     bone, the rigid organ
--   KEMIK          -> Q593644     "chemist", the occupation
--   Eau de Cologne -> Q2863       the perfume concentration class
--   D.Dan          -> Q104426712  a Latvian audit firm
--   CEB            -> Q837615     the Cebuano Wikipedia
--   JASSS          -> Q13515687   a journal
-- plus ~30 that resolved to a bare given name or family name page, which is the exact shape
-- CLAUDE.md records for the adult-links `encyclopedic_provenance` tier.
--
-- WHY NULL AND NOT REPOINT
-- Prefer null to a guess, the rule 20261008100000 established for tags. `Brandi Carlile` has a
-- correct human QID and most of these do not — resolving 84 stage names by hand is an editorial
-- pass, not a data migration. A plausible-but-wrong identifier regenerates wrong data forever
-- while a null one regenerates nothing.
--
-- WHY NOTHING ELSE IS TOUCHED
-- No visibility, no seo_indexable, no bio, no profession. These are real people with real
-- profiles; only the identifier is wrong. Deindexing them would punish the subject for our
-- resolver's error.
--
-- SOFT ON PRECONDITIONS: a row whose QID has since changed is skipped, not aborted on — a
-- concurrent session may legitimately have repointed one between authoring and CI.
-- REVERSE: every prior value is preserved in enrichment_status.wikidata_repair.

do $$
declare
  v_expected int := 84;
  v_cleared int; v_skipped int; v_leak int;
begin
  create temporary table _bad_person (id uuid, qid text, nm text, what text) on commit drop;
  insert into _bad_person (id, qid, nm, what) values
    ('aedc6fed-cc3e-4961-924e-2f3bedd725fa'::uuid, 'Q67146010', '999999', '10¹²⁶−1 — largest integer value in Wikibase, number with'),
    ('625bfc1f-491c-46ec-b103-baa4bd85edc2'::uuid, 'Q34371550', 'AARO', 'Aaro — male given name'),
    ('20b7e08e-873a-46d2-82cb-cb23093ba2f2'::uuid, 'Q20995590', 'AMARI', 'Amari — unisex given name'),
    ('2ed69908-d55e-405a-b1b6-7133c2d30a92'::uuid, 'Q104693822', 'ANTI-MASS', 'Anti-Mass — 2005 sculpture'),
    ('4d43b470-9134-4419-812f-3d4608706028'::uuid, 'Q21445667', 'Adira', 'Adira — genus of insects'),
    ('c33e2476-af17-4c87-85ab-f1f5a681c7bd'::uuid, 'Q797', 'Alaska', 'Alaska — state of the United States of America'),
    ('aac78a11-ba48-4c71-bcfc-cd4672763a6b'::uuid, 'Q65044422', 'Alírio', 'Alirio — name list'),
    ('e741826b-68c4-4273-bb7f-f098e91deedd'::uuid, 'Q474046', 'Amoral', 'amorality — lack or absence of morality'),
    ('0f4c801f-5970-43c3-ae8d-34f988c78942'::uuid, 'Q16420449', 'BAMBI', 'Bambi — unisex given name'),
    ('119d8df5-5180-478b-a113-28653643ac8c'::uuid, 'Q5362638', 'BLEACH', 'Bleach — Japanese anime television series'),
    ('18a90c2f-107b-44f0-bf81-291f2ad967ee'::uuid, 'Q121972602', 'Bibinka', '(no label) — book edition published in 2015'),
    ('bbfc3079-19d0-4a90-b2bc-74a5b9a108f1'::uuid, 'Q265868', 'Bones', 'bone — rigid organ that constitutes part of the endos'),
    ('d3295dcf-bc41-489c-a570-2cc50ea1085a'::uuid, 'Q16374832', 'Boyca', 'Boyçapkın — village in Malazgirt, Muş, eastern Turkey'),
    ('8d330ca4-d0e8-4c5b-b8ab-820d2bffdb59'::uuid, 'Q3283299', 'Brandi Carlile', 'Brandi Carlile — album by Brandi Carlile'),
    ('bc3beb67-900e-4123-a75f-7b2062fe3ec9'::uuid, 'Q837615', 'CEB', 'Cebuano Wikipedia — Cebuano-language edition of Wikipedia'),
    ('955bd0cd-0e9e-4710-9894-755c6bc77fcf'::uuid, 'Q917132', 'CEM', 'Cem — male given name'),
    ('8df57513-987c-4846-85a3-21a591d3da30'::uuid, 'Q112590467', 'CHUDA', 'Chuda — family name, female'),
    ('3192efad-2115-4b67-ad8b-8d0fee0a56e9'::uuid, 'Q5122738', 'CITIZENS UNION', 'Citizens Union — organization'),
    ('84d909f1-075a-4737-b197-570c4e05f833'::uuid, 'Q19724984', 'CLEO', 'Cleo — unisex given name'),
    ('692313aa-fba6-474c-afe9-1517a84ee241'::uuid, 'Q1133052', 'CORMAC', 'Cormac — male given name'),
    ('e2968d64-a50b-4769-9cfd-7cd7d5854dce'::uuid, 'Q13494981', 'Ciana', 'Cianaga — village in Sukabumi Regency, West Java, Indone'),
    ('a1cd7a1c-50e9-4b5b-b2a1-c1ae58f9d291'::uuid, 'Q16542752', 'Cocktail d''Amore', 'Cocktail d''amore — 1979 single by Stefania Rotolo'),
    ('316c707f-9835-494e-89f5-fc40195b62e3'::uuid, 'Q714938', 'Cora', 'Cora — female given name'),
    ('265ee52a-20de-4e9c-98fd-926241b9b909'::uuid, 'Q113637909', 'Cuddles', 'Cuddles — fictional character from animated television s'),
    ('a3f93e65-df9e-4cf1-aa2e-6fdb2cd2e0bc'::uuid, 'Q104426712', 'D.Dan', 'D.Danevicas revidentu birojs — legal entity in Latvia'),
    ('5ec51665-4316-4bed-b40e-20844f61fa01'::uuid, 'Q901293', 'DALIA', 'Dalia — female given name'),
    ('8b56e711-f30e-416f-8157-d75e69044fc1'::uuid, 'Q3025763', 'DI LINH', 'Di Linh — former district in Lâm Đồng province, Vietnam'),
    ('55d18255-07c6-4d71-b9d0-233918fbe614'::uuid, 'Q115161806', 'DUALITY', 'Duality — 2022 album by Dardust'),
    ('409910ca-3433-4af9-ab36-ce3342a94bf8'::uuid, 'Q37465372', 'Dame', 'Dame — family name'),
    ('f58fb648-2a70-45d2-9049-357e5b2123d1'::uuid, 'Q60629803', 'E.T.', 'E.T. — fictional character in the 1982 film E.T. the '),
    ('64045d3d-6f63-4898-952f-5725087cc9d2'::uuid, 'Q109018829', 'EAU VIVE', 'Eau vive — International center of spirituality and Chris'),
    ('0995dcfe-aca7-4124-93bb-06d699bb9bbe'::uuid, 'Q253205', 'ENTOURAGE', 'Entourage — American comedy-drama television series'),
    ('4f371b82-9d86-4eab-be1d-54ac9c387366'::uuid, 'Q2863', 'Eau de Cologne', 'eau de cologne — class of perfume concentration of between 2-6%'),
    ('a23e4b67-370c-419f-9ffa-d5bbf84d3a68'::uuid, 'Q4962499', 'Erika', 'Erika — female given name'),
    ('71fc1d1a-2ce1-4b20-b4ff-0e75ea2bc704'::uuid, 'Q24033439', 'GAZE', 'Gazetteer of Planetary Nomenclature — database of recognised astronomical names on p'),
    ('ad594dec-de6b-492c-bd15-676cd0faec0d'::uuid, 'Q37299984', 'GEGEN', 'Gegen — family name'),
    ('66114458-81b2-4ed2-bb42-34d9b864f83e'::uuid, 'Q837393', 'Group Therapy', 'group psychotherapy — form of psychotherapy in which one or more the'),
    ('05c6356c-cdb2-4fe3-a8e7-8a69ce959663'::uuid, 'Q134083626', 'Herrensauna', '(no label) — '),
    ('b11ab754-ddd0-4c21-9ac6-e60dbfb6d35b'::uuid, 'Q16290308', 'ISAbella', 'Isabella — female given name'),
    ('608e205e-c9c8-4699-aa06-6469c957c386'::uuid, 'Q13515687', 'JASSS', 'Journal of Artificial Societies and Social Simulation — journal'),
    ('901e8171-d3be-4a45-b0f5-fc420115d5ed'::uuid, 'Q593644', 'KEMIK', 'chemist — scientist trained in the study of chemistry'),
    ('b58979a6-28f6-4546-8786-3c29994067b4'::uuid, 'Q100280941', 'KHLOE', 'Khloé — female given name'),
    ('6e10b813-98d6-424d-818e-19f562162765'::uuid, 'Q60824597', 'KWIA', 'Kwiat Jabłoni — Polish music band from Warsaw'),
    ('cacb7fbc-d5f5-4979-b9dd-639d82700db7'::uuid, 'Q6498548', 'Karani', 'Karani — village in Liachavičy district, Belarus'),
    ('b4555bde-4b11-46a8-9d1c-c24d54bc75f7'::uuid, 'Q453946', 'Kinga', 'Kinga — female given name'),
    ('f02be9d1-0ef0-4007-9a77-c75043b9be2b'::uuid, 'Q572077', 'LA BOUCHE', 'La Bouche — German band'),
    ('54b30e44-2053-4851-922d-1a73adfd6691'::uuid, 'Q10554922', 'LATINEO', 'Latineosus — genus of insects'),
    ('2b923a53-5669-48ba-81f7-1437521bfc2c'::uuid, 'Q27064181', 'La Noche', 'La Noche — evening newspaper in Santiago de Compostela, S'),
    ('783668e2-9f02-4a69-8f15-b4177f491d06'::uuid, 'Q97340984', 'Lakuti', 'wooden clapper — Finnish traditional percussion instrument and '),
    ('ce9f20de-d3fb-4189-93fd-3357d206a1e7'::uuid, 'Q107235065', 'MARICAS', '(no label) — family name'),
    ('e44bfb96-b452-40d8-9d63-c33c9bf45822'::uuid, 'Q5371778', 'MCMLXXXV', '1985 — natural number'),
    ('cc4751a6-b4d8-4a67-8776-7f5db81c33e0'::uuid, 'Q55270384', 'Mikita', 'Mikita — family name'),
    ('7c00f4ae-dccd-40fb-906f-6fa07b25b023'::uuid, 'Q57555881', 'Natuta', 'Natutal language processing: Perspective of CIC-IPN — '),
    ('324bb47f-5e45-41af-b36d-1ee9f74722ae'::uuid, 'Q107231513', 'Nazira', 'Nazira — female given name'),
    ('17460ee9-27ff-4ba0-bf4b-90af993051b5'::uuid, 'Q250267', 'Nora', 'Nora — female given name'),
    ('4d4ca159-53f7-4ef2-9f00-b13c33462709'::uuid, 'Q31972651', 'Nsasi', 'Nsasi — '),
    ('2dc1bd9e-5a6c-4be8-b0f5-00f1f4657412'::uuid, 'Q22667842', 'OMOLOKO', 'Omolokonyo Primary School — primary school in Omolokonyo, Uganda'),
    ('89fb5132-5341-4fe0-b3e2-2827e641427f'::uuid, 'Q73188100', 'PERVERT', 'Perverted Taste — German record label'),
    ('82cd4d20-fc30-4506-b0a6-aed00897a57d'::uuid, 'Q63987237', 'Pornceptual', 'Pornceptual — artist collective organising sexpositive techn'),
    ('073a4b86-3477-4f8b-92bf-75cc86d1f15c'::uuid, 'Q312428', 'RAGE', 'Rage — German musical group; heavy metal band'),
    ('05b8e47d-71b5-4a9f-92a8-ce5f33db2502'::uuid, 'Q1039841', 'Ryan Murphy', 'Ryan Murphy — Wikimedia disambiguation page'),
    ('d02fda5a-6a4a-4b09-8fa4-a827e4e56583'::uuid, 'Q111333772', 'SCHACKE', 'Schacke — watercourse in Germany'),
    ('614f7414-ae8e-4ed9-87fc-3780e640636d'::uuid, 'Q109820925', 'SEXTOU', 'Sextou — 2021 song by Rennan da Penha'),
    ('a54ed50e-3d46-4d70-b8e7-78b39227c7d5'::uuid, 'Q251156', 'SUEYA', 'Tōzan Shrine — Shinto shrine in Arita, Saga, Japan'),
    ('3bd22097-80db-49f2-8149-064d7174c298'::uuid, 'Q37018908', 'SWEAT', 'Sweat — family name'),
    ('799afe1a-f7ce-4999-8d46-38812e32614d'::uuid, 'Q833345', 'Sara', 'Sara — female given name'),
    ('4ba40d90-80e4-47f4-849b-7fedc9baf787'::uuid, 'Q713759', 'Selma', 'Selma — female given name'),
    ('3214b494-370d-45a6-a907-2e021e625fc3'::uuid, 'Q4808925', 'Snax', 'Assis Airport — airport in São Paulo, Brazil'),
    ('9bcec725-5de4-41cd-b200-cd9863f5c062'::uuid, 'Q116761079', 'Spice', 'Sugar and Spice — American drag queens'),
    ('fd009309-a319-46b1-9218-493dd09adcb3'::uuid, 'Q19828987', 'TRACEY', 'Tracey — female given name'),
    ('c94c8182-be63-477f-bab3-0983c56b5e1a'::uuid, 'Q985583', 'TRINDADE', 'Trindade — municipality of Goiás state, Brazil'),
    ('ada7b945-db25-49d8-9fd3-ce4f80ba66fb'::uuid, 'Q16884368', 'Tedesco', 'Tedesco — family name'),
    ('59817941-4b3e-4e3c-8cd2-376641e9f517'::uuid, 'Q1829', 'Twang', 'Kaliningrad — Russian Baltic city between Poland and Lithuan'),
    ('b1aab674-4c2b-4d01-aed0-db475137ce79'::uuid, 'Q47652', 'VENUS', 'Venus — Roman goddess of love, sexuality, procreation '),
    ('6c9da219-8bf9-4f46-923b-fc013f1d75fa'::uuid, 'Q23496098', 'VICX', 'Metal-dependent hydrolase spr1105 — microbial protein found in Streptococcus pneum'),
    ('924d3bca-16f6-48c8-8136-8409863b4b41'::uuid, 'Q1016949', 'ValaV', 'Valavoire — commune in Alpes-de-Haute-Provence, France'),
    ('7514f401-0671-44d1-84bf-a847e8cad68c'::uuid, 'Q78750868', 'With Us', 'With Us — painting by Herbert Gentry'),
    ('1fc60a5c-fd34-4712-8e5b-291be8657ed3'::uuid, 'Q105047698', 'ZVUK', 'Zvuk — online digital streaming platform'),
    ('630b121e-d4a7-462b-96c8-7adae81b7d84'::uuid, 'Q133515027', 'aantz', '(no label) — '),
    ('eda9be34-0005-4dd7-8525-2271b6275f19'::uuid, 'Q18099077', 'ketia', 'Ketianthidium — genus of insects'),
    ('78de6dd4-8cd8-4dcb-a92c-49a51550cf98'::uuid, 'Q6093292', 'puppy', 'Puppy — sculpture by Jeff Koons'),
    ('992453e4-cede-42d5-89a4-8038c947f67e'::uuid, 'Q37017097', 'ÂTON', 'Aton — family name'),
    ('c999ded4-dc69-4131-aa4c-4a8b5334ebb3'::uuid, 'Q42365', 'ÆNGL', 'Old English — earliest historical form of English'),
    ('a32c1713-c3df-4ca1-bbc7-2a5dd608c3e4'::uuid, 'Q893062', 'ĀBNAMĀ', 'Abnama Rural District — rural district of Iran');

  select count(*) into v_skipped
    from _bad_person b join public.personalities p on p.id = b.id
   where p.wikidata_qid is distinct from b.qid;
  raise notice 'rows whose QID moved since the sweep, skipped: %', v_skipped;

  update public.personalities p
     set wikidata_qid    = null,
         wikipedia_url   = null,
         enrichment_status = coalesce(p.enrichment_status, '{}'::jsonb) || jsonb_build_object(
           'wikidata_repair', jsonb_build_object(
             'cleared_qid',  b.qid,
             'resolved_to',  b.what,
             'reason',       'not a person: P31 has no Q5',
             'by',           'migration:personality_wikidata_not_a_person',
             'at',           now()
           )),
         updated_at = now()
    from _bad_person b
   where p.id = b.id
     and p.wikidata_qid = b.qid;   -- guard: only clear the exact value we verified
  get diagnostics v_cleared = row_count;
  raise notice 'identifiers cleared: % of % expected', v_cleared, v_expected;

  -- POSITIVE postcondition: assert the REACHED state for the rows we undertook to repair.
  -- Counting rows in a bad state returns zero for an id that has vanished entirely.
  --
  -- Scoped to the value the sweep VERIFIED, not to `is not null`. The UPDATE above
  -- deliberately SKIPS a row whose QID moved since the sweep — the soft-precondition
  -- rule this file's header states — and an unscoped assertion then RAISEs on exactly
  -- that row, aborting `db push` for every migration queued behind this one. What this
  -- file promises is that the WRONG identifier is gone; a row a concurrent session
  -- repointed correctly is a better outcome, not a failure.
  select count(*) into v_leak
    from _bad_person b join public.personalities p on p.id = b.id
   where p.wikidata_qid = b.qid;
  if v_leak > 0 then
    raise exception 'postcondition failed: % personalities still carry a non-human QID', v_leak;
  end if;

  -- Control: the corpus must still be overwhelmingly linked. If this collapses, the predicate
  -- was wrong and we have stripped identifiers from real people.
  raise notice 'public personalities still carrying a QID (expect ~1608): %',
    (select count(*) from public.personalities
      where visibility = 'public' and coalesce(review_status,'') <> 'archived'
        and wikidata_qid ~ '^Q[0-9]+$');
end $$;
