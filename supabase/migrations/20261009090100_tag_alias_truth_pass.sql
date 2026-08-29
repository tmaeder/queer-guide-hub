-- Tag glossary content quality, phase 2: the synonym truth pass.
--
-- Every typed alias row (synonym/abbreviation/spelling_variant/brand_name,
-- ~300 rows) was read by hand on 2026-08-29 and re-filed by what the
-- relationship actually is. The rule set:
--
--   * A SYNONYM is another name for the SAME thing (street name, chemical
--     name, brand, translation). "Snus" is not another name for tobacco —
--     it is a tobacco product; "Lean" is a drink containing codeine;
--     "Conversion Therapy Ban" is legislation ABOUT the practice. ~1/3 of
--     the typed-synonym rows failed this test.
--
--   * Most failures are NOT junk: they are narrower terms deliberately
--     routed to the tag that covers them ("2C-T-7" → the 2C-T-X group page,
--     "Crack Cocaine" → Cocaine). That routing is load-bearing — it drives
--     auto-tagging and search landing — so those rows are RE-TYPED to a new
--     alias_type 'covers' ("Also covers: …"), not deleted. This is the
--     "related terms represent a different kind of relationship" rule
--     applied to the alias table: the relationship gets a name instead of
--     masquerading as synonymy. (tag_relations can only hold edges between
--     two EXISTING tags; these targets have no tag of their own, which is
--     exactly why they live here.)
--
--   * Aliases that are the tag's own name with a parenthetical gloss
--     ("MDMA (Ecstasy)", "Two-Spirit (specific to some Indigenous
--     cultures)") are deleted; where the gloss itself is a real alias not
--     already present, it is inserted clean ("Narcan", "Drug Checking").
--
--   * Translations mistyped 'synonym' become 'multilingual' ("Lesben",
--     "Fußball"). A foreign-language STREET NAME stays a synonym ("Shabu",
--     "Yaba") — it names the same substance, it is not a translation.
--
--   * review_status='approved' is granted ONLY where the alias cannot
--     mistag unrelated content — approved aliases are auto-tagging rules
--     (20260910151200; the `culture`→Crops precedent). Mechanical variants
--     of the tag's own name and unambiguous clinical/chemical/brand names
--     are approved; ordinary-word street names (Speed, Acid, Ice, Emma,
--     Hero, Vitamin K, ART, CBT, Oxy, Wax) STAY 'auto' — true synonyms,
--     but catastrophic tagging rules — pending a display/tagging decouple.
--
--   * Aliases minted from a Wikidata id the wrong-entity repair
--     (20261008100000) CLEARED are deleted: they are the wrong entity's
--     sitelinks ("Neptunic" → "IMO 8805614"). Concept-class 'review' rows
--     keep theirs until a human rules on the identifier.
--
-- All row targets are by primary key (stable on prod, where every id was
-- read); a row a sibling session already fixed simply no-ops. Deletes clean
-- their un-activated search_synonyms bridge rows first (FK is SET NULL —
-- the 20260802123625 lesson). Three twin-tag pairs surfaced by this pass
-- need merge_tag_concept, not alias surgery, and are left for the merge
-- queue: "Risk-Aware Consensual Kink" / "… (RACK)", "Facesitting" /
-- "Face Sitting", "Reagent Testing" / "Drug Checking".

select set_config('app.actor', 'admin:tag-alias-truth-pass-20260829', true);

-- 0) vocabulary: 'covers' — a narrower/contained term routed to the tag
--    that covers it. Display label "Also covers".
alter table public.tag_aliases drop constraint tag_aliases_alias_type_check;
alter table public.tag_aliases add constraint tag_aliases_alias_type_check
  check (alias_type = any (array[
    'synonym','abbreviation','spelling_variant','plural','deprecated',
    'historical','brand_name','multilingual','covers'
  ]));
comment on column public.tag_aliases.alias_type is
  'synonym = another name for the same thing; covers = narrower/contained term deliberately routed to the covering tag (member of a group page, product form, preparation, sub-topic); multilingual = translation. A foreign-language street name is a synonym, not multilingual.';

-- 1) DELETE: glosses, parenthetical dupes, and wrong-direction aliases
--    (an alias broader than its own tag routes readers backwards).
with doomed(id, why) as (values
  ('c84b4322-7b32-4794-8781-82881ed25a59'::uuid, '2C-x is the FAMILY; 2C-B is a member — broader than its tag'),
  ('cd8e8738-0db4-4b37-8d8b-372c6be8a074'::uuid, '"Ballroom Ikone" is a person archetype from news vocab, not the scene'),
  ('399da646-79ab-4a30-90c6-c56691866cb5'::uuid, '"leather" is the fetish/community, not the bar type'),
  ('0ab55bd8-c5f7-4e69-8135-a0ca01bac28d'::uuid, 'lgbtqia-phobia is BROADER than homophobia (includes transphobia etc.)'),
  ('91bbd529-4e61-4ace-a7df-6ffb05bb3b8e'::uuid, 'a club night is an event format, not the venue'),
  ('e5ba3c71-c23d-42f0-9dba-12020d84f1c9'::uuid, '"Performance art drag" is news-vocab word salad'),
  ('6cd0db31-d504-4f35-865e-b5aa71e89b16'::uuid, '"Step- Brother" is a spacing typo, not a spelling'),
  ('c3460cc0-b011-4a67-bf77-313045221123'::uuid, 'parenthetical dupe; "Marijuana" exists approved'),
  ('dff3dadd-db56-4490-8151-3761c829cec3'::uuid, 'parenthetical dupe of "Acid"'),
  ('4fe49c24-5679-4dce-8503-4156b77db4e9'::uuid, 'dupe of approved "MDMA/Ecstasy"'),
  ('b4694c15-f7d5-4513-a71f-52df1dcfb30d'::uuid, 'parenthetical dupe; "Magic Mushrooms" exists approved'),
  ('4f686e22-8cf7-415a-9378-4edaab8daca4'::uuid, 'parenthetical dupe; "Sildenafil" exists approved'),
  ('af180b91-fa46-43a9-a421-b396f5b710ac'::uuid, 'replaced by clean "Pre-exposure prophylaxis"'),
  ('db1140b2-e2a1-4821-90b4-ed6d73748d70'::uuid, '"… awareness" is a news-vocab topic string, not a name'),
  ('27c1c496-a24f-4ae2-b4dc-72b00fd0705f'::uuid, 'replaced by clean "AIDS Coalition to Unleash Power"'),
  ('95705107-1fc2-4db0-894d-023789137588'::uuid, 'gloss, not an alias'),
  ('20cf7d75-d0c2-406a-8e1c-b716e28cad5a'::uuid, 'gloss, not an alias'),
  ('2934f19a-61d7-4dbb-b447-96a77303044a'::uuid, 'gloss, not an alias'),
  ('9cfd462a-7c37-4ab9-83dd-b43f8530d4b9'::uuid, 'replaced by clean "Narcan"'),
  ('3b6b6bb2-5688-430b-a835-3de3504da522'::uuid, 'replaced by clean "Drug Checking"'),
  ('23881ac5-f39b-4993-9354-fd14c884bd52'::uuid, 'smothering is a distinct practice; replaced by clean "Face sitting"'),
  ('2df06640-5f93-4886-ab99-0406925ea984'::uuid, 'contains the tag name; "GBL" exists separately')
)
delete from public.search_synonyms s
using doomed d
where s.tag_alias_id = d.id and s.status <> 'active';

delete from public.tag_aliases where id in (
  'c84b4322-7b32-4794-8781-82881ed25a59','cd8e8738-0db4-4b37-8d8b-372c6be8a074',
  '399da646-79ab-4a30-90c6-c56691866cb5','0ab55bd8-c5f7-4e69-8135-a0ca01bac28d',
  '91bbd529-4e61-4ace-a7df-6ffb05bb3b8e','e5ba3c71-c23d-42f0-9dba-12020d84f1c9',
  '6cd0db31-d504-4f35-865e-b5aa71e89b16','c3460cc0-b011-4a67-bf77-313045221123',
  'dff3dadd-db56-4490-8151-3761c829cec3','4fe49c24-5679-4dce-8503-4156b77db4e9',
  'b4694c15-f7d5-4513-a71f-52df1dcfb30d','4f686e22-8cf7-415a-9378-4edaab8daca4',
  'af180b91-fa46-43a9-a421-b396f5b710ac','db1140b2-e2a1-4821-90b4-ed6d73748d70',
  '27c1c496-a24f-4ae2-b4dc-72b00fd0705f','95705107-1fc2-4db0-894d-023789137588',
  '20cf7d75-d0c2-406a-8e1c-b716e28cad5a','2934f19a-61d7-4dbb-b447-96a77303044a',
  '9cfd462a-7c37-4ab9-83dd-b43f8530d4b9','3b6b6bb2-5688-430b-a835-3de3504da522',
  '23881ac5-f39b-4993-9354-fd14c884bd52','2df06640-5f93-4886-ab99-0406925ea984'
);

-- 2) The clean forms extracted above. Probed against prod first:
--    "Drug Checking" and "Face sitting" are ACTIVE TAGS of their own
--    (drug-checking / face-sitting) — twin concepts of Reagent Testing and
--    Facesitting that belong to the merge queue, NOT to this alias table, so
--    they are not inserted. "AIDS Coalition to Unleash Power" already exists
--    as an auto multilingual row on ACT UP — corrected in place. "Ecstasy"
--    exists as auto multilingual on MDMA — retyped synonym but left auto:
--    lowercase "ecstasy" is an ordinary word and must not become a tagging
--    rule. Only "Pre-exposure prophylaxis" and "Narcan" are new (that slug
--    also belongs to a DEPRECATED tag, which per the 20260802123625 shadow
--    rule does not block an alias).
insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
select t.id, v.alias_name, v.alias_slug, v.alias_type, 'approved'
from (values
  ('prep',     'Pre-exposure prophylaxis', 'pre-exposure-prophylaxis', 'synonym'),
  ('naloxone', 'Narcan',                   'narcan',                   'brand_name')
) as v(tag_slug, alias_name, alias_slug, alias_type)
join public.unified_tags t on t.slug = v.tag_slug and t.status = 'active'
where not exists (
  select 1 from public.unified_tags u
  where lower(u.slug) = v.alias_slug and u.status = 'active'
)
on conflict (alias_slug) do nothing;

update public.tag_aliases a
set alias_type = 'synonym', review_status = 'approved'
from public.unified_tags t
where a.canonical_tag_id = t.id and t.slug = 'act-up'
  and a.alias_slug = 'aids-coalition-to-unleash-power';

update public.tag_aliases a
set alias_type = 'synonym' -- stays auto: ordinary word, unsafe tagging rule
from public.unified_tags t
where a.canonical_tag_id = t.id and t.slug = 'mdma'
  and a.alias_slug = 'ecstasy';

-- 3) RETYPE → multilingual (translations filed as synonyms)
update public.tag_aliases set alias_type = 'multilingual' where id in (
  '97e857df-704d-4f80-9631-32a9db7c67b7', -- Alcohol ← Alkohol
  'a82e600a-8041-4440-9538-ea2e6b95036a', -- Aromantic ← Aromantisch
  '9568d42d-4d18-4685-a5a6-ffaa0c98be05', -- Bear ← Bären
  '682b3d9d-f787-40ff-87c8-12b45ca99b1a', -- Fetish ← Fetisch
  'a1eb04fd-eadb-4c33-8858-9e1a7f412d8d', -- Football ← Fußball
  'b8d814e0-63b7-4d42-b1e2-767e2709c27b', -- Lesbian ← Lesben
  'b609b8fa-748d-405d-a348-4f3b48ab95f0', -- Martial Arts ← Kampfsport
  'd9ec71e4-d8a3-4236-b45e-6743726957ae', -- Non-Binary ← Nichtbinär
  '5602c9a2-fa30-4780-8e81-1500d69f6bf7', -- Queer Community ← Queere Community
  '3e334937-366b-40f0-92c3-24615d0d86fe', -- Sex-Positive ← Sexpositiv
  '285e652e-3d5d-481c-a98d-32ddf02295b1', -- Suicide ← Suizid
  'a4f813c5-0643-4401-bf9c-1b33f51eb027', -- Walking-Tour ← Stadttour
  '44f9cae7-8c90-4703-8fe1-db164f7039d8', -- Kratom ← Ketum (Malay name)
  '0427b2ed-0b1c-4d57-b08a-4a85cb1ab0df'  -- Dissociatives ← Dissociativa
);

-- 4) RETYPE → covers (member of a group page / product form / preparation /
--    active compound / sub-topic). review_status untouched: approved rows
--    keep tagging, auto rows stay dormant.
update public.tag_aliases set alias_type = 'covers' where id in (
  '30eda0ac-47e5-4245-8f19-5da193e70658','783eedfa-b81f-4151-b616-8d4c8d0bf6f3', -- 2C-T-X ← 2C-T-2 / 2C-T-7
  '065a5b9b-af34-491e-9e66-2a5a45d1f44b','0fc113f2-23bc-4868-b3d3-7ce8ad38575f', -- 3-CMC / 4-CMC ← members
  '22ccd883-41bf-47a1-b82d-e15d55c7f585', -- 3-CMC/4-CMC ← Clophedron (3-CMC name)
  '10469f48-76ac-45eb-afc0-2c8ea5975da6','02aee874-e91a-4654-8474-1b1aa2136a16', -- 5-MeO-xxT ← members
  '1775823e-f73d-444f-9a30-1a1f1f8676dd','d6226a45-f4ed-4312-a42a-62c78e57d4ba', -- DOM/DOI/DOB/DOC ← DOC / DOI
  '07ab3ffb-12d4-4e0e-b3f3-b0166a1f8491','2bcef8a7-a534-452e-ad68-6bcd002e1804','07e0edfb-2b1a-4ff6-a89b-9bf095447016', -- MDA/MDEA/MBDB ← members
  'b0afbd6e-0c05-4ce7-95da-e5c70256413e','65b1cbe5-b856-4150-a68a-a3f9f17a889b', -- NEP/NEH ← members
  'c44e2efe-a77a-4f59-8a31-dce6cbef1177','a3aac185-30c1-4db5-befc-a1963ca9de15','5ea79e4a-3b21-46b2-ae49-b0df5e203937', -- NBOMes ← members
  'ced1b846-fe7d-4bca-8489-1cf47d8ebf8c','81d6cd5b-a231-467d-90ea-a12d733c9d9b', -- Nitazenes ← members
  '38fd1d27-29c3-4dae-9582-2015eaafea66','7fca7d0e-6fee-4f17-b2d1-8e15e739c14c', -- GHB ← GBL / BDO (prodrugs)
  '66b4c0ff-8f4a-4933-af47-3d719ce06d9e','68593274-5c9a-4f89-8e83-b4e0500b2369','e2b99b48-c3ce-4c75-8d48-ebadfbf2446b', -- DMT ← Ayahuasca / Changa / 5-MeO-DMT
  '379816d8-c0fb-4e86-93e5-8358898cbae8','28707ef0-3a23-4e7e-9fa4-82d872e5ea92', -- Cocaine ← Crack / Freebase
  'e651998d-3d92-450d-bd2a-dcb8665628d1','b21a92e1-880c-4939-b23c-e49c1228eafe','2506f093-157b-4fd5-8832-851d1e9b0ada', -- Codeine ← Lean / Purple Drank / Sizzurp
  '85bc3453-236b-4ac0-9835-52d86b7af782', -- Salvia Divinorum ← Salvinorin A (active compound)
  'b11520a0-5fab-4863-86d9-a0bf7a2aa7f6', -- Mescaline ← Peyote (source cactus)
  '421605ce-9ead-412e-9314-4375e39aacd2', -- Ibogaine ← Iboga (source plant)
  'c0fa1d71-eff4-4b3e-accc-70fc98d0e0b2', -- Psilocybin ← Psilocin (metabolite)
  '4cf75b6c-2048-4f18-be6b-9d8bae8c0ddc', -- Kratom ← Mitragynin (active alkaloid)
  '4047adbb-9691-4be1-8b3c-32c73c0869a5','3e46c191-239b-47ab-8d71-d5cb8fe601fc','b1b66f7e-4089-42ac-9b67-d32063474f8f', -- Tobacco ← Cigarettes / Snus / Nicotine
  'cbec3baa-fc43-4a23-818f-bfa23a0b6f36', -- Deliriants ← Scopolamin (member)
  'b8085c77-3838-4a31-a19e-7b4a1cf00695','076b0990-9032-43fd-b3c2-43b5e7c15571', -- MAOIs ← Moclobemide / Phenelzine
  '3a2a95fe-aef2-45f1-8e31-177047d7bef2','7d7567ab-a43a-4dab-ba5d-3b9cc14bea2c', -- SSRIs ← Citalopram / Sertraline
  '8582ab3a-869b-4e16-8b3e-ee4b9be02e58', -- Lithium ← Lithium carbonate (salt form)
  '3dccfd6a-16a8-414e-8d23-898c6ef19531', -- Dexamphetamine ← Adderall (mixed salts product)
  'ac2d8083-230a-4b7e-9a85-767045e7fcbc','6817f938-6364-495a-8b25-fddad183ded6', -- Poppers ← Amyl / Isopropyl nitrite
  '448cfbd8-9e73-424a-9e6e-0b13ebe51b28', -- Bullying ← Cyberbullying
  '38e07b44-dac0-411d-8758-6c9bc57e53aa', -- Housing Instability ← Youth homelessness
  '978e44eb-12e4-43ba-abd4-8360b0a15ebf','d2da93ce-347d-4e24-ab2b-826005b406df', -- Conversion Therapy ← bans (topic coverage)
  'bd637988-cc4a-4a7c-b1e7-ae1fad9924ae','298551a5-c0b6-4016-8294-e4f6ccebbfcf', -- Coming Out ← process / stories
  'e7192629-a5a9-4d54-8d2d-091e350b5cf4','5093e895-6e27-4ca7-a9d3-0c4dc99a0717','284a4f96-b21e-4e39-b82e-cb6daac8693b', -- Harm Reduction ← movement / practices / tips
  '0cf5c164-92b1-4a3a-8884-c8021e081a1d', -- Homophobia ← homophobic-slur
  '4f148d4b-2727-4cd8-bee6-fe4ebc8800fe','512c9b07-95b5-4b51-bd8d-15c000e9e5bc', -- Safer Injecting ← Slam / Slamming (chemsex slang for the practice)
  '18288027-2b25-4b5c-b1a1-1f63d3f33bca','20484f4d-a281-472b-ae70-aa40702f62a3', -- Safer Sniffing ← Bumping / Snorting
  '8d2dd457-dfba-4c2c-a3d8-73f58f7f0fdc', -- Trip Sitter ← Tripsitting (the practice)
  'aa33b6ef-b784-4f9f-9a2d-a436151f6d9c', -- Neurodivergent ← Neurodiversity (the broader concept, topically routed)
  '233388db-8aa1-4d1e-842e-abe98cc1728c'  -- Outing ← Zwangsouting (forced outing, a sub-case, not a translation)
);

-- 5) RETYPE → plural / spelling_variant / abbreviation / historical
update public.tag_aliases set alias_type = 'plural' where id in (
  'cd65079e-5e16-4219-8659-f00e8880331a','185fed1c-2820-4a4b-9823-ef979751740d', -- Beer-Gardens, Gastropubs
  '97e9081f-43fe-48c3-984f-7336be5aecdd','d8a30a65-0bd5-4560-82e5-b193bd2e972d', -- Theaters, Lounges
  '80d62a14-30c2-452e-8228-1d4d4f9a87af','bbd9faf2-a040-48d9-b51d-ad6e60c6dee3', -- Cocktail, Night-Clubs
  'fedd2272-df68-4f4d-bdf6-c8e4b5873e60','1a8c80d9-6d08-4899-bf11-6a27dde268d9', -- Gender-Neutral Bathrooms, Safe spaces
  'ea26bca5-6271-4d86-af7e-71a6fa85ce76','cc1876ef-4c21-463d-8aff-f73b9ac53ce8', -- Nitazene, MAOI (number variants)
  '4c40cc2c-6a15-4547-8ec1-4deec807c722','3be3855d-f248-4e59-b641-4f4becf5ae28'  -- SSRI, Fentanyl test strip
);

update public.tag_aliases set alias_type = 'spelling_variant' where id in (
  '43bd9611-4733-40f0-b366-ece9c795ef19','1341c5f7-3825-4703-99dc-761e67d839d2', -- BDSM Orientated, bear bar
  'db3602b1-d340-4d2a-a9ea-a0c4e6d51acd','8339a7bf-475f-4552-9d9b-1615d3620863', -- Edgeplay, Electrical Play
  '54f3aa9c-1f2e-46fd-9772-4cfa32659144','c09412c5-4259-4acd-b295-dc9f4398a595', -- Gender nonconforming, Health & Wellbeing
  'e6bca114-d1f3-4365-9907-5c23cd3051a8','b0c674cb-b2d6-459f-aa8f-d4aa55084a84', -- dominance & submission, Master/Slave
  '68dd9764-a5e4-480a-a30b-3aee4ae988dd','dc981f6d-ed7d-40b7-b94a-b53fc5b83fb2', -- Queer Platonic Partner, Role Play
  '71506aae-3486-462d-8b12-1f84232916d7','3da61c5c-748b-469d-a8da-a7ec6b55aed3', -- consensual non-consent, PRICK spelled out
  '5cf4b285-c674-4b45-bfab-cb03a38ad0ba','4cdb8b0b-f91e-45ec-a16d-a1f1c37b13e9', -- SSC spelled out, TPE spelled out
  '6fdd64ce-b2e2-49fe-b87f-5b5d1439fb45','b10611e7-9d05-4a1b-8f6b-7c7aabb61321', -- LGBTQ+ friendly, LGBTQ+
  'fcbfbec6-5104-4226-b1e0-163999ef2bb9','794d3852-140a-4436-8619-280430ae857d', -- Dexamfetamine, Help seeking behaviour
  'e189a2ad-7b65-46c0-8402-f76218f38a69','6af51daf-db52-47f6-aff7-46eb1b95454f', -- Fentanyl strips, Mycoplasma Genitalium Infection
  '08ca2c5a-df77-440f-85ac-7d4717a38edc'  -- DoxyPEP
);

update public.tag_aliases set alias_type = 'abbreviation' where id in (
  'd663946c-0328-4f86-9ba7-32ecba1f639d', -- PTSD
  'a68b4a1e-ed18-4c76-8743-e86cdd1d5a79', -- AAS
  '84d9b601-2d11-4e63-b2ea-0cb7cc3487b2', -- DPH
  '7c7f53aa-862e-4a22-aa1a-43e605f93ac7', -- DXM
  'ade49d30-2683-42c4-b503-8cf5a5225a1a'  -- NPS
);

update public.tag_aliases set alias_type = 'historical'
where id = '857df0b1-d5c8-41db-afae-ae1d47e65075'; -- Mpox ← Monkeypox (retired by WHO)

-- 6) APPROVE the auto rows that cannot mistag unrelated content:
--    mechanical variants of the tag's own name + unambiguous
--    clinical/chemical/brand strings. Ordinary-word street names stay auto.
update public.tag_aliases set review_status = 'approved' where review_status = 'auto' and id in (
  '1341c5f7-3825-4703-99dc-761e67d839d2','db3602b1-d340-4d2a-a9ea-a0c4e6d51acd', -- bear bar, Edgeplay
  '8339a7bf-475f-4552-9d9b-1615d3620863','54f3aa9c-1f2e-46fd-9772-4cfa32659144', -- Electrical Play, Gender nonconforming
  'c09412c5-4259-4acd-b295-dc9f4398a595','e6bca114-d1f3-4365-9907-5c23cd3051a8', -- Health & Wellbeing, dominance & submission
  'b0c674cb-b2d6-459f-aa8f-d4aa55084a84','68dd9764-a5e4-480a-a30b-3aee4ae988dd', -- Master/Slave, Queer Platonic Partner
  '71506aae-3486-462d-8b12-1f84232916d7','3da61c5c-748b-469d-a8da-a7ec6b55aed3', -- consensual non-consent, PRICK spelled out
  '5cf4b285-c674-4b45-bfab-cb03a38ad0ba','4cdb8b0b-f91e-45ec-a16d-a1f1c37b13e9', -- SSC spelled out, TPE spelled out
  '6fdd64ce-b2e2-49fe-b87f-5b5d1439fb45','1a8c80d9-6d08-4899-bf11-6a27dde268d9', -- LGBTQ+ friendly, Safe spaces
  '43bd9611-4733-40f0-b366-ece9c795ef19','d59d3702-1ead-4b69-af98-cf009ff885c0', -- BDSM Orientated, Petplay
  '4375ee8b-4054-4ee3-b687-755f89d028df','f683ba2d-dff1-4f73-8302-e911beb9e45d', -- ABDL, E-Stim
  'a49aa5ce-467a-43fc-ae99-6d4d8309a672','3d178b7b-2a89-4983-b979-c5c70cf6788c', -- LGV, PID
  '9556a86e-e8d8-4d3b-81b5-465e8d21b442','389a2827-f6e1-431b-95aa-9f7290ff96ec', -- Anogenital Herpes Simplex, Condylomata Acuminata
  '65900b80-2ded-44c3-be6c-4ba600af2ff3','6af51daf-db52-47f6-aff7-46eb1b95454f', -- Donovanosis, Mycoplasma Genitalium Infection
  '2d2f4803-9c3b-4f58-b3e5-e06a30f03c4b','f260be35-2ae3-4d42-8cc5-1b9ac7bc1d98', -- Depot medroxyprogesterone acetate, Metaphedrone
  'cff943dd-24ce-4ebe-baaf-d924d8f4c50f','6cce635e-f586-4b8d-ac64-4655be5f07f8', -- Bromazanil, Lexotanil
  '34915aea-5522-4848-8338-a3ea91e79efe','2ecaa567-ca56-47b3-8d6e-d95b539ddc03', -- Makatussin, Shabu
  '6116bba7-461b-492e-80fa-0ae8feea5614','08bef984-3737-49af-a244-48b3ea7c1350', -- Yaba, Ganja
  'cc22fa2d-4c65-4376-9078-d8dd43ef35ba','85bc3453-236b-4ac0-9835-52d86b7af782'  -- Kinbaku, Salvinorin A
);

-- 7) PURGE multilingual aliases minted from a Wikidata id the wrong-entity
--    repair CLEARED — they are the wrong entity's sitelinks. Review-class
--    rows are untouched.
with contaminated as (
  select a.id
  from public.tag_aliases a
  join public.tag_wikidata_repair_audit r
    on r.tag_id = a.canonical_tag_id and r.disposition = 'cleared'
  where a.alias_type = 'multilingual'
    and a.review_status = 'auto'
)
delete from public.search_synonyms s
using contaminated c
where s.tag_alias_id = c.id and s.status <> 'active';

do $purge$
declare v int;
begin
  delete from public.tag_aliases a
  using public.tag_wikidata_repair_audit r
  where r.tag_id = a.canonical_tag_id
    and r.disposition = 'cleared'
    and a.alias_type = 'multilingual'
    and a.review_status = 'auto';
  get diagnostics v = row_count;
  raise notice 'purged % multilingual aliases minted from cleared wikidata ids', v;
end $purge$;
