-- Venues filed under the wrong country (2026-10-11).
--
-- geo_containment_findings (nightly, Natural Earth polygons) held 649 live
-- venues whose own coordinates fall in a different country than country_id.
-- In 647 of them city_id agrees with the WRONG country: the venue was linked
-- to a same-name city abroad ("Valencia" ES for Valencia VE, "Santa Cruz" BO
-- for Santa Cruz PT, "Lincoln" US for Lincoln UK, "Kingston" JM for Kingston
-- ON), and country_id followed the city. The coordinates are the reliable
-- half -- user pins (gays-cruising) and street-address geocodes (gayout,
-- agendaq):
--   * 0 of the 649 name or address the STORED country; 30 name the
--     coordinate country ("... Lincoln LN1 3BJ, UK", "Nelson 7010, New
--     Zealand", "AD700 Escaldes-Engordany, Andorra").
--   * a hand-read sample of ~150 across every country pair agreed: names
--     and addresses are in the coordinate country's language and geography.
--
-- Scope (627 rows, frozen below):
--   * 592 rows whose point is >= 25 km outside the stored country's polygon.
--     Far past border/coastline generalisation (the validator already excuses
--     <= 2 km; the city-polygon repair 50000501100000 used 50 km).
--   * 35 of the 40 rows within 25 km, read one by one: Mercedes/Salto (UY),
--     Santo Tomé (AR), Zwijndrecht (BE), San Marino, Andorra, Kosovo,
--     Schweich/Perl (DE), Friday Harbor (US), Aalst/Weert (NL).
-- Deliberately NOT changed:
--   * 5 border-ambiguous rows: Schärding A3 parking (AT/DE), Baarle-Hertog
--     (BE/NL enclaves), Parkplatz St. Chrischona (Bettingen CH), Praia do
--     Puntal (A Guarda ES), Forêt de Bailleul (FR/BE).
--   * 5 rows whose stored country has no polygon (dependent territories,
--     e.g. French Guiana river towns), plus every 'offshore' / 'undecidable'
--     finding.
--
-- Fix per row: country_id := the coordinate country; city_id := a live
-- city in that country with the same name within 60 km, else the nearest
-- within 15 km, else NULL (an honest gap beats a wrong city); state := NULL
-- so trg_venues_geo_derive re-derives it from the new city instead of
-- keeping the foreign region. The same trigger rewrites city/country text
-- and safety_gated; trg_venues_safety_gated (OR category='cruising') fires
-- because both FK columns are in the statement, so every cruising venue
-- stays gated -- asserted in P3. The previous values are stamped on the row
-- under enrichment_status.country_repair, so the change is reversible from
-- the row itself.
--
-- Soft on preconditions: a row already in its target country is skipped.
-- Hard on postconditions: end state only.

set local statement_timeout = '300s';

create temp table _vc (venue_id uuid primary key, iso text not null) on commit drop;
insert into _vc
select split_part(x, '|', 1)::uuid, split_part(x, '|', 2)
  from unnest(string_to_array(
  '00a7af9e-bff0-4a5b-be01-89429619c0dd|CA,010c882c-1390-4283-be9b-e486c61f07e9|ES,0222396b-a304-4444-a32a-c74d03e8b78c|ES,0226152b-c75a-4df7-9f5d-14dfe461e198|ES,'
  '023e6c45-d4fb-469b-98bd-45eb1d10dd24|US,02e42758-b9af-447c-b271-81d941d30e51|PT,033b46b1-6a3b-4245-b022-f7caa0518094|IT,03601821-e70e-4b23-b3f9-64055c92e7fb|PT,'
  '036cc2fd-bffb-43b9-a02a-8e16b2da7130|VE,03a1ecc0-6537-4e46-8ce1-719ef7e9055f|ES,040561c6-45d4-4ff5-a702-cf3a118b3695|FR,04660a92-4d04-4354-a596-6a3855aad01b|PT,'
  '04c2a0a8-d03c-46dd-8b1f-445524d448f1|MX,04c7ec0c-85c9-46f3-91a3-f72c542d5c12|VE,04f65fed-548a-4484-a0fb-bb8e7518c366|VE,05eae96b-3cb1-49a1-82d9-e62cba8b9843|MX,'
  '06595e57-001c-4699-9bd3-cc3a83f97f1e|AU,0682ed08-80ef-4c8c-b05b-f03491273d75|ES,06fa942b-9207-468b-80d0-d862aa4d98ec|ES,07926723-634c-48a9-9800-01ca4728bd38|PT,'
  '08212f79-f32e-4ea2-a14c-c9f4b808207a|VE,089a2e5e-0c50-48bc-8483-9487d60ab768|US,08de4751-9f55-4dcc-ac69-90fb10807aac|ES,090acf2d-f60a-400e-8e25-0204bdd32250|CR,'
  '09387a8d-2e5e-4215-87f0-82b0f1885afa|VE,0952344d-2ea2-4175-bd62-8fa8e7b34704|BR,09f1bed9-8d94-4201-a468-bd1a1f40dfc9|PT,0a13f02e-54ab-4490-b9c5-cabba4fe58aa|CA,'
  '0aee7949-0554-4823-90a0-f4ab9ffbec76|ES,0c35745a-9d5b-42d9-906d-9653df12d356|ES,0c429aae-4447-49f3-92e5-a943d4e2eec8|SM,0cc2a3dd-bb89-4066-ae2f-46e82e1eb156|ES,'
  '0e07e41d-5963-4cb9-915c-69794f5053a0|AR,0f19d8ad-7964-4754-b646-e0d6b6c8702c|PT,0fb3e947-544e-49ad-aeea-8f98a024a9d0|MX,0fd9b7e9-aacc-451e-9cce-6237328b493e|ES,'
  '0fe5e54d-4326-45b6-89a2-23484fcf2066|ES,103e4f87-d1b8-49f3-9d7b-fad502e1977a|ES,1041548c-5134-4ba5-b418-0f174fd72b4c|VE,10ec7931-5869-484a-90d1-fa73c7eed133|CL,'
  '110da480-e518-4ee7-9883-ff087495b4f3|DE,111cdbef-7d32-487d-85da-fb79dae1b41a|PT,113d882b-0ac6-4ebe-bb7d-8c221c77c384|US,1157ffd8-d0a2-436a-ac19-d4ef13cb0854|PT,'
  '11e0b9f1-02d1-4f9f-9bbe-ed790b7914c8|MX,133c70d6-ba5e-4661-ac7d-8c3130a32b9c|CL,13afbd51-8ab0-491f-8ed5-0687a40e8826|ES,140bd777-c938-404d-a7d7-edb7879c21c0|MX,'
  '14760ed0-a859-4b7a-8c79-58bddcd1d73f|AR,15301dde-e66a-458d-bb1c-aecfff8febaa|ES,15481cf7-03c2-4203-8387-50bd29342abe|AU,15cfe90c-a3b2-4315-bb1a-3933ead0c5ac|AU,'
  '16717c63-45d2-44e4-84ed-5a9ec280ab0e|ES,1889254d-9bcc-417c-be91-35e4f40dfd21|CU,18958477-ed94-464d-b32d-908193e24ae9|CL,192ae4e5-2834-4b2b-b8cd-d3acec82cec7|CO,'
  '1930ed6a-598d-4c89-a56f-5bb30eda2d97|ES,19b8c3d7-8c8d-42ee-9609-12fd0084866d|MX,1a1c4b8c-4f8e-4000-905d-75aa1bcdadc2|PT,1a84a3b8-ee96-4d07-ac8f-37198b537d5c|ES,'
  '1ac8307a-c4bb-4391-9e2a-d1b2cb39d2b5|MX,1ad60ab8-f922-471b-bb72-800e5d14e223|VE,1bb8a832-81d8-42c7-a466-cd8acadf4ed2|ES,1c0356c6-e07b-4287-8a3e-f3610b62b57a|ES,'
  '1c073f40-065e-4a5a-84ca-ff450f923859|US,1ce6ab24-00fd-4859-994f-c8b795639ff0|ES,1d3a5621-392f-46ad-9154-30e68f06b8ad|DE,1d908f4e-34b5-4cb0-9ce5-ea0db7055213|ES,'
  '1da1e520-1fff-4b22-8ab4-61944432b912|NI,1dac6f26-65df-4b37-9d37-a458b0577bfb|AD,1e346707-11bb-4eaa-a984-aaf5d045b5b8|US,1e3df8a8-8929-4833-851a-8986c48fc15e|PA,'
  '1f268ada-50b8-491f-bca1-745e9068e989|CR,1f6cde55-70f3-4ca7-8712-5e3bbadbbfb7|ES,1f81b479-e7c6-42e0-9514-28e346b0e2e9|GB,20528193-d40e-43b1-bee1-4f6f8cced777|ES,'
  '20f2131a-fc84-482a-911b-07a03ee28a1f|NZ,21fc1153-ed42-4795-a069-39685cf1f12d|US,22175c98-e223-417c-bcc8-718b42ecbfa1|NZ,221e5b88-b245-434b-8489-f224e7b06ea5|UY,'
  '22ebcf51-530d-4924-ac70-7cab2e844316|CA,233ab5ba-8cc1-4c4f-9baa-d31bc96d7841|VE,239d8168-9ea9-49f2-a9f6-812d4134d536|ES,23bc9a51-3a9c-46a6-8120-967b112af758|IT,'
  '23c683a6-26df-47b4-81b4-1340d0d20c9c|GB,24013807-00d6-428e-88ce-2a818f622c22|PT,24a50794-c182-4f03-8569-7842f545339b|MX,24c5a9fd-7724-4361-8ac5-9995dabb4758|VE,'
  '25f74827-a768-482d-a47b-25e9bab2216a|ES,262e7d47-e2ab-48b2-9d83-af47199c9b64|XK,2651960d-03e0-4d5b-825a-d111574d00b0|PT,26fb1347-94bc-4b1e-87cc-016e539db32c|SV,'
  '284ad691-bf33-4a8a-a47b-44814c3d1342|IT,28e6391c-8847-41df-be84-5323ed4a1b86|ES,29062d04-9f82-472c-b2e5-1af41dd67e9b|ES,294afe18-4c1c-41d2-9286-abf11e592ce1|VE,'
  '2aa96249-06cc-43c1-bbbe-8be7fc4b8779|ES,2ab093f0-fae6-4ad3-a0a4-f45714ad00ff|CA,2ad46651-587b-4920-8f15-0cf350724968|ES,2adadff4-7329-4f59-9733-460ca3ea63fa|PT,'
  '2b024d57-e729-4fbe-98ac-73829b95f67a|PT,2b66b75d-300d-4f04-b448-75250b2631b8|EC,2c2da4f9-6ef3-4c50-8148-a7c2c33ae60a|US,2d15985d-eb63-4a07-b41f-051488be8614|ES,'
  '2d75dfbf-1fd9-4f99-961d-7d1970cf53e0|ES,2d79186d-9fbc-4cdf-88ae-b249b8592823|PT,2d8b9b79-2ce6-4586-b715-e4bf425184ac|AR,2e3659da-f30e-4125-a2ea-d1b128b0c699|CA,'
  '2ed40ccf-9bf9-4746-a7ca-660919be6675|MX,2f8440f0-b05c-46c4-a473-02823aeaf550|ES,30a3ed67-d9ae-4431-8389-99bcf1f18ef8|PT,30f0c929-3994-4127-82a6-f9b130e007a4|AR,'
  '3119211b-bac9-4f96-b493-d7b9f504143e|VE,3194eb3b-2631-4b42-af53-b49f4e3a1771|CA,3195093e-9fba-4b02-8787-5600daee59af|ES,31c7f4dd-4069-4387-9b98-9c126621c42e|US,'
  '31f1570e-41e2-4991-91b8-5a65fd233df4|MX,31f5497a-915b-407c-b91e-57d9e81a597c|ES,32d6a003-e899-4324-bb0b-280e6b2b76e2|AU,3338272e-82f0-44c4-8996-c1ddfb17b1a0|NZ,'
  '334b2296-e6ee-45c8-9452-328f62fe393f|PT,338cb675-c964-49cf-88eb-9c5f48d47d9b|GB,33915911-9d21-4a1f-ae58-145a7bf5796c|US,340eb234-8098-4d06-ac9f-53ea57110703|NZ,'
  '35814ed6-9db6-43b4-a19b-e45dfba4ed9a|CL,361e6058-e309-4a90-9139-1e8e63738ca8|CL,36340974-f952-4de2-9686-51696d1a0cd6|US,363fb623-26ce-4faf-98a9-9ae4c6fe24e9|BR,'
  '364fd644-9eaa-493e-8acb-45a038110305|ES,36575fd0-9da0-4398-9274-a3f2a969ce03|ES,365f19a8-4c42-446c-a9c3-b139325de800|PT,36a20693-08eb-403f-acb3-a6d30da5d97b|PT,'
  '371da8f4-17ff-4be2-99b2-1c37ad8f4fd8|CA,3749c112-9db4-4bd0-81d1-db8544a0b81f|ES,37535d14-bc33-4aab-830e-c3300c02bf0c|CO,380386cb-9578-4de4-ad53-05eb1960e407|CL,'
  '3854917c-78de-494a-9f24-198d1a297860|ES,385e46cc-c8c7-4d34-b79e-059328f64063|AU,3a4205b7-0086-46aa-b2d4-1b06f0c72b20|CL,3a6906b4-b2f0-49c0-a8ed-bf445f908f6e|CL,'
  '3a9d27a7-9b5c-43a8-96ce-5c0bc67e4196|CA,3bab2762-9827-421e-bdf9-30bf8d79f193|MX,3c58abea-a4ad-4fe5-b611-3b40950df49f|ES,3ceb7959-7c99-4d30-a832-bd7911019046|UY,'
  '3d54c0ca-b65f-459c-b5c3-5e1b6073c473|ES,3d76e6cd-cbb8-4055-8965-22c0dab17bfd|ES,3da3a3c9-3506-476a-80af-ed566b3c6968|PT,3dccc896-c0ee-4821-9065-ffa0422450e0|VE,'
  '3df4cb01-5079-401b-880b-26f33537da79|ES,3e4565c4-e5b2-4098-b5a4-fb305721dc52|VE,3f00b4fd-ae5f-44a1-9a2c-df25a7150651|MX,3fbab390-d3d7-4b3a-874f-b103ffcb4951|PT,'
  '3fe25254-3a4e-4be0-b901-5483e4694be8|AU,403cbd21-3ae8-48f3-8f9a-8712ab083f09|ES,409c96f5-6027-4ff1-8140-fa3db4f6faf4|CA,415846be-7570-4bfe-889b-86c3fc677f6d|SM,'
  '418b1af9-c4e3-44f8-846c-a885cfe280df|IE,41bed1fe-cba6-4834-bb91-46d96cfdd83b|ES,41e34c90-b67f-4a9e-86b3-844d69763ea4|ES,42130e1f-59d5-4661-ae6d-316a8e8bb5fc|ES,'
  '424213b0-51eb-4877-b9ca-d34db5bca194|VE,4267dc92-7779-4a67-b155-b16f23387ef1|ES,42d15930-dbbf-4b53-914e-4a7adda59b52|CA,43d8977b-d8d9-4d44-a69f-84be803027e0|MX,'
  '43eeb57a-d125-4ebe-8a78-cae7e791eff5|ES,43fdf512-4d80-483f-a846-25494243b42b|CU,44158501-7fbd-408a-9062-413169c2bd41|CO,447eb3a0-2ff6-4ce7-99a3-0a12d333b010|CL,'
  '44a39186-f4a7-4c42-a928-d470dba9c7e0|VE,455fa981-5d9a-44c7-ab65-1b2ac401a8bc|ES,4571f40c-c16d-4088-b357-28555cd69150|CO,45c0ee5a-bcc8-4820-a35b-e349cab9fafc|PT,'
  '45c8abf3-4b87-4405-bea5-c79740576d0a|US,4668d183-458c-4a0d-b374-3359dd015c7e|ES,46d2c4b7-6c1d-444e-ac2d-1bca214d10f7|XK,47c33acc-4659-4a6e-8c01-528660a71cd4|ES,'
  '48413af6-7282-459d-8b93-7c105bc0139e|US,48960966-ceb5-48f5-a199-7f119bcf05bc|XK,48d7383b-98b2-46d5-96f8-01581d7af9ab|NL,493366db-c562-4c26-9e9c-8f8f618b0007|VE,'
  '4b8d03a0-cad1-431e-aa7b-94a87aebad6c|GB,4b94f2fc-1586-478a-a5e6-5eb997463fde|PT,4c09a0be-c586-433e-9bb4-633734c7dd4d|UY,4c12af93-2ae9-4ec4-bdfd-41a7b44775d6|VE,'
  '4d515fad-69f6-4f36-8873-a0de987f7513|ES,4d87c606-dc8f-48e7-a545-f020674148ad|MX,4fc05959-13b6-4f3d-902d-675434e92557|ES,4fd98b41-42e3-42fe-adc0-e2146039982e|UY,'
  '500cb770-104c-490c-8ad1-e1be96e90144|GB,501c2d0c-6378-470f-8991-292cdfae9060|VE,5035158e-f7ac-4604-b9d8-85cd517d33db|PA,5060da3d-09f3-4a32-985f-a4035fb50541|US,'
  '50859dac-975e-4e0e-8792-236c69b59ab6|ES,5090bd28-db3b-4c66-848c-43edc0926709|ES,50930894-520c-4e4a-a2a0-290001c5c514|PT,51134997-afc6-42cf-ae3e-66fbcdef2d31|CA,'
  '51bb8b9f-3c32-4e12-aa94-308d9ab45dd5|SV,51e36b35-1106-4c13-8584-2de7e1e32d2f|ES,522b5ee0-0349-466e-99ec-1dd5f86e0920|CR,524bebcc-567e-482a-b50c-1f38d7dcb31b|ES,'
  '53894d3f-e8b6-43ad-abbc-5c857b663d27|VE,53af37e3-4b0d-4d9a-afad-f697887198eb|NL,53af4133-3d5f-4b9a-a955-e3aa3058ba0b|ES,53e4b3a8-fba3-42c8-91b2-8cdfe7ac176d|ES,'
  '544bde42-4726-4581-b3b3-3b23275e65b1|VE,54c95978-62ee-440c-8a52-960886f5c120|PT,5587fca5-d7f3-4e76-8781-392bc5b810fb|US,5629bc87-8b71-468a-bfcf-118aba8e9598|ES,'
  '5664104b-620f-4c37-b100-d841b376fa0a|ES,56ed274b-e1bf-4d62-a92c-bcad851b4259|ES,5733998d-bbed-474a-8a3c-397787d7275d|AD,574d8760-d2c3-44ff-aba3-4f643c1a8921|ES,'
  '57629d83-69cd-410a-906a-d852eecb1bc4|IE,5778a890-c4bd-4d8f-8b87-00b9a4ec48e5|ES,57b20ded-f56b-4799-9d89-3d2b7afd32a4|AU,57d643c1-3dc7-4860-8ca0-f004ded92ee4|VE,'
  '58024d36-37e0-4f18-8d46-8b9d80c4401c|PT,58441854-789d-443a-9a5e-241a63d0028c|PT,58554848-3d1f-4310-9fa9-ae7032239ca5|ES,58a0d3f9-44cd-4bd6-bd7e-9e6eb22911ac|CA,'
  '5906e6ba-c1d2-4be3-8bfa-43f7906379d5|US,59b8e405-4039-4a53-b75f-87c699265b32|NL,5a3fc7ba-0bf6-4b92-adff-df4a4dba1949|SV,5a4794d4-2f6c-4cdc-8e98-b2b7bee11399|ES,'
  '5c1caa99-18d1-4c5f-b83c-18fe590e611e|ES,5c1ef392-12a6-4ff0-a8da-48b20abc76bb|ES,5c325bd8-dbfa-4c8f-8d1c-a54f5d3e7863|PT,5c7cad14-f0b9-483b-bef9-648f5ee9aa04|ES,'
  '5ca7a98b-6a82-4708-915d-ad53567deedd|MX,5dbd0c01-bb3f-4e01-bb17-8d19e1a5c98e|PT,5e3e8d38-41e0-474e-91c6-85a4b051f7c1|MX,5ec1927e-8e46-4a80-8e3f-a6ed9ac03ec0|MX,'
  '5edd2a1b-e20d-4ba4-bcd6-448f4aef0eb3|ES,5f832f49-2693-403c-b2ed-9d3806d96da7|NZ,5f8f01f5-e28f-417e-b6cf-6b2364f042d2|PT,5fe9e75d-a625-4bbc-9034-6f012d9f3c81|CA,'
  '606b7a7b-d2a5-4823-adb5-917ddecdd594|ES,6072316d-2aaa-47df-bd58-53fadd4063e5|GB,60bb81f3-5ed5-44cf-b2a0-b99934125ee0|UY,60bc6898-a518-43cd-9cb2-7ea895df7603|GB,'
  '615ca464-9ea2-41e7-bac9-88217468c83e|ES,61e64663-5c6e-434a-b9ad-41730ee7ef0d|VE,62e9e714-d339-4096-996d-e366c4a3b553|PA,62ee7e6f-e68f-40e2-9a24-e9f4a10c1e68|PT,'
  '633a52bf-81da-4b3f-96aa-896f05687f1b|ES,63da8d25-1229-465f-b6ef-fe835cffd2e2|PT,6413270d-6989-47bc-b4aa-58b3ab6a814a|ES,643c79fb-9b41-4ef1-a17a-b3e51c4e407f|PT,'
  '644f3db3-bb79-435f-b43f-72f87c166432|VE,65d56b2f-53e2-47da-8826-26b4d8432c87|MX,665a9f5b-292b-427f-ae22-6721bb389b67|SV,66ef0347-66f9-4e33-981a-cdc4d4c16727|MX,'
  '66f8965d-d3f8-49e5-b13f-2b5fc9b532fe|PT,672e7117-3d65-4be4-b6d0-1ad60acd27df|ES,674838da-cf23-4317-8e1f-b1ce83daa9d5|MX,68461405-49cf-4724-ba03-39347a0b6463|MX,'
  '6847f8dd-b020-4f31-8553-cc617e985eae|PT,686289e5-1038-408a-83d7-4c7829f57b58|CL,68a6a307-e3d7-4a57-afc5-ed731616401d|BR,68cdddb0-7c8e-4d42-b3d8-520232c3121c|IT,'
  '68d0718a-674a-4143-a4b4-63037749dc00|PT,6922881a-2f9d-4f40-bb36-04c03adb8aec|PT,6a0e617a-1ccd-4a48-9d65-194ce74fdf99|CL,6b67a00a-7377-49af-8d88-8ebb48c8140a|PT,'
  '6c201e08-c3f2-44b4-9cd2-08bcfb33578c|VE,6cfda6e4-6d5d-4c4a-9c66-8fb912bd6bd9|PT,6d57123c-1a2f-4b9e-a08c-95969249fb47|SV,6d62935b-ebc4-47cc-844f-11fa01eade04|US,'
  '6d6445e9-0e25-4533-a718-50f4c2e7cdba|PT,6e201ea3-cc7d-4a72-89b3-909ce99720a4|PT,6f2a467e-f161-495a-adb9-3e9bf6d4786b|MX,6f52be0c-3f57-4bcb-8730-e3308e86b7ec|PT,'
  '6faea476-4465-4bcb-8e2e-98c72419aefa|MX,701588a2-83b9-4c18-900a-80d088d16cac|MX,7101f06a-8716-480f-ad04-9a7ba484783d|ES,710e89bc-6a43-4087-a15f-1d60fe90bb2e|VE,'
  '711db41a-6a78-4019-8010-9472e6108e9f|ES,716238f6-754b-431e-b52d-c059e0481097|PT,71d37a4c-419d-4135-bd2c-60a0bfb1510b|XK,72cd5ebf-c860-4bc1-87ea-a620a50af96f|MX,'
  '73bff2cf-cdfd-4842-ab48-9ad4d928ba32|BO,73ea5a9c-21a0-4611-a3be-b977ac69f8e5|BR,7434ef5f-7606-43b8-b43e-14eac3e9d868|ES,74356b61-0939-49f8-a54a-67c0341a7483|FR,'
  '74938212-7393-4914-8e46-0d54b51c5ae9|CA,74f21c80-a38b-43de-b271-d4559b01fc54|BR,7529a7df-0460-4ac9-8d7c-c8b5fac58ce2|CA,755602b1-2a69-4b6b-87e5-70c3540d4da8|BE,'
  '757d06b1-95c4-4928-a132-5393a12b3536|ES,767a7078-ccc5-4c22-b8bd-067a13916cbc|ES,769a7c1d-f9c6-42b6-8929-ecf9b20273f5|CA,76b15070-6198-4542-bfb5-ff08f676e2ed|PT,'
  '76cb9996-7af3-43ad-b04c-eedcafb79b60|AU,76e9ce24-170e-492f-8498-6c3f122dbb3b|CA,775b8482-3680-49f7-814e-7ed671911ac5|ES,77946aa8-43ba-4f55-be4a-40f3309e6f4c|PT,'
  '77c46888-3d58-4cae-b0ad-1a522c96a395|PT,788c26af-fb2f-4210-a577-e4c809cf3a3b|US,7913a58f-4a2e-45f8-9b52-a6a27b475c47|ES,7998b8cc-adbe-4f98-a79c-57bda07fedbf|ES,'
  '79b32ba2-a5ec-4614-b5b5-ce06b30271d0|PT,7a0858f2-d150-4ca7-9243-6ebac945fea5|ES,7a0948c6-cd1c-4cd3-9170-f20c07821303|ES,7a23ef08-49c5-4b1a-a67a-5320a7d531bc|AU,'
  '7aa45fd4-1587-4d55-a4e7-7d42a81e54c6|SV,7aa4f8b9-8661-4eef-94ed-66f8310b13c9|ES,7ab28dee-3ac5-4810-861e-cd6e74a59f94|US,7b4757a2-e4b3-44f8-a4ce-52f4bed9b8b1|SV,'
  '7b969c8e-1610-4016-afd7-462efe510793|ES,7c08d4d2-3551-4179-b149-121c77b009b9|VE,7c44466a-1e15-4b14-8f4c-7e2b1b517b82|PT,7c4fa787-d4c9-473a-ac05-936b48400935|VE,'
  '7c91140c-78d4-4a76-98cb-8c09a5de4e6e|MX,7d7269a4-022f-4dc6-ba9d-9d76cb428b07|ES,7e3c905b-5c6d-416c-ae0a-7168c7ccb518|FR,7ea58bab-b744-4f84-97c5-54664e8662d9|US,'
  '7f1cd0cd-5549-47b3-8f52-78f75d33822b|ES,7fb4ba4e-1309-477c-9e3f-478416a0703e|BE,7fe556c8-4364-4073-adb1-68071e1eec71|PT,8057b3b8-cc0e-4dc1-bc7d-f7f266964d3d|CL,'
  '816bba77-16ef-4fd6-8abc-9f45975f7631|ES,8295b634-dbfa-41b1-8408-070b06314278|NL,82e5ab82-756d-4e57-b435-49fbc316f519|MX,83aa6b2c-f792-4333-a8da-c3677a49cd31|US,'
  '83e80702-b962-46e0-be3c-cf47b9bb237c|ES,83fa9e8c-d284-4ab2-af73-5aed1a6fa3e1|ES,86b07fbf-d296-4f47-a6d1-a88f23ae3735|US,86ca5d87-7e81-4a8a-9282-11813e5a8a41|PT,'
  '86e1cb62-4b0c-46c6-b520-d3ecdb6e16ba|ES,88099e40-39ac-4728-a0a4-7804dcc78470|BE,88564427-6a08-4e33-b35c-4c565c478583|VE,887149f8-7a18-4815-875f-38fe143cd096|VE,'
  '89946395-aee9-4e84-96b8-eb823a21c8f8|UY,899cffd6-f045-4470-a953-214959be0816|VE,89a9d67d-4f66-4219-93ce-c255400319a0|UY,8a51dedf-bd4a-4534-9747-bbc605732ef3|AD,'
  '8a641334-a8cf-4250-b04d-332f64ba0e93|SM,8a79aa65-ec1a-41c3-affb-215244b15169|PT,8ad62f83-f2e4-4bdd-ad49-9989f9b1ad14|ES,8b478be0-d2e1-4f26-8740-26137a0e3cec|ES,'
  '8b4b7327-304f-4163-a886-1eb3762d1dd6|MX,8b5e744b-267e-46c6-925f-5a42439812e6|VE,8b6eeaa8-6056-4518-b29f-ad19ebcf79d3|ES,8b8252b4-36d5-4765-852c-a096a0a006f5|VE,'
  '8b9a357c-e190-4b7e-a4a7-0db5166482f8|ES,8c048fa3-0e7a-4cba-a5c8-83b99b9fd7af|US,8c9869e6-3f31-4a89-9a91-4d308a1bb83d|VE,8cf0eedb-766d-4891-bc39-fb3c13398299|ES,'
  '8d0d6b65-ed48-40e2-ba40-25ea4dbd2a50|CW,8d6340eb-23a5-4d47-bdf0-f6fa7981fcc3|VE,8d8904fa-7cf2-4548-b13c-0987bb8699e1|UY,8d930929-68e7-4829-b9b5-fee8b9cf183f|GB,'
  '8dc0f44b-f8c5-4036-a0dd-ada94386cbbf|NZ,8e46fbf7-2bda-4d91-b77f-225bc471ba90|AR,8f2b82df-9c53-43f1-9849-9615239ff81a|CO,8fa6f55f-381b-4d9c-afe3-987f7af15798|ES,'
  '8fbe155d-2018-411b-9cdd-5be20bd1f421|ES,909084a0-a6e9-41d3-a64c-36bbffe69d9c|ES,90d43e9b-e4e9-46d3-8cf2-0dbb0f846046|US,913128dc-c01d-4563-891f-f0a5565c10cd|PT,'
  '913f2db4-9349-493d-99a1-1ecb2e54ca9c|CA,917862b5-5e90-40cc-a5d0-3b5e982ad86e|DE,91d27fcf-a648-4767-a0ac-725366ee5d54|MX,930f506c-2d83-463a-be6d-154cf193eb38|DE,'
  '93a7aea2-c2d8-4ebe-941d-9281d1c2714c|ES,93bddff6-fa87-4953-bfeb-dc4ec1b3c454|DE,94aecea2-2308-4640-ad5a-51bf1c15ca82|ES,9507b99b-1cdf-4357-8160-b025db3f89a9|US,'
  '96212629-dab4-4596-b57a-ce57ea5b9ad0|ES,966f0d0b-1d21-4cea-82e3-fefe1e1f65d0|IT,97282ac9-1f21-4e56-b3f3-779bf097d7cd|MX,9729ebfb-6d5a-4552-a84e-76ca5684f48e|ES,'
  '972c2646-4d3f-4d82-9fc1-2da7c277365c|CO,972d7135-93c2-4010-b289-cb088a5c880e|MX,975a0c2c-ff62-4e65-a606-021f2d441a67|ES,976f49ed-b50f-40f3-a2fa-947e7d3ca12b|NL,'
  '977b88bc-8161-42a9-9711-6092c99b1bf4|ES,978879bc-5226-4c50-af0a-427f7d7424ea|ES,978b3539-2a82-4e95-879d-784ed9306f8a|ES,982d4f9e-7911-4e93-86fa-2f5444bf369d|VE,'
  '98662782-a0f8-4316-9fff-2dafffe964d8|CA,9c456699-1ce6-46b6-a4dc-3d2fac71372f|IT,9cb74050-b557-46fa-b05c-adad59848ce4|NL,9cc789d0-019d-4479-876c-3ed18693d276|CL,'
  '9cfb6afa-ab39-4f16-a41e-7b14e59f0da8|AR,9d2e1a2a-b700-4e45-82b8-b2438c4f367c|PT,9d403b29-6988-4651-b910-2faec5d77ffc|US,9d8fee7e-dd08-4f5e-8a0c-f8ba04d43b30|ES,'
  '9db72490-c91b-4246-ad9f-0a958caf3fee|VE,9dc62e22-df8f-4980-9edc-b080d1da7c5b|CL,9df040bc-a595-4782-b4ea-c9d4958af37c|NZ,9df8b2be-7eed-4b5a-ba34-c8cd9e52b3e1|AU,'
  '9e2129e0-423a-4aa9-bc71-53db451d8ddb|US,9e4e54f1-bd8f-4273-987f-bd8aab1e88ff|AU,9e8ded7d-1562-4348-9c4b-9ab3c3ab5725|MX,9eba2c97-47b4-4965-9fcd-c82efb22638f|PT,'
  '9ef378b0-29cb-4722-a482-43c47095e541|US,9ffd9ea3-e92b-47d5-b726-bf61f94a2d54|ES,a014db45-5d5e-48c3-b75a-477bb000a58e|MX,a01fe92e-67a0-4d0f-8633-cba5ff49488e|CL,'
  'a0a6bc2c-56d0-46d3-b3af-d79339d333a3|ES,a0e141ac-123d-4264-a96d-db2c14022fca|VE,a13799cd-3c4f-4f5d-b888-da77c362c31e|PE,a16edf57-00a0-4a02-9ccc-70bce8a940cc|ES,'
  'a1714069-bacd-4781-892a-c4fbbbb53d3f|ES,a2c50245-3389-4950-86b6-26b9d26ea62c|MX,a4140318-3ddb-4b37-8eb6-3d3f36f0c2fd|VE,a416af22-18fb-4f04-b877-b8f3011d3f62|NZ,'
  'a49ef6e4-b607-4ab1-a1e4-5c09bbb6cf91|ES,a5259b55-c5f8-4877-ab08-6b25de6cc44e|PT,a58c5e7f-6c55-43a4-a72d-ba0094144419|CA,a5bcddba-427c-4bbd-aa92-45f23d262923|ES,'
  'a5bff913-9ef0-416c-8d45-6cac61d44792|PT,a6232987-0a26-4a38-99b1-ec241b960858|CL,a669d702-1f84-47b1-99cb-b9103265749f|MX,a67561f1-db6c-4bd6-a55f-6029919ace8a|VE,'
  'a68c6c4d-8e53-4ccf-89c2-3ef4f48bc1ae|MX,a7854b3c-3cf6-4807-adae-2dec2f36a5b6|ES,a8848738-ba10-4eec-9039-fd9c918d02e3|IT,a8ad6f76-311f-4783-928d-e3ca144f97fc|VE,'
  'a99cfbbe-83e1-461f-afef-ba311714b880|VE,a9b8af8c-0261-4e0a-81aa-52f85f7f3a59|MX,aa109cf3-3050-417f-a437-3a46cab3f572|CO,aa73fa6e-dc0d-45d3-b008-74a7e2b7e2cc|ES,'
  'aae3aca3-5040-4254-9470-6dae4976f29f|NZ,ab2c15e9-5486-4003-84b8-f3a85cb6e839|US,ab6f1fb3-4f78-4b39-95ac-f17dd138a768|AU,aba754e2-cc2d-4618-a486-af445c4144b9|VE,'
  'abf99141-8c82-448d-88b9-e35b0e7cf344|PT,ac3dd1c9-8098-4a24-9cdb-fe6b75c95401|MX,ac546dda-b185-48c5-8daf-8698cd800d3d|ES,ad305225-7f94-4bdb-89d0-cea066c8b9b4|MX,'
  'ad76fbf6-3212-4d49-8434-d310583815c7|CL,adbe96bd-957f-457d-8772-e0c68e37ea83|ES,ae6d28e3-10f3-4cb9-93f2-680069702d20|ES,ae796386-5ab0-4ab5-9469-cba9fff7c3ce|AU,'
  'ae870b27-eedf-4c24-817e-cf20ac636fcf|NZ,aea1e0a6-85d8-4107-a344-9c686467ef78|MX,aeef7976-d5b2-449d-b60a-fda8723b6e35|ES,af996bc9-f138-4f91-a2fb-5b0be17897f8|SV,'
  'afc5046c-12b2-49e5-b628-0fdb7908f930|ES,afdb6eb3-6f4f-475c-9903-fdef725f93d3|ES,aff01bf2-359c-4345-ab1d-4369c106566d|CL,b00dd692-3fea-41a2-9331-334e926e4b07|LT,'
  'b0de24c2-05b9-42f4-acc9-11435b55ae2e|UY,b0f017a0-32fb-4b50-b353-372c7c313056|ES,b117ffc3-aae5-4f73-b691-24bed62c2abd|PT,b257d93e-cb85-45ea-a388-2d06bf0e6057|ES,'
  'b3571b3a-406b-4d50-9f58-8709c5f655be|CO,b35c99d4-f853-440b-8d2b-a03dc5002e3e|CA,b464afa6-67df-4d87-8478-1787b3b5cdbc|VE,b4c514e8-7e37-4729-9ce7-445e58a91ff4|SV,'
  'b4c67747-20af-48b4-8e83-cedf3d380330|ES,b5189782-2a83-4645-adc0-688f7ef2698a|US,b55795d1-c1eb-4e56-92e7-37e6cfac0db8|ES,b668e543-90ad-489b-b9fc-60a4693702e2|ES,'
  'b864a92d-2ce4-4a7d-85cd-e1a447305826|PT,b88ca74d-2a80-4d0e-a00a-306e5b459197|GB,b9302504-bc25-47b0-8569-b18eeff3b1ca|BE,b94a7b2e-4c25-4cdc-8f19-564d4ae5a82b|GB,'
  'bb8afd2e-ff4f-4858-8429-f1a15b166324|ES,bbd4c38e-b0f5-478e-be91-14712adefba6|NL,bc08888c-3ad1-4eab-9e1b-fcb3fd70ec88|MX,bccab608-8d61-40c2-a126-de4b8efe2fb6|ES,'
  'bdb6381b-9fca-41df-9411-bacb97f9df1a|VE,bdefec90-a95f-466f-b1ed-17d7eb0ac2aa|MX,be173637-ddb6-4d92-a4cc-58f2b18a7297|GB,be17553a-c126-4267-8bf4-0e85c40eb079|US,'
  'be4840b6-959d-446e-8488-bf2586bd4ac0|VE,bed0a414-38a9-438c-aff5-f30049f4bc38|CA,bf2abbfb-a2ac-4b74-9389-d799c6e8dbb6|PT,bf5ae584-7b1b-407e-9cf4-b467c7b9e4df|XK,'
  'bf9a7170-1166-46eb-88fa-00b0d28176dd|CA,bfbddddf-6768-41ba-bb05-460a0d4b58a8|CO,c0120bb7-72af-4d32-bcae-4f1468f406b9|MX,c02aa3ed-9d83-44db-ab26-d9301ba04bea|PT,'
  'c0a39f39-9cab-4162-8702-378658800d5c|VE,c0b431aa-dd69-4331-abe6-37f7aeea6748|ES,c16407d5-53ac-408e-bddd-6817868e6fcc|ES,c1a72d29-d713-4d5e-a2dc-b7ca7a19be21|ES,'
  'c275aab3-33eb-489f-98bc-7863bc21cf12|MX,c3203c8f-8d66-4c6e-b427-e3210caaa637|PT,c3dade62-a25b-45f1-872f-14e4bd3a9648|PT,c421e828-2722-4216-986f-61815d8f5191|MX,'
  'c44db8b2-e1b1-4709-bd08-2f23abdc0d08|ES,c4683183-80a7-4da0-9b7b-b2a7e8089f0f|PA,c4b8aaa9-c37c-459a-b4bf-1af5b486c8c3|NI,c4be48b0-d983-41ad-8e89-5d85046de9d5|CL,'
  'c4d35602-5fb0-428a-a952-befc57c25951|AR,c698a1cb-bae3-4bf7-8880-fcdc5389434b|CO,c7523cd4-9f18-48bf-bfb3-62809c5d23f2|MX,c758122b-986b-471b-8769-4e5d5e8f8724|VE,'
  'c779be8e-94f9-42b8-ba1a-168010420e1a|US,c8917ddb-35d2-4e06-8264-c17a396556ce|ES,c8a533a8-e584-421c-ab3c-dddf06bcd6e3|ES,c8cdca76-9b13-421e-aa2d-6c62572f205e|ES,'
  'c9800025-4fe2-4d49-a9bb-b8e8e2010709|CO,c9eb9569-30f4-4e20-937f-6411dd257ceb|VE,cae983f9-b4f1-4d80-9fa9-7e1612af49e3|ES,cb1befed-df29-4fd3-ae47-1e61f83dba88|NZ,'
  'cb406ba9-9c57-4813-af7b-36cbe2e6684c|PT,cc260d9d-f181-4f3d-85e4-5498ff28f6da|ES,cc9c4451-ddb5-4afc-b2a3-fef8d636fbdb|GB,ccffb79d-6e46-49da-8f55-c4428af99c2e|AR,'
  'cddc2840-6942-438a-861e-2d23ad3ce7e7|MX,cdf8aae5-df15-444c-801d-85d09e1a2d7d|US,ce4c1af6-c3e9-4eb0-b219-81eb3f178d5c|CA,cead0df7-4028-4e19-91b4-c6862ac570b3|MX,'
  'cebb69d0-7ebd-4809-8d68-073b23822aa4|ES,cf0a2ce4-5cfd-4dd0-aedb-388ca7d6747b|GB,d03a2adf-239a-4a97-b2d7-5a06669e6a34|ES,d18ba6cd-3230-4a95-8cbc-e47409b8f87b|PT,'
  'd2156001-5056-40d8-912f-165034fddd54|ES,d2de33d1-cf02-4652-b76f-89fe226d3ca0|PT,d33ce466-ee0b-4f77-9c54-aae228d443e4|US,d36e69d3-4bfe-44ff-9139-c1a8c620e401|ES,'
  'd381429b-f37b-44a5-ad17-4f18ddde917a|BR,d3bb9f80-f4f0-4f9f-ad1e-f2e8b46d83be|PA,d45b377e-0537-408f-bc2c-fe81b24b8774|PT,d4da5238-e6d0-40a2-ba73-d3ec21ff606c|VE,'
  'd518e95b-cb6f-4d76-ae66-2a3abc28d645|ES,d56b2fcc-6fca-4e7e-b4d2-d3b75b265579|ES,d5a603ec-1de7-4f47-8463-1001a36e2261|ES,d5f40156-a42d-410e-8aa9-e6de49844adb|CO,'
  'd5fe4d85-4cad-4abb-9324-7312c3902755|SM,d6e8dc1b-09c1-494c-9b32-85ed4193f092|MX,d70d065d-4721-4b79-a9a6-e056e99e2513|AR,d748a065-c57d-4033-8a8d-ad4793beaf42|CA,'
  'd75ddcac-52e3-4643-9192-4692af772af7|NZ,d778922a-b8f0-4175-8384-da4da5895d31|MX,d78aa6a6-95ba-4936-83d4-e81dae9d89ca|ES,d8024326-e26c-492e-949c-6eb4ab461ed5|ES,'
  'd948a5ac-1476-4531-a070-33af535fd353|SV,d9efc269-8be4-4022-90fa-c5bab709d61c|CA,db624680-cfdb-4798-905c-f23de1f143d5|PT,dbce47d9-ea09-4c9a-86d3-b467e0df3e8a|CU,'
  'dc19b390-0be3-4fbd-b0d1-ee5de78ba9f1|ES,dc5596f9-9ac3-4607-b489-304592bddf14|ES,ddf2ace0-820d-4df8-898d-5fccc40c6cc3|ES,de5f3704-8e21-4f84-80c5-5e8f1c94bbd2|CU,'
  'de6561ac-9891-40b8-ab41-f16ef672ae4e|UY,de6b8744-3172-4297-9326-308558df53db|ES,e00d8dc8-5c7d-411c-93bf-b7b8e69d12aa|PT,e01258b9-2415-4670-b9a7-1320a225152a|ES,'
  'e050ed92-be81-4c0f-8b59-e427c46a31e8|VE,e0a31f9a-7a64-43e4-ae8f-23e46635fdb6|BE,e0bc0be0-f0f9-4a9e-a4f5-7d89de635acf|CA,e0c73d02-21cf-40a3-9512-416615a09159|SV,'
  'e1680f58-dc4a-4056-b28f-9951af9ee83c|PT,e17ec3d5-7732-47c7-8340-0495771953a6|PT,e234ecfc-6ba7-4bf8-b176-2033649d9a9b|VE,e24a84f6-657c-47ab-bf92-a5d16a378633|PT,'
  'e356f256-1486-43fd-9530-6b64c4815985|ES,e3cf336d-2da2-47ba-a1cd-aa0f891b9a0a|IT,e3e4bc64-53ae-4df3-ab3d-24be8c073a92|MX,e3e82e09-131a-4b59-a4fe-434dc4a54186|ES,'
  'e3f3be65-d3bc-41c2-915b-5de0d0361aa8|PT,e4cf373e-3f39-408a-92e1-f6fb0cec501c|MX,e551c091-7fd6-4b64-a5fc-86f90b867819|ES,e5b1b42a-fb44-43b1-9d4f-c260b4b9222f|NZ,'
  'e6064443-0df1-44f9-8795-5f72d66d3515|AU,e73572f1-935a-4a3d-a462-7c9801d206cf|US,e76671e0-4f07-4f8d-b3d0-83388ec79c07|VE,e7842033-fb9b-4a46-86b2-7b7fe55cd8f6|CL,'
  'e7e3ae04-7e29-4e80-8ac6-36e8393851c7|ES,e8908ea6-db8c-4f37-8973-461e24d143df|PT,e8d362fb-ab6c-461b-93b2-8999060eafae|PT,e8d96dc9-1dcb-4c47-bb7f-1576f650ac18|MX,'
  'e9a6fb74-7558-49fb-bbd7-9c6f6c08ad33|ES,ea38d4ee-05bb-49a8-9cf9-312ad9d1e09e|PT,eadfd946-42bc-4731-bec9-c433d78eaeb3|ES,eb3801fd-c135-4b18-a7ce-30c09aa66bc8|NL,'
  'eb41f125-e5f4-4daa-af43-837b6e217bb8|ES,eb6a5382-dc6a-4839-9d9d-042aed975464|PT,eb70cd3e-b0dc-41f5-a0f8-1f56e456af22|PT,eb9d5df2-8dd8-4b0b-887d-a1eae7c3509f|PT,'
  'ec134085-99fe-43c0-b89e-3e82064f4d94|ES,ec90b163-b003-4f07-b9ae-31d79be65231|PT,ecb79410-52fe-44f2-b0ef-e2b39b7d2c69|ES,ed1ee35b-0121-4b26-8d22-2365f930e4d8|PT,'
  'ed565ba1-f0b8-4528-9d3f-07b57bf69dcd|CA,edff97c7-5659-4352-8f65-a4d64d5aa86d|PT,ee257e7c-5183-4289-a812-8d531e512c32|MX,eeb1189b-b97f-4f5d-b054-8b5ab2fc4a38|CA,'
  'ef01d2b5-5744-4e28-ab6c-558dc5d9c8fc|US,ef276ab2-471e-4d64-b403-2773b6ca3525|ES,ef7c2a48-6268-4478-a7f5-9f5d218c6d57|MX,f00b7017-ca33-4763-8fe0-eedade6d6a4c|ES,'
  'f0677e7a-7763-4aa7-9dde-758b40d418cc|PT,f0ad60f4-c6a4-4627-a9a0-fdfd5eae0f87|ES,f0ba6e84-3046-4111-91c8-b870fc8ad469|PT,f10150d4-219d-48a1-9a24-4faf71ee3c94|CO,'
  'f10796d7-f045-4539-8568-2b66049aaeed|CA,f13fee9e-c2cf-4dc3-b6ca-41da55aa5b31|UA,f1648e11-c74f-439a-adec-4d38a24cda69|PT,f1976784-a098-4323-8298-ad9c1000413d|ES,'
  'f19b5c4b-0671-4c9e-b939-e5addbdb5e4e|CO,f21c4d61-9ad7-42de-bb36-b7dec64f255f|SV,f37dccd9-5567-4ee2-8918-2e8b86a5d7dc|CR,f4bfcddd-dd48-4010-bf6c-cc99ad586a07|US,'
  'f4d0e6e4-546e-420f-a9fe-f2664962b28a|UY,f538a834-7aa2-4c87-8df4-53b137459c93|CO,f5c722c8-672b-469b-8925-f817f58785c6|AU,f64d5c99-d5e2-45b3-935e-69c517f800e3|MX,'
  'f685a826-86f9-426f-9c6a-c67c1a4b1776|VE,f6e2aacd-f311-4f7a-be18-108a5e683766|AU,f70e8592-bb53-4be1-afad-2bf949c2420d|US,f7df59bd-56bf-4eee-b956-31a0fbff82bb|CL,'
  'f84cb5ab-1e25-47fe-8628-b4b7c81d8cbc|BR,f85aa128-0d1e-4056-8b17-30b8a9a354a2|GB,f8b85ecc-2fb1-4d12-8ba3-64f8fbf03771|NZ,f90a78b0-46c1-4b04-b0db-6b3563822e1d|GB,'
  'f90b0154-cc12-4242-9577-7c15db1e63a3|US,f9aacda7-2ba1-48fb-b2ae-90499d9592ad|ES,f9e7e5f3-de13-46e4-b007-e0c028e5da49|ES,fa1b3d06-f485-48d6-bec5-5088de1f721a|ES,'
  'fa8bcd23-6e60-47b0-86de-135d6fdacd29|US,fae3a7a2-5b19-4c9c-8a14-cc9cbd4a877e|CA,fbe6b377-a844-4ba9-96e6-48794fc5fa82|MX,fbf0f735-903f-4445-8249-e4ede13edfa6|PA,'
  'fbffaa18-107e-41ca-a935-c4f212fc0738|BE,fc26a8ef-8169-4a02-9a9e-6da47ba4d245|AR,fcdc2505-2e3a-46cf-9796-3843f3ae55ff|UY,fd858cc8-5fa1-4f8c-9278-eab2e0feda7f|CA,'
  'fe558f60-59c2-4ce1-afae-262f0b7a3d3b|MX,fef41288-07f2-4be8-a269-9a1ad366ca44|PT,ff92eb78-3cdb-4e4d-ad8c-510d23ea831e|MX'
  , ',')) x;

do $c$
begin
  if (select count(*) from _vc) <> 627
     or (select md5(string_agg(venue_id::text || '|' || iso, ',' order by venue_id::text)) from _vc)
        <> '47f500d7c1a3cc21dbe559443241151d' then
    raise exception 'venue country list checksum mismatch';
  end if;
  if exists (select 1 from _vc v left join public.countries c on c.code = v.iso where c.id is null) then
    raise exception 'target country code missing from countries';
  end if;
end $c$;

create temp table _vc_target on commit drop as
select v.id venue_id, co.id country_id, co.code iso, v.country_id old_country_id, v.city_id old_city_id, v.state old_state,
       coalesce(
         (select c.id from public.cities c
           where c.country_id = co.id and c.duplicate_of_id is null
             and c.latitude between v.latitude - 0.6 and v.latitude + 0.6
             and c.longitude between v.longitude - 0.9 and v.longitude + 0.9
             and public.city_name_key(c.name) = public.city_name_key(v.city)
             and public.haversine_m(c.latitude, c.longitude, v.latitude, v.longitude) <= 60000
           order by public.haversine_m(c.latitude, c.longitude, v.latitude, v.longitude) limit 1),
         (select c.id from public.cities c
           where c.country_id = co.id and c.duplicate_of_id is null
             and c.latitude between v.latitude - 0.15 and v.latitude + 0.15
             and c.longitude between v.longitude - 0.25 and v.longitude + 0.25
             and public.haversine_m(c.latitude, c.longitude, v.latitude, v.longitude) <= 15000
           order by public.haversine_m(c.latitude, c.longitude, v.latitude, v.longitude) limit 1)
       ) new_city_id
  from _vc x
  join public.venues v on v.id = x.venue_id
  join public.countries co on co.code = x.iso
 where v.country_id is distinct from co.id;

update public.venues v
   set country_id = t.country_id,
       city_id    = t.new_city_id,
       state      = null,
       enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object(
         'country_repair', jsonb_build_object(
           'by', 'migration:99991791714603',
           'reason', 'coordinates in ' || t.iso || '; city_id was a same-name city abroad',
           'from_country_id', t.old_country_id,
           'from_city_id', t.old_city_id,
           'from_state', t.old_state))
  from _vc_target t
 where v.id = t.venue_id;

do $verify$
declare v_bad int;
begin
  -- P1: every listed venue now carries its coordinate country.
  select count(*) into v_bad from _vc x join public.venues v on v.id = x.venue_id
    join public.countries co on co.id = v.country_id where co.code <> x.iso;
  if v_bad <> 0 then raise exception 'P1 failed: % venues not in their target country', v_bad; end if;
  select count(*) into v_bad from _vc x left join public.venues v on v.id = x.venue_id where v.id is null;
  if v_bad <> 0 then raise exception 'P1b failed: % listed venues no longer exist', v_bad; end if;
  -- P2: no listed venue points at a city in another country.
  select count(*) into v_bad from _vc x join public.venues v on v.id = x.venue_id
    join public.cities c on c.id = v.city_id where c.country_id is distinct from v.country_id;
  if v_bad <> 0 then raise exception 'P2 failed: % venues linked to a city in another country', v_bad; end if;
  -- P3: cruising venues stay safety-gated everywhere.
  select count(*) into v_bad from _vc x join public.venues v on v.id = x.venue_id
   where v.category = 'cruising' and not v.safety_gated;
  if v_bad <> 0 then raise exception 'P3 failed: % cruising venues lost safety_gated', v_bad; end if;
  -- P4: the five border-ambiguous rows are not in the list.
  if exists (select 1 from _vc where venue_id in ('f6f5b4f0-a305-4149-a9a8-36e93e98f49a','aca2b25f-61db-4e32-97fc-98640f0d16ad',
     '23dd5ac3-e3a3-4958-9dee-c2eb7d9caf3b','fbf07cd0-4373-4b00-bbc6-cda16ba099dc','3544707e-8651-47ee-92de-bc6cb1627ca4')) then
    raise exception 'P4 failed: a border-ambiguous venue is in the repair list';
  end if;
end $verify$;
