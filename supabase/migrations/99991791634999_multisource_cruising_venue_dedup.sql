-- Cruising-venue dedup for the multi-source countries (2026-10-10):
-- CH, NL, BE, AT, FR, IT, US, GB, IE, LU.
--
-- Follow-up to the Germany pass (99991791632592). Outside Germany most
-- cruising rows come from one source (gays-cruising), so duplicates are
-- mostly repeat submissions ("Wolvenberg" twice, "Vlagheide" / "Vlagheide 2",
-- "Playalinda Beach Lot 2..13") plus gayout/planet-randy copies of the same
-- park ("Kelvingrove Park (cruising)" = "Kelvingrove Park").
--
-- Method: every pair of live category='cruising' venues in the same country
-- within 1.5 km whose names agree after a multilingual normalisation
-- (EN/FR/NL/IT/DE terms for park, lake, parking, rest area, toilet, beach,
-- forest, station; trailing numbers stripped): 576 candidate pairs, all read
-- by hand. 343 judged the same place, 233 different and NOT touched
-- (different toilets / university buildings / gyms / mall stores, opposite
-- motorway directions such as Baltenswil Nord vs Süd, different businesses).
-- Per the site owner, numbered sub-spots of one place are merged into one
-- entry, as in Bremen. Two "US" rows that are actually Venezuelan
-- (Las Cruces, Los Jarales) carry a wrong country_id and are left alone.
--
-- 300 drops in 251 clusters. Keeper = most events/sources, then gayout,
-- then the most generic (shortest) name; five keepers get a corrected name.
-- _venue_merge_core copies no fields, so keepers are enriched fill-if-empty
-- first; every merge is schema:1 and reversible with unmerge_venues().
--
-- Soft on preconditions: both sides are resolved to their live terminal,
-- so a pair another session already merged (in either direction) is a
-- no-op. Hard on postconditions: end state only.

set local statement_timeout = '300s';

create temp table _ms_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _ms_pairs values
  -- AT P&R Jelinek (Hartberg) <- P&R Jelinek PP
  ('05e5ea69-e1fb-4a36-9efd-e3821e6b0871', '90ba4756-14cc-4de6-be84-af8044ff5830'),
  -- AT Wc promenade (Ried im Innkreis) <- WC Promenade
  ('c280e56f-9143-405a-bc6f-3c2148af1e43', 'bc31ce1f-9d3b-4361-8590-f82bf4ffea5f'),
  -- AT Rastplatz Ortnerhof (Sankt Michael in Obersteiermark) <- Rastplatz Ortnerhof Süd
  ('132de135-e689-4bf3-b01f-81414dc0a916', '6771797c-349a-406f-a6b0-0d996d794192'),
  -- AT Donauinsel (Vienna) <- Donauinsel, Toter Grund
  ('4e57c46a-4e78-4219-8166-e78206780d9e', 'a72e250e-b561-4cc8-89ad-613cb8f7ac5a'),
  -- AT Lugner City (Vienna) <- Lugner City
  ('53bb49d9-0228-4f77-9a6d-26e73d3abc2e', 'cec96873-180f-47fc-bcee-0a0e92a8cf93'),
  -- AT Sling (Vienna) <- Sling Cruising Bar
  ('06683b2c-9dc9-44cc-97b0-618a8b39309a', '0c72ef2d-046d-4f50-a598-6ac2ba8d5ef2'),
  -- AT WC Böhmischer Prater (Vienna) <- Parkplatz Böhmischer Prater
  ('1e1db4eb-fc3a-44f0-a311-09a6435fb73a', '15944e17-5565-44a7-b5d5-1f27251d3dd8'),
  -- AT Wienerberg (Vienna) <- Wienerberg
  ('35d0be1b-e0f2-4c57-bd33-1ead23b6a600', 'e079238e-b00a-439f-a505-51bb6b922cb6'),
  -- AT Wiscot (Vienna) <- Wiscot gay store | Wiscot-Center (Gay-Shop, Kino & Cruising)
  ('bb2744c6-baa1-45aa-a4e7-7fa46be539d1', '6b674f3e-d331-447a-834c-12d6f4bcea3a'),
  ('bb2744c6-baa1-45aa-a4e7-7fa46be539d1', 'efb44d04-b101-4e3c-b36a-7cd4ffcec1b4'),
  -- AT A2 Lassnitzhöhe Süd Rastplatz (no city) <- Rastplatz A2 Lassnitzhöhe Nord und Süd
  ('c75ed82a-97d0-4db5-97ce-dd1690c41129', 'c2b46d8a-1cde-4e8e-84ba-226ae3f8a4c3'),
  -- AT Badeteich Hirschstetten (no city) <- Bathing pond Hirschstetten
  ('cfd58bfa-e8d6-45e6-a645-6aa1649ab747', '13b46eb7-4279-421e-a6ca-7c295675dd60'),
  -- AT LKW Parkplatz-Horn (no city) <- LKW Parkplatz Horn Richtung Rosenburg.
  ('d7c9c9f8-11a0-4da8-aa0d-fc0c32c2c281', '4bdc49a7-8f8a-4618-b3af-a05e7e95f88d'),
  -- AT Weissenbachtal (no city) <- Weißenbach FKK-Gebiet
  ('de99efab-cd69-4983-b738-a5706423abd0', '204d999b-e205-456e-af1c-166af19eb1a3'),
  -- AT Wien Süßenbrunn (no city) <- Näche - Bahnhof Wien Süßenbrunn
  ('dfaf45ba-282f-47eb-abda-a44af2a81296', '6e3823eb-5b0d-43aa-bc49-d79965aa4d00'),
  -- BE Sous le ring à Parc de Neerpede (Anderlecht) <- Grande butte du Parc de Neerpede
  ('25d622df-4520-4613-9b8b-23cab984d044', 'c6bb1e05-91a2-4e63-8e6f-58ecf159a0a4'),
  -- BE Grootschijn (Antwerp) <- Rivierenhof | Groot Schijn | Groot Schijn Rivierenhof
  ('1b46b582-8e87-48e0-88a2-043f6cfa3db4', 'b2018709-431c-46f7-a4bc-9b66f1a538e5'),
  ('1b46b582-8e87-48e0-88a2-043f6cfa3db4', '0e3dc477-3378-44aa-a7b2-965b8ae04ded'),
  ('1b46b582-8e87-48e0-88a2-043f6cfa3db4', 'df9a259e-24cf-455f-b94a-1051c55a4fd4'),
  -- BE Vogelhuisje (Antwerp) <- Vogelhuisje Ekerse Putten
  ('1460ad53-5c43-43fb-b979-c2d485989b92', '3396c9b5-cb67-4eae-b714-d3ddf54fb915'),
  -- BE Temsebrug (Bornem) <- Buitenland Temsebrug
  ('0b3f49a0-184c-4434-b1fd-9f14cf94a496', 'affb5cc6-9b73-4c4a-a2ac-239a6e2350af'),
  -- BE Waggelwaterbos (Brugge) <- Waggelwaterbos Dichtbij
  ('c7499b39-8cdb-4ef2-a747-0c86af95d03d', '8c925314-b78e-4840-8286-2c38b24ecd73'),
  -- BE Bois de la Cambre / Ter Kamerenbos (Brussels) <- Bois de la Cambre | Bois de la Cambre - Victoria
  ('ed0ca0d7-b7f0-419a-bc16-f10a25ff66e2', 'c02660f6-df65-4bab-b328-b87a7c97101d'),
  ('ed0ca0d7-b7f0-419a-bc16-f10a25ff66e2', '21fbc4bc-57cc-456c-a819-08e8472aff93'),
  -- BE L’atomium (Brussels) <- Parking Atomium
  ('223660ff-577a-47a4-a24a-09b4903df48d', 'e12089de-048f-455f-81e9-4fa17afc409b'),
  -- BE Aire des Amoudries (Cruising) (Charleroi) <- Aire des Amoudries E42
  ('c0709fd5-7427-490c-b629-d30b2c13b8f2', '34c21cdf-ece8-4310-966c-4b558b22de11'),
  -- BE Gare (Charleroi) <- Parking Gare | Gare Charleroi Sud
  ('24c4eaf4-9515-4c2e-831c-3ff684ef9f54', '2b496b36-4cf2-4b4c-aa49-020529b7df8f'),
  ('24c4eaf4-9515-4c2e-831c-3ff684ef9f54', '45e1314c-d6fd-406b-a17e-b2e66f247081'),
  -- BE Parc La Serna (Charleroi) <- Parc de la Serna
  ('a66c47d7-71bf-4081-8343-17df77c85bb7', '8dfd2844-88c1-4793-aaaa-a468ed6da9f3'),
  -- BE Sentir R3 (Charleroi) <- Sentir le Long du R3
  ('92081972-0fe0-4eb1-a5fd-a3467fc89749', '2f79a302-3fe9-4cd9-9cfe-2249651dd084'),
  -- BE Buntven (Deurne) <- Buntven - Raktweg
  ('976f49ed-b50f-40f3-a2fa-947e7d3ca12b', '9cb74050-b557-46fa-b05c-adad59848ce4'),
  -- BE Park Zandbergen (Edegem) <- Park Zandbergen
  ('1ec5cb6c-b98f-4723-89c2-cd3fa56dd538', '0da909fc-75a5-4b11-907e-34464dbe7441'),
  -- BE Bosjes Blaarmeersen (Gent) <- Kleedhokjes blaarmeersen | Blaarmeersen naast watersportbaan | Kleine parking brug naar Blaarmeersen
  ('80549ae9-5bfb-43e9-9058-2c1d95585a5b', 'b43accd1-643c-4a3b-8493-c6735614270c'),
  ('80549ae9-5bfb-43e9-9058-2c1d95585a5b', 'b8be08a8-adcb-4e79-967b-3f875bc82ef1'),
  ('80549ae9-5bfb-43e9-9058-2c1d95585a5b', 'f3c46b33-1517-41c9-939d-8dcffb36dfc6'),
  -- BE Wolfstee (Herentals) <- Wolfstee Station
  ('64fdea80-a906-4066-af36-6ef9dd92d9cf', '2156a68a-04d9-44a2-81c0-7991b5d6c8ed'),
  -- BE Maison abandonnée (Marche-en-Famenne) <- Maison abandonnée 2
  ('c84689d5-45cd-481f-a023-5dbeb2e0d06f', '12909a0c-2e49-4106-a3b1-14198d8b6c59'),
  -- BE Bois de Lauzelle (Ottignies-Louvain-la-Neuve) <- Parking de Lauzelle
  ('1d24201a-ecc4-4987-a5d6-4923905ba565', '4b7fa052-cb26-44a3-9d5d-a316113f3b8a'),
  -- BE Kleiputten (Roeselare) <- De Kleiputten
  ('7b9ae72b-bced-4286-bf06-7f612dd42292', 'ea0ddc58-68c5-4b7d-a201-8447eaa741db'),
  -- BE Aire de repos Horion hozémont (no city) <- Aire de Horion Hozemont vers Namur
  ('d51e88c3-d475-4da8-bd9a-1e4bc20aeb83', '8d84a9a5-4afd-4fb8-ba66-c470e3b3122e'),
  -- BE Boekenberg (no city) <- Boekenbergpark | Boekenberg Park
  ('f6483c97-2151-4bf8-ac52-6069b20bdd97', '22c8317e-518e-45b0-97cc-fa6d39c13211'),
  ('f6483c97-2151-4bf8-ac52-6069b20bdd97', '4aed702a-4056-4b7e-b0f1-6c3bd9c5c258'),
  -- BE Bois de Soleilmont (no city) <- Petit Bois - Rue de Soleilmont
  ('9b088104-64af-4b3e-95dc-8504eb2fb643', 'eb72a875-ef7e-4056-b69f-258d49bb9d66'),
  -- BE Bos (no city) <- Bos achter Parking 69
  ('1aa6d1b1-9856-491a-805f-f0bd4d20ef51', '80c50e64-8d26-4401-b704-4982b2ab29ab'),
  -- BE Boske Voetbal Werchter (no city) <- Bankje int Boske Werchter
  ('bbd0a6b5-a7cb-46e5-afbb-b9a84c8a1366', 'c94e1bc7-71ae-49ae-a346-defe50fb04aa'),
  -- BE Carpool Parking (no city) <- Carpool Erpe Mere
  ('8f0f1add-ee1d-4ce9-b499-2d6f50221308', '8eee854d-37aa-4e09-a34e-4db325e772ce'),
  -- BE De Gavers (no city) <- Parking Gavers | Bosjes en velden aan de Gavers
  ('afe5f623-3a26-4dfc-931c-17a8cf0251e7', '3e9e4896-54c7-4aac-9f33-aa4d0ed154c1'),
  ('afe5f623-3a26-4dfc-931c-17a8cf0251e7', '335df6ee-b605-4a9b-bd72-656def955059'),
  -- BE Duinen Mariakerke (no city) <- Duinen Mariakerke Kinkhoorn
  ('beb0fccb-8db9-49cf-8ca6-ee0b0f48ea5c', 'a50766e8-a6e8-4a53-8807-c7bf84f39b54'),
  -- BE Gros Tilleul (no city) <- Av. du Gros Tilleul
  ('944731fb-8d8d-47aa-b7ce-bac263e2a205', 'b4646377-bdc2-4b43-8c76-cb029b8e063d'),
  -- BE Klein Zwitserland (no city) <- Klein zwitserland noord
  ('7556f122-ed9e-48bc-b463-1184a1e73e33', 'ea82e7ad-11b3-404e-91fe-9b1985746f56'),
  -- BE Konijnenwei (no city) <- Parking Konijnenwei
  ('666dd886-d457-4710-82f4-a15b512d8d8a', 'feaf12c0-e308-4229-ac16-81b8964b0001'),
  -- BE Parc de Forest (no city) <- Parc de Forest, chalet
  ('f2575942-0cb6-4ae0-ac18-4aea19473275', '9e3926de-18e7-493d-8289-c513a5a44ae3'),
  -- BE Park Spoor Nord (no city) <- Watertorens Spoor Noord
  ('fee530da-8bfc-4f69-8e58-c9ff699e0425', 'ad8bf225-ef06-4200-8ace-17b184b4cad7'),
  -- BE Pietersheim (no city) <- Parkeer Domein Pietersheim
  ('95515785-73d8-4007-92d6-e0c5901d4cf5', '9151ecf4-7447-45c8-bf76-9a0bf832201f'),
  -- BE Ravel (no city) <- Ravel Pontisse
  ('eb17a0e8-9d2e-458d-b807-470963f7349a', 'c114116e-0f28-4362-8d0d-001fe15e08d0'),
  -- BE Ravel de Gerpinnes (no city) <- Ravel de Gerpinnes (Rue du Petit Fond)
  ('84be65cf-8af6-4195-865b-193e068ab522', 'c0778859-ebe8-43a8-a874-7cf5c589cf57'),
  -- BE Volvo Visvijver (no city) <- Visvijver Oostakker (achter Volvo Trucks)
  ('71263e83-d51e-4238-88cb-d1b48d7c8946', 'db18d221-7531-4c63-bb1b-8bb73fcb8612'),
  -- BE Wolvenberg (no city) <- Wolvenberg
  ('a8f1ea21-5f00-41b2-9b68-cee444db3da4', '7b9a8662-f264-4f90-ba50-9a14395ec910'),
  -- CH Bachgraben (Basel) <- Bachgrabenpromenade
  ('dc519ebb-4d8d-4251-88bd-4611b8721d27', 'a5475dff-ff29-4506-88a5-d62ec04da736'),
  -- CH Schützenmattpark (Basel) <- Schützenmattpark (Cruising)
  ('a3bb4a66-739e-4ad4-8f55-8168177d1a70', 'c1a61d50-5d2a-4702-b2aa-edd5dc357513'),
  -- CH Wenkenpark (Basel) <- Pavillon beim Wenkenpark
  ('82114f48-0397-4e79-9a72-9e75983b0bfc', '47c02dc1-c59d-475a-87c0-d55b0426e2b1'),
  -- CH Bremgarten (Bern) <- Bremgartenwald
  ('8161934f-5745-427a-9b76-f6e094da7b85', '0a2e3afd-7119-4174-838b-c4a868945b40'),
  -- CH Dalmazi (Aare) (Bern) <- Dalmazimätteli
  ('1200809f-cd43-450f-a85e-45749893a49d', '592a4cfc-48f3-4219-872b-aa228f208410'),
  -- CH LSD Cruising World (Bern) <- Cruisingworld | Cruisingworld Littau
  ('e4cc1ce0-9baa-4bbc-8bba-e74688254273', 'd24efd5b-9240-4bd6-8b12-ec25fded98bb'),
  ('e4cc1ce0-9baa-4bbc-8bba-e74688254273', '5df3eb5f-e389-433a-9121-29041f0a45a9'),
  -- CH Birsköpfli WC (Birsfelden) <- Toilette Birskopf | Flap at Birsköpfli
  ('1c782289-9fca-494b-8c13-d3ed87abe968', '275224a1-d5bc-4670-915d-84985b3ba3eb'),
  ('1c782289-9fca-494b-8c13-d3ed87abe968', 'df447c7c-ea9f-481d-9574-9ee6a98b4838'),
  -- CH Sauna Obere Au Chur (Chur) <- Hallenbad Obere Au - Chur
  ('3a7cd149-a12c-487a-88c4-a642e945f16f', 'de20d626-f0c8-48d7-801d-81dd43e8db8d'),
  -- CH Wc Schlosspark (Frauenfeld) <- Parkhaus Schlosspark
  ('ab84bf0b-153d-4bd3-bac7-0da3bcc42584', '438a104c-62f0-4951-a7ff-badfd8e5ba80'),
  -- CH Parc de la Perle du Lac (Geneva) <- La Perle du Lac
  ('c4764f79-73ec-4ba0-8c45-6033ceead058', '4bb916f2-da7b-429a-8686-54fb8889945c'),
  -- CH Aare Grenchen (Grenchen) <- Grenchen Aare Wc
  ('42a90a47-48d4-42a1-a338-dc53c6394bd4', '8c6b60b0-3d0a-46a5-bbfe-6e130b68964f'),
  -- CH Rugen (Interlaken) <- Kleiner Rugen | Kleiner Rugen interlaken seite
  ('bd63062f-7fca-47b4-8e54-8281422b0cfd', '5a74feaa-57ac-4a4d-a104-00c59191906c'),
  ('bd63062f-7fca-47b4-8e54-8281422b0cfd', 'bd995963-206f-4f16-a64e-8253a12c754c'),
  -- CH Pilatusmarkt P6 (Kriens) <- Pilatusmarkt EG Toilette
  ('03cdfa63-f188-4e7d-8bf6-d1b2cb44b456', '4840e3fa-6225-4214-b101-ef435c394bbc'),
  -- CH Parc Valency (Lausanne) <- Wc Parc Valency
  ('cf39be07-cbad-45a4-8e3d-1eafa3b26e6d', 'c0079149-a12d-4ebc-886b-7983b21134d4'),
  -- CH Lido Foce Maggia (Locarno) <- Lido-foce Parcheggi Lungo Viale
  ('2eac5179-8a42-47ae-bb38-71c6255c03c1', '76b6e13c-39b5-45ce-ab1d-3c48b2241766'),
  -- CH Eichwald (Luzern) <- Eichwald Bunker
  ('4d773a6b-103f-452c-8a82-9557f6784ec4', 'd338e1db-27d5-429a-a37a-90788b7d04f9'),
  -- CH Gütsch (Luzern) <- Parkhaus Gütsch
  ('e5f310bd-db6b-4f01-ac6b-ddb0f1598f5d', '79fa12f7-8696-4bf0-bf75-34b564451be8'),
  -- CH Inseli WC (Luzern) <- Inseli Park
  ('b3dd638d-c8e2-4ef7-87d3-5cf64dca460b', '86f8a4f3-287a-4ac5-b668-54da87474b7a'),
  -- CH Parking Oftringen (Oftringen) <- Parking Oftringen Ost
  ('07ad4c26-b55c-4fc3-a06a-77c53af0a56e', '4064b32e-570f-48fa-a5d4-edc897d5d5cd'),
  -- CH Seewenmarkt (Schwyz) <- Parkplatz hinter Seewenmarkt
  ('cf91bbcd-1af3-4e19-9cc9-860dc0658ae4', 'd3beb7f4-f997-4b98-a0c2-b506226f6482'),
  -- CH Drei Weiheren WC (St. Gallen) <- Flap at the Buebenweiher
  ('0e9c17fc-3556-45b6-a5bb-16f0d3784de1', '68b0cb91-20a1-45b9-ac7d-44f933318ba1'),
  -- CH Gübsensee (St. Gallen) <- Gübsensee Winkeln
  ('da0365eb-ce91-41a5-ba37-2d29faa4500c', 'eeded92d-72c5-4ae1-9ee3-a9c42ef3f147'),
  -- CH Schwäbis WC (Thun) <- Schwäbis Alleestrasse
  ('349c71cf-7fd8-4e2c-b5ab-35f66ad620b6', 'ab728a43-76e7-4f5d-8f96-bb75559ff83a'),
  -- CH Strandbad beiden wc oder duschen (Thun) <- Öffentliche Toilette nähe Strandbad
  ('3c217a87-95ec-414e-9a63-c2541b59d36c', 'fb558435-721a-4569-a223-1f34d1299fde'),
  -- CH Greifensee (Uster) <- Greifensee Steg | Greifensee Parkplatz Niederuster
  ('8f763541-6935-411c-9894-e77a9a060ca5', '17a5190d-e4ef-440b-b648-ba89bce3c991'),
  ('8f763541-6935-411c-9894-e77a9a060ca5', '05c35a0f-063a-42c8-873c-0360cda7174c'),
  -- CH Lignon (Vernier) <- Glory Hole Wc Centre Commercial du Lignon
  ('12f53f58-d80e-451f-92d3-322658696e7b', '720680c3-f033-42ab-bc0f-8eec9946d8cf'),
  -- CH Grüzepark WC (Winterthur) <- Grüze Markt Toilette Parking
  ('e991c7ce-481e-487b-a1ab-723c119d7580', '1c4e4e75-baa5-4bfe-a73e-1dc0dde278d8'),
  -- CH Toilette publique (Yverdon-les-Bains) <- Toilettes Publiques
  ('43a39e0c-5a26-4389-abb0-e38bea6dbb31', 'eb32a66c-9ea6-40d8-b125-d83d145fbf6e'),
  -- CH Sportzentrum Zuchwil (Zuchwil) <- Saunapark Sportzenturm Zuchwil
  ('1414f19b-0a1e-45d0-b352-22ce5ffc1a76', '8b984c10-ba20-41c8-8a8a-4004668c6a21'),
  -- CH Büsisee (Zurich) <- Büssisee Nord
  ('0c4a6888-517b-4b53-96e2-5ace7452578e', '1483ba7d-498a-443d-86e0-e25300372aca'),
  -- CH Erotik Factory (Zurich) <- Erotic Factory Zurich
  ('a6cf996f-8d45-47a3-89fe-6fbcecfc16ac', '93fcf88e-7ea2-414d-949e-9ecf963cdb2a'),
  -- CH Eth Hönggerberg (Zurich) <- ETH Hönggerberg ASVZ Fitnesscenter, Duschen
  ('48c5be9e-3b87-4484-b626-89f771416270', '5d0f41d8-8c62-4ec5-8c0b-8b05b06f1130'),
  -- CH Europaallee (Zurich) <- Bridge Europaallee
  ('02214391-4963-420a-a0f5-76c8c92c1f59', 'c53156db-58f4-4d6d-bcab-76eced7859a9'),
  -- CH Friedhof Sihlfeld WC (Zurich) <- Friedhof Sihlfeld, Kapella A | Friedhof Silhlfeld - Gutstrasse | Friedhof Sihlfeld - WC Tramstation
  ('294478d6-57bc-4e33-bf09-de676e159859', '79ffa8f7-e4c4-4e55-990a-4c5305f5cfc9'),
  ('294478d6-57bc-4e33-bf09-de676e159859', '06d01e94-8641-4ee8-bf3f-c568e3253c8e'),
  ('294478d6-57bc-4e33-bf09-de676e159859', '53fa78af-4ea2-4ed7-884c-5acbccdace00'),
  -- CH Glattpark (Zurich) <- Wald Glattpark / Waldhütte Austrasse
  ('464624d1-bbd9-4ea3-a4a1-fd6cdc89ea72', 'c999b42a-8b95-4d11-bd0d-95c259954d9f'),
  -- CH Jelmoli (Zurich) <- Homes Place Jelmoli
  ('620f7371-5a66-4547-be61-c2630873425f', 'a4cc7818-a6ff-40e2-8623-3566bc5e518d'),
  -- CH Platzspitz (Zurich) <- Platzspitz Park
  ('1d7f83af-b08d-44dc-bcbf-237693519c92', '9165e45f-861d-45df-b9fd-f45d077ac85d'),
  -- CH WC EG UZH Binzmühlestrasse 14 (Zurich) <- UZH Oerlikon Binzmühlestrasse 14, WC EG
  ('b6750877-1d09-4804-bf95-ba3e59a441c7', '2d2b9255-594c-4ce8-b28b-2225e7cccc0d'),
  -- CH Wald Zürichberg (Zurich) <- Zürichberg / Funkturm
  ('aebe89ef-b75b-4eaf-82b2-fe3afda336bd', '67a4b20e-0ca0-42a2-81a5-deb5d9a16f2e'),
  -- CH Witikon Friedhof (Zurich) <- Parkplatz Friedhof Witikon
  ('f71c6398-afb9-4453-a523-c30693d48b05', '165764d3-fb20-42c7-a89a-949119c59cce'),
  -- CH Bahnhof WC (no city) <- Bahnhofstrasse 18 WC
  ('cfb572a1-e6a5-46a4-b9c7-e99ac8878031', 'ac786692-d45c-418e-acd2-b731afa574a0'),
  -- CH Bahnhof WC Gleis 1 (no city) <- Bahnhof Schaffhausen Herren WC Gleis 6
  ('6c0ba5c6-f235-4db4-8946-eef115a72c99', '759585ad-dd7a-4a2c-8424-0e4b1e0c8e5e'),
  -- CH Carl Sauter (no city) <- WC parc Carl Sauter Renens
  ('efb2d593-b4d3-4bf7-9dfd-ff2358b27fc1', 'e727d04e-0b2e-4990-b34b-4a09978e259e'),
  -- CH Entlisberg (no city) <- Vitaparcours Entlisberg
  ('dcf59ffb-a2bb-4790-8cf6-786f8a251e2a', 'ea24a05a-5948-4b12-8f25-49e153c67df5'),
  -- CH Greifensee Badi (no city) <- Parkplatz Greifensee
  ('ecfabf42-bb44-40e3-9601-4ca628c0f10d', '56654e04-a9a1-45c6-b9c6-22395d068ea5'),
  -- CH Hardwald Dietlikonerseite 2 (no city) <- Hardwald Kloten Seite Dietlikon
  ('39ca2236-a65e-45aa-abb1-b3d77ac4ca7d', '051e7368-4aa2-4fe4-93b5-cebf630edde9'),
  -- CH Kefikon Süd (no city) <- Rastplatz Kefikon
  ('dc6a20ba-84c0-4c16-a752-d7b34a182b52', '7c39f1f6-aab4-4771-9c03-ce786c13dfc3'),
  -- CH Kempthal (no city) <- Toilet at Kempthal
  ('a7211c22-fc43-472f-ad5c-68467bde7b84', 'fb2d8f57-3fa2-4d1f-9606-6c958ce2d7d6'),
  -- CH Langnau (no city) <- Langnau I.E.
  ('d55daee9-605c-4f7e-96fc-f59293a63d9f', '9b1528f6-5917-4338-a43b-bc08df147e12'),
  -- CH Monte Verità (no city) <- Gabinetti pubblici, Monte Verità
  ('64bd29cb-5ed7-4f78-a923-7a1db928da63', '805d21fd-13c9-46a1-bcfd-2882de146ca8'),
  -- CH Munot (no city) <- Munotsportsplatz Männer WC
  ('fa7dba72-bc03-471b-a9b6-d7d2bbbe6cb5', '5cb46bcc-a552-4f14-b1ce-dd9aebef6510'),
  -- CH Passeggiata bolle di magadino (no city) <- Passeggiata tra i campi e le bolle
  ('60defd5e-7a66-413c-a720-39ed04ff84be', 'c0b9e01c-b9e9-4dcf-9873-ef18e19ddcef'),
  -- CH Plage Naturiste de l'Allondon (no city) <- Parking de La Plage Naturiste de L'allondon
  ('b2819e26-c343-4518-9dc4-57e01b819f1e', 'bac77ba4-f225-4c68-964d-b6fdb11ad824'),
  -- CH Pont entre Ins et Sugiez (no city) <- Sous le pont entre Ins et Morat
  ('8f8a7e83-64ff-464e-b9eb-3250ca780b08', '76c05242-33c5-4acd-9913-9d2da61f113e'),
  -- CH Rest area Apfelwuhr (no city) <- Rastplatz Apfelwuhr Zizers
  ('bfaa4eb3-3b0b-4263-a2e5-718a92a93a24', '5bf4cd11-75ed-4d10-85ed-9f43e64c84ed'),
  -- CH Schosspark Hallwyl (no city) <- Parkplatz Schloss Hallwyl
  ('ccad5f1a-12bd-44e3-8707-c2f9921c969e', '07c18378-b9c3-47e7-b81c-20853d4473e6'),
  -- CH Sodbach (no city) <- Sodbach
  ('f35d9af8-25ee-4e90-a052-9a8914dda28c', '7d851684-e018-465b-89be-7924454fdf40'),
  -- CH Toilette plage d’Auvernier (no city) <- Parking de la Plage d'Auvernier
  ('e37ee720-db1a-46ed-bd9b-809c0954e682', '1f80d97f-f3f4-45b8-9953-d55a00edff0b'),
  -- FR Parc Almet (Behren-lès-Forbach) <- Behren les Forbach Parc Almet
  ('029e1ddd-e51d-4900-96f4-3f55c5c3c7a3', '511b1296-4906-4eac-9da4-d0bff566531a'),
  -- FR Remparts (Bergues) <- Remparts de Bergues
  ('0bdea263-6411-4481-99b2-3182a6e41a60', '1f8559a3-0b2a-4215-bef0-62eb647ea0bc'),
  -- FR Drague de Bordeaux Lac (Bordeaux) <- Drague de Bordeaux Lac (côté parc des expos)
  ('46d43cd8-d712-43e1-8ce1-8bcafcf3cc28', '64e5e942-3771-4863-8340-31c03ee975f3'),
  -- FR Bocal du Tech (Elne) <- Bocal du Tech, petit ranch
  ('1dc5f165-80c3-476b-ae1c-32d9f2a9d505', 'cc633557-0285-448f-b54e-ef58c883be28'),
  -- FR Bois du Commandeur (Ibos) <- Bois du commandeur à Ibos
  ('559411ca-cbe9-448d-889f-7c37a5c772d3', '8f83d170-8b10-4f00-bf3e-2d0f2eb99f13'),
  -- FR Toilettes publiques (Lathuile) <- Toilettes publiques (2 urinoirs)
  ('a41a0e2e-6177-4fb3-964f-2ad40ebeabe4', '17859cdd-5f6c-4adc-b35a-439929fdbe3c'),
  -- FR Parc Henri Matisse (Euralille) (Lille) <- Parc Henri Matisse
  ('4f29832d-faed-49ff-9a1c-b16b421d85ef', 'b4890e40-5f2a-4e7f-9392-629a4084f95b'),
  -- FR Berges du Rhône (cruising) (Lyon) <- Berges du Rhone
  ('195c89bb-6962-45fc-bd6c-112322e6c115', '1ef6a36b-2d50-45a3-a741-1e2003fffb18'),
  -- FR Parc Borély (Marseille) <- Parc Borély (cruising)
  ('4952fecc-30bf-4806-b57a-f8796224883d', '1ff1ad4b-49a9-49aa-af86-f4289c489401'),
  -- FR Parc de Miribel Jonage (Miribel) <- Parc de Miribel - Chemin du Cabanon | Parc de Miribel - Parking des Platanes
  ('37362b3a-7d99-4cda-816c-c9b8afac2251', '7c76a2d8-cfcb-4d98-bad6-1d289a26bba9'),
  ('37362b3a-7d99-4cda-816c-c9b8afac2251', '988d6f4d-672e-43cd-8aad-9c0598463369'),
  -- FR Pointe de l'ile Beaulieu (cruising) (Nantes) <- WC Beaulieu | Pointe de l'île Beaulieu
  ('fecd68ce-87c8-4a91-8929-7df4e4f2f44c', '991fbbca-6ada-4d2c-a0e4-6da695b77f02'),
  ('fecd68ce-87c8-4a91-8929-7df4e4f2f44c', '945e4d43-5a1b-446f-b7a4-b42966ab86a8'),
  -- FR Morgan Club (Nice) <- Morgan Cruising Bar Gay | Morgan Hot Cruising Bar
  ('b2593cc6-bd60-49ff-8c1e-c66820f0859e', '1d5658c2-e3dd-4e8a-b8ac-b82c529e0605'),
  ('b2593cc6-bd60-49ff-8c1e-c66820f0859e', '561a2348-bc08-4dde-bb58-64e213753816'),
  -- FR Bois de Boulogne (Paris) <- Boulogne - Route de Sèvres
  ('e1a7ce89-a1fa-450f-aa5b-f6c9901aa241', '10974388-bd58-4d78-ac36-9de5e0a54ba3'),
  -- FR Bois de Vincennes (Paris) <- Bois de Vincennes 1 | Bois Vincennes - Tata beach
  ('ae21c3be-6674-40ff-b94c-f1c9deaf87ae', 'df3b3bc5-13e2-41aa-b574-84cdcbf8876d'),
  ('ae21c3be-6674-40ff-b94c-f1c9deaf87ae', '1ccdc4d7-6ba4-4ee5-aafd-4d45fa35d654'),
  -- FR Guillands (Paris) <- Guillands (2)
  ('ec255fe5-26d3-4bb1-b056-5252a3341c18', 'd811dd20-7223-4fe7-b9ac-e67b474a2b96'),
  -- FR Tranché du moulin (Sarreguemines) <- Tranché du Moulin
  ('9e314799-0552-4841-bef5-ba2d8f09e38b', 'fc1d494e-18ce-49a2-b44b-0b367a4212a9'),
  -- FR Fosse des Remparts (Strasbourg) <- Parc Fosse des Remparts
  ('fd5be4c2-110e-4ff8-8ea3-9316efa689cc', '1acdfabe-2817-40ac-8652-f8c33b133648'),
  -- FR Parc de l'Orangerie (cruising) (Strasbourg) <- Parc de l'Orangerie
  ('df592476-f9ef-4211-8e4c-91cc41dc16b6', 'acdaa980-6679-4d42-aecb-80cd841445bc'),
  -- FR Parc de la Citadelle (cruising) (Strasbourg) <- Parc de la Citadelle
  ('7a7f7646-0842-4d4f-a7ed-f2a1bf23abb4', 'bc58ba6b-464c-41e7-8367-631b4d17f1c5'),
  -- FR Ile du Ramier (Toulouse) <- l’île du Ramier
  ('77dbc55c-f47a-430f-9d8f-085eb81e73a5', 'fe2a64da-4402-46c3-8537-8313d4eec274'),
  -- FR Beach Ville aux dames (Tours) <- Plage de La Ville-aux-Dames | Parking Ile de Métairie - Ville aux Dames
  ('56059cb2-4437-4b8c-90e1-0dd5463a3e28', '0e66c6ef-ac9b-4798-9b18-6581f0952ab0'),
  ('56059cb2-4437-4b8c-90e1-0dd5463a3e28', 'aec173ca-37fe-4113-b3a2-12e10bb4d8e0'),
  -- FR Pointe de L'Espiguette (no city) <- L'Espiguette nudist beach
  ('c97e1bbb-fa60-4fe8-9213-13e95e961e47', 'a2069f2c-8c1d-4856-b65f-3da23456165c'),
  -- FR Serres de la Droude (no city) <- Serres de la Droude
  ('f7e2a6d7-c010-4477-b2b8-4db819a7e41b', '7c034026-5e93-4356-ba57-92c96766fc27'),
  -- GB Clowes Woods Whitstable-Canterbury (Canterbury) <- Clowes Woods Whitstable-Canterbury
  ('4541870e-0f1d-43ce-ad66-a135d537954a', 'f34517b9-588f-4e55-ba74-4cbd31451e05'),
  -- GB Bute Park (Cruising Area) (Cardiff) <- Bute Park
  ('30776b17-8dfa-4710-9330-be30247b62fb', '4fbf9ae7-b66a-4759-beca-5c57dfd89e33'),
  -- GB Old Road (Doncaster) <- Layby/old road airport
  ('718b0ea3-7f43-4126-aba7-84dd50e1d9c4', '0904204c-aef4-4885-b4cc-3fa08d8c76c5'),
  -- GB Kelvingrove Park (cruising) (Glasgow) <- Kelvingrove Park
  ('69be2afd-7fbc-4645-90e3-2d2aacdfdb23', 'fc7e2941-f5b6-40a3-8f02-69673fcfb22f'),
  -- GB Queen's Park (cruising) (Glasgow) <- Queen's Park
  ('70109146-5e1a-4967-abb4-5f39846bf185', '71d84361-119a-4463-b3e0-882c0a1407d2'),
  -- GB Shopping Centre Toilets (Hartlepool) <- Shopping Centre Toilets | Middleton Grange shopping centre
  ('41028e9e-0f30-4761-bae7-c16ef398b250', '36657bc5-f69c-47bb-b50b-b80338e13462'),
  ('41028e9e-0f30-4761-bae7-c16ef398b250', '56f2a955-c99d-401d-bf65-cf71c966b583'),
  -- GB Otterspool Promenade & Park (Liverpool) <- Otterspool
  ('3342e17c-8fd8-4bc8-8a24-82855fe0efcb', '0db68916-ee03-41cd-bcb8-89cbbc57b346'),
  -- GB Leazes Park (Newcastle upon Tyne) <- Leazes Park, Barrack Road, Newcastle
  ('1115085c-3355-4597-bf09-ee04863effe9', '5ec2de67-97ab-4161-afaf-e9605b475f2d'),
  -- GB Woods (no city) <- Woods behind High School
  ('ffa85efb-5522-4cdd-9e6c-485f04f8d0fb', 'bfc15386-744d-44f8-913b-c57e66331331'),
  -- IE Dollymount Strand Dunes (Dublin) <- Dollymount | Dollymount Causeway
  ('519adc68-98fc-46d1-b6b1-329ee3f35f15', '267bc9e0-8761-402c-844c-2f79f5bc0402'),
  ('519adc68-98fc-46d1-b6b1-329ee3f35f15', '6460f960-8358-4413-90e6-ca5dc1d7210c'),
  -- IE Phoenix Park in night (Dublin) <- Phoenix Park Military Road
  ('e9a26314-46aa-4648-968a-719ae080251f', '92f019ce-8f87-4643-9657-e1ab934b5968'),
  -- IE Santry Lodge & Park (Dublin) <- Santry Park - Parking Toilets
  ('5e6455a6-6600-4e79-b982-c644f6a9e849', '8a750494-0571-4068-8a04-69dc5ba5c01d'),
  -- IE Terryland forest park (Galway) <- Terryland Forest Park
  ('a446b3fd-7486-427e-9d8d-5e88cd4da6c3', '09b2e73e-a212-4608-a365-58ec4c0da8d1'),
  -- IE Courtown Woods (no city) <- Courtown woods-County Wexford-Gorey
  ('e94eff3e-97ef-4e85-9062-6c30bd0bf331', '231ac37a-ada5-4309-ba00-00ce47e1df12'),
  -- IE Vico Road Dalkey Swim Area (no city) <- Vico Bathing Beach Dalkey off Vico road Dalkey
  ('d66b5a70-f975-4a12-85d2-ef1b8adf76b1', 'bd9a2e29-fd97-428c-bc31-6876761376f7'),
  -- IT Petra Ruja (Alzachèna/Arzachena) <- Spiaggette di Petra Ruja
  ('01a49875-464e-425b-997f-50e272db6e35', '08215af4-aa62-4662-8ba5-850a9fbc0496'),
  -- IT Spiaggia di Caito / Simeto (Naturist & Cruising) (Catania) <- Spiaggia oasi del simeto
  ('90b87190-82f7-4d52-9e7d-cc8c64649121', 'aa3916ab-7516-4db2-bdf5-203bd373a908'),
  -- IT Parco delle Cascine (Florence) <- Parco delle Cascine
  ('f3328131-338f-4e9c-8497-e613c31d23fb', 'b3fc9310-346a-471d-ab8b-6b1509f2049d'),
  -- IT Lignano Pineta (Lignano Sabbiadoro) <- Spiaggia in Lignano Pineta
  ('4b29fdac-d115-41b6-adc4-e297308278cd', '7418cbca-ee1a-4ab2-912f-13cae2e05b56'),
  -- IT City Life (Milan) <- Piazza Tre Torri - City Life
  ('20148738-44cf-4718-a687-eb9d0e6f0b07', '2ad81f11-4471-4cd0-b3b6-b36a8006aac2'),
  -- IT Parcheggio (Padova) <- Parcheggio cruising via Messico
  ('3d1a9cd6-d76e-4b0f-815f-b984e2953f9f', '911ec7ba-5829-4d5e-9c07-27f1833d8be2'),
  -- IT Censured Club (Rome) <- Censured Club Roma Gay Cruising Bar
  ('993ee1fa-7c9a-467c-b36c-87f532385e9a', 'a9241171-310a-4755-b163-163a436cebe1'),
  -- IT Parco del Colle Oppio (Cruising) (Rome) <- Parque Coliseo
  ('686e2a3f-f030-4ea6-852a-cd5c2e335973', '8f419483-982d-4ca9-aee8-b8b5d42eee8d'),
  -- IT Villa Borghese — Galoppatoio (Rome) <- Tempio di Diana - Villa Borghese
  ('11d32954-3d7d-49bf-baa7-bf650658b355', 'e8dcfe0a-3fd2-4073-8128-0d56af517b13'),
  -- IT Capo Comino (dune) (Thiniscole/Siniscola) <- Spiaggia di Capo Comino
  ('1292c6da-b6e1-4c15-a7b5-0b2dfd72a0d9', '57a9685b-e2a9-4c47-9a77-a2ed3603313b'),
  -- IT Parco del Valentino (Turin) <- Giardino Roccioso Parco del. Valentino
  ('f946290e-f9ed-4cd3-be62-8177d0cdf0b0', '0fd428ad-d3f5-4339-8ce0-99d6f9fd59c9'),
  -- IT Parco della Pellerina (Turin) <- Bagni Pubblici Pellerina
  ('1376e332-787a-489b-9e8c-463a4c4fe45e', 'f4e8ff51-4e16-459f-b48a-4ddee8874d91'),
  -- IT Parcheggio (Varese) <- Parcheggio appartato
  ('28aa2ba8-8f8f-4ccc-a6c1-089cea037e83', 'ba3b5be9-cd04-4b31-81fe-5792bdad67b4'),
  -- IT Area Industriale (no city) <- Inizio zona industriale
  ('d2b255c5-adbb-4284-8adf-12ab8c592c35', 'f3c14497-8142-40e4-9ef2-b9b3ce0eece0'),
  -- IT Bagni Centro Commerciale (no city) <- Posteggio davanti al Centro Commerciale Il Centro
  ('473fc067-5859-42d8-aa3e-aad922646cb8', 'fffdef86-5774-4293-96af-4c4fd7b4cd31'),
  -- IT Biban (no city) <- Parcheggi Biban
  ('f4cb250f-5182-4c56-8b79-0f1889206398', '09d39a64-300f-46bc-b12c-39e51517b2b3'),
  -- IT Bosco a Lonato (no city) <- Bosco di Lonato - seconda zona
  ('de4d1070-c150-4af3-838b-6571ae9f6497', '4e8c9676-cfc2-42f8-9678-70d5f5f729a6'),
  -- IT Cimitero (no city) <- Bagni Cimitero
  ('f7abc883-f0d8-474b-a23c-a85b4b9e0c44', '85005782-3f78-4e10-ac8b-fe3f85415d44'),
  -- IT Crespi D'Adda (no city) <- Boschetto Crespi d'Adda
  ('46924d1b-ab0a-4e4f-882c-9222b8485875', '1de4cc34-0f05-463f-ac47-1f73821531df'),
  -- IT Fiume Gesso (no city) <- Lungo Fiume Gesso
  ('5d8775a2-980e-4ad9-9cfe-1e16766d1601', '5c443d4a-c348-49a2-a38a-b226393d38ce'),
  -- IT Località Bariola (no city) <- Località Bariola
  ('dd699515-99aa-4478-ba0b-e97a7e098751', '5ec5c7ab-979c-4fa4-b620-b72719108eea'),
  -- IT Paco Acquedotti Arco (no city) <- Parco degli Acquedotti
  ('a2006d23-eff1-4e52-be22-d2f505646ac1', 'b54484b1-3a88-46c6-a5b8-61f154fd8341'),
  -- IT Parco dei Fontanili (no city) <- Parco dei Fontanili
  ('9db08592-b429-4035-9c66-551faf70aff8', '8d18ef5f-38a9-4806-b97a-8ba62fb4efb2'),
  -- IT Parco dello storia (no city) <- Parco dello Storga
  ('e43985bf-ad5d-473c-9c46-ec0f0a356257', 'adb6ba31-0cd8-4d99-82bc-227cf35ae86e'),
  -- IT Ponte Tordino (no city) <- Foce Fiume Tordino
  ('b52d7028-be19-4a26-9e93-8aacd2738a88', '6b2cfe44-6022-47c6-ba03-2b62f2aa82f7'),
  -- IT Scalette terrapieno (no city) <- Scalette via la Vega
  ('9382cc5b-bdf5-49e3-b7b6-9abae6c9132f', '69522d2d-96a0-4e56-888c-3eb51d3d6b7a'),
  -- IT Spiaggia di Sa Punta e S'Arena (no city) <- Spiaggia tra Punta S'arena e Porto Paglia
  ('d0463306-ddfe-40df-b75a-9aea0195aeca', 'a3c19454-36fb-48a7-b8af-a91edb7f3f9d'),
  -- IT Strada sterrata (no city) <- Piccola area sterrata
  ('dfa46b75-5d6a-4d4e-b6a8-e768800dc48e', 'ca5b1119-1311-478a-8142-0bbdd240859a'),
  -- IT Union Lido Waschhaus W10 (no city) <- Union Lido Waschhaus wc 8
  ('788cf352-9673-4700-bb2f-4067ab997ff1', 'f713cc99-ba26-47c5-ba33-55ffe50198c3'),
  -- IT Vallere (no city) <- Vallere (Golf Club)
  ('ad4c5c81-8055-48a0-96a2-6c411806417f', 'dfc1d61b-3923-4e2b-ac22-0a9ff3711bd1'),
  -- LU Weimerskirch (Luxembourg) <- walking pad Weimerskich
  ('0c4d4aac-7bc8-4b4c-a2d2-71bcad7c8167', 'd86fc0ec-ae41-482e-8c30-a2c4eba714f2'),
  -- LU Dippach Parking (no city) <- Dippach-bertrange
  ('e30718db-bbff-4c12-828d-f4695bdf2278', '783fe848-e806-4afa-9c4e-fcabfb96a77f'),
  -- LU Fkk Remerschen (no city) <- BaggerWeiher Remerschen
  ('2c58b956-e788-45bc-a93b-d1575b1d9513', 'e954e564-5e58-43a1-8465-4ca03efdfead'),
  -- LU Kockelscheuer (no city) <- Kockelscheuer Cruising Area | Kockelscheuer entrée forêt
  ('f6a9b392-3fd1-4cf0-b0b2-a4f675b9d69e', '80b4b33d-0cff-4b98-be55-8cfe9853b5c9'),
  ('f6a9b392-3fd1-4cf0-b0b2-a4f675b9d69e', '4fec0445-5239-43d9-aa08-7bcdff4d2212'),
  -- LU Park Cloche d'Or (no city) <- Toilets shopping Center Cloche d’Or | Toilettes next to Hi-Fi at Cloche d’Or
  ('ee2c3f53-8f95-4180-bc39-e265257ff750', '123d0f5a-1e1d-4d53-a970-25f786359074'),
  ('ee2c3f53-8f95-4180-bc39-e265257ff750', 'fd9df8a5-e389-4fdf-9017-ef4c6e4073c3'),
  -- NL Dashorstdijk (Almere) <- Darshorstdijk
  ('d8d1b979-dabf-469a-94fc-00a77f9eeb29', 'e0d1812d-dbd3-42df-9718-745f0a449001'),
  -- NL Amsterdamse Bos (Amstelveen) <- Amsterdamse Bos | Naturist Zone Amsterdamse Bos | Parkeerplaats Amsterdamse Bos
  ('7f87ffe9-4224-4982-ac1f-985a914d3db8', '147df5c0-ce15-46fd-877f-dd38767c358d'),
  ('7f87ffe9-4224-4982-ac1f-985a914d3db8', 'efd503dc-0079-4dad-af43-343daf86f595'),
  ('7f87ffe9-4224-4982-ac1f-985a914d3db8', 'e27c0401-2a28-461f-8d59-8498361de2c3'),
  -- NL Drake's (Amsterdam) <- Drake’s Cruising
  ('cb557140-6e16-4f3a-9f24-3d29c9bcc64a', '0b9b2c7a-fdf8-4bdc-b52a-5600b134b43a'),
  -- NL Nieuwe Meer – Oeverlanden (Amsterdam) <- Park De Oeverlanden
  ('84ef5480-b866-4c31-9d45-3a06fa093b98', '4eb4317a-8254-4f11-97fe-739ab59ce943'),
  -- NL Plaza Schiphol (Amsterdam) <- Schiphol airport
  ('1b3444d2-0d01-4510-aaf8-aecf533c99ce', 'ab3795bd-fc07-4c37-aacf-a7a8560b238e'),
  -- NL Rembrandtpark (Amsterdam) <- Rembrandtpark-Nachtwachtlaan
  ('c77f92f5-43e7-4b46-a164-ae2fff7c43bb', '171c2590-f206-491f-814a-b419a517def1'),
  -- NL Presikhaaf Park (Arnhem) <- Geerfdenpark kant Presikhaaf | Geerfdenpark kant Presikhaaf tegen Snelweg
  ('0c4df3bb-3e1e-4e2f-970c-7282f5cdfe5b', 'c1c4bdfd-b1cc-4762-a299-2c452a20598b'),
  ('0c4df3bb-3e1e-4e2f-970c-7282f5cdfe5b', '9cd09cd8-9263-465c-a28b-ec9b55a9c179'),
  -- NL Azzurra (Beuningen) <- Sauna Azzura
  ('ab7c5dfc-b769-4508-b956-e634345ef3d7', 'ce15dead-4c63-4686-801c-e2d4e2ba015e'),
  -- NL Pikveld (Coevorden) <- Pikveld
  ('185afed1-ec32-484e-9dc9-ffc4b2708a27', '5fa6e6aa-60ae-4955-9e4a-1843da342f1a'),
  -- NL Hoornse Plas Cruising Area (Groningen) <- Hoornse Plas
  ('2087dc1d-ca35-4925-aa0b-232c90c44ecb', '5cd1ba9c-7f04-4aca-8706-0d794a756641'),
  -- NL Stadspark Cruising Area (Groningen) <- Stadspark parking place
  ('7773eb92-514e-4af4-bdd5-e1e7e0b2c4dc', '3f635402-a0a6-4e06-8706-111f7336f65c'),
  -- NL Bolwerk (Haarlem) <- Parque De Bolwerken
  ('9de72baf-a349-4beb-b402-f6a2f66ab3ab', '6519d45b-f288-4293-8b09-c00849b129c6'),
  -- NL Zandvoort strand en duinen (Haarlem) <- Gegenüber FKK Strand Zandvoort in den Dünen
  ('ed351976-0da8-42e4-a1a9-63653fd7d403', '130a4741-6001-4013-8801-27419296b1c1'),
  -- NL Spaarnwoude (Halfweg) <- Spaarnwouden
  ('07a0b451-25f8-4645-bf6e-35da9264c734', '4f860bed-adf6-460a-961a-62a7df925fcd'),
  -- NL Javali (Heerhugowaard) <- Sauna Javali
  ('9c436d4a-03ad-4907-a7b6-32a3be2bd4e1', 'c806323a-f279-48bc-b9bb-b59f2408b56c'),
  -- NL Waarderhout (Heerhugowaard) <- Waarderhout Beukenlaan
  ('bd80b98d-7dc1-46bb-9cf7-a2448402a7d2', '829238cb-89fd-4eff-b7ba-8acc097b576f'),
  -- NL Welterpark (Heerlen) <- Park Welten
  ('2977ebae-3bfb-421d-bb14-094a528bf5e5', '70adbee2-e1b0-449d-be1f-11ad5836c9dc'),
  -- NL Kanaal (Hengelo) <- Kanaaldijk, Jachthaven
  ('8cf56abf-86e5-4119-9a5e-090e298ab995', '3d7fee4c-bf99-4e99-a67c-0b2ffc92b5e3'),
  -- NL Groene Ster (Leeuwarden) <- Groenester
  ('a2e5f3a7-a22d-4449-9e5c-f955d58f88af', '63313939-81ae-4208-a0cf-eac596e65edd'),
  -- NL Leeuwarder Bos (Leeuwarden) <- Leeuwarden bos
  ('ca4a8cc4-f7f6-4add-b15b-fb6e2d71ce9b', 'a916375b-3279-4495-8477-fd6e68616cc0'),
  -- NL Venneperhout (Nieuw-Vennep) <- Venneperhout Vezuid
  ('3f17092f-36fb-4628-9b1b-304af0685c68', '21e577dc-5731-4574-a348-df32119fd74f'),
  -- NL Geluidswal (Nieuwegein) <- Geluidswall
  ('43337862-995d-4381-bc89-d68d5e0d407a', 'ddb84959-ef29-4832-94b3-b4ed58e543f8'),
  -- NL Laagraven (Nieuwegein) <- Laaggraven
  ('3deb21ad-f5ca-4209-bb3e-0799dd00c3a4', '1efd4314-a58a-4b2b-b383-99d6fa28c85d'),
  -- NL Balijbos (Pijnacker) <- Balijbos, bankje aan het water
  ('0f0ce0ee-58e5-4cd1-9523-5a712737b131', '235a0fae-886c-468b-8753-9b29a9976163'),
  -- NL Parkeerplaats Het Park (Rotterdam) <- Het Park (bij Euromast)
  ('e7ba634e-be7e-40ef-9c87-809ff2d25587', '808447be-1b40-4e86-9220-c6a9a11cd82e'),
  -- NL Zevenhuizenplas (Rotterdam) <- Zevenhuizerplas
  ('72fa6aa9-28e7-4c65-92e8-d03c648c658f', '9b0b287f-8803-4ae4-8ee7-b48b775c18c3'),
  -- NL Basis (Soest) <- Basis | Vliegbasis Soesterberg
  ('dc708190-fd1d-4822-abe5-549e0f10c307', '79685328-f861-4377-9078-25ffc29a99dd'),
  ('dc708190-fd1d-4822-abe5-549e0f10c307', 'e4c3d451-ba0d-4dc5-8e34-2e0a0a2be90f'),
  -- NL The Maze (The Hague) <- The Maze
  ('192684eb-71ab-4385-a49c-3e974a1b86b3', 'e22bac37-6179-46ba-94bf-eb971cf4ee4f'),
  -- NL Hogelandse Park (Cruising Area) (Utrecht) <- Hogelandsepark
  ('6fd71137-a207-4c82-a96f-389768d21947', 'a61ab260-f94d-41e2-b5e7-7ed3d1e20909'),
  -- NL Maarsseveense Plassen (Utrecht) <- Naaktstrandje Maarsseveens Plassen
  ('ce35b344-4417-40e5-9eda-fe19404111ed', 'faa19884-fe52-476f-b366-75dc2455b071'),
  -- NL Warffum Bos (Warffum) <- Warffumer bos
  ('0f4921d4-ea49-4b9d-a038-382ccb9f8c79', '0f33397b-4537-42a1-9d7a-8ccddcd0c2f4'),
  -- NL Bossen (Zeist) <- Bossen rond Warande | Bossen naast Rode flat
  ('11dd5683-bd07-48eb-bff4-a6c1411a4992', 'a755c87b-08fc-41a2-85a7-a70231e1c6e2'),
  ('11dd5683-bd07-48eb-bff4-a6c1411a4992', '708a7975-e413-420f-a54f-4191ce62f002'),
  -- NL Absbroek (no city) <- Absbroekbos
  ('6b4e48c1-5b1c-4f1e-9467-7fc64f959a05', '635f180c-c013-429f-93da-ad2e123d94fa'),
  -- NL Bosjes Wilhelminapark (no city) <- Parkeerterrein Wilhelminapark
  ('8233a9bc-db2a-457c-93bd-051da571f0e0', '035be333-5a5e-4e51-ac8b-386203c11bae'),
  -- NL De Lus (no city) <- De lus Centrum
  ('7ed7f9b2-f1cc-42fe-82e4-8d3ac08cb6bd', 'eea2a6fa-bd0a-4fa6-9ddd-78aa9af01980'),
  -- NL Geesterambacht (no city) <- Geestmarambacht | Parkeerplaats Geestmerambacht | Geestmerambacht Parkeerplaats De Zes Geerzen
  ('d6e42f14-0843-4272-b083-a81937eaf4b5', '05364b28-bae0-4b06-9754-e2f814acd878'),
  ('d6e42f14-0843-4272-b083-a81937eaf4b5', 'b372236c-f220-449e-a2ad-99679f80565d'),
  ('d6e42f14-0843-4272-b083-a81937eaf4b5', '170fe07b-4794-44a0-98be-8a52737cb57d'),
  -- NL Industrie (no city) <- Bos in industrie
  ('59d286c2-5754-4014-8934-94647a7859ff', '8269a345-5f8c-4465-9176-693a7f1b82b5'),
  -- NL Issabellagriend (no city) <- Naaktterrein Isabellagriend Herten (Roermond)
  ('cef67707-29de-41ae-afde-a287b0f93445', 'a79086eb-5ad1-4c26-a370-ede433f8e8ea'),
  -- NL Kelperbos (no city) <- Kelperbos
  ('d7479ba5-36f5-4136-92f8-70aab1dbdc34', '7ba3ff8b-7c02-4b1c-83f3-512bd16d42c3'),
  -- NL Ketenbaan (no city) <- Ketenbaan bij Bos & Co
  ('69abef29-c508-4548-b35b-8d6e263be3e8', 'f50865d4-f50c-465c-8420-6d305265c94a'),
  -- NL Mainroad, N34 (no city) <- Main road N34 near the petrol-station
  ('73d76e2a-6dcb-4a57-a583-ba30e697342a', 'a070248c-99f5-4207-adf0-d5b77bca746c'),
  -- NL Meer en Bos Park (no city) <- Meer en Bos bij Muurbloemweg
  ('5a4a9beb-2ec7-472a-bef8-6baf9b4d8528', 'b4e87569-91e2-4d50-9d27-01e0cf10f87b'),
  -- NL Naaktstrand Bergen (no city) <- Naaktstrand Bergen aan Zee
  ('2550149e-dc3a-408e-ac92-2f058aa3be76', 'af059953-1cfd-47b3-bc63-90c239cd0dca'),
  -- NL Oeverbos (no city) <- Het Oeverbos
  ('b558d171-9789-448a-998b-d9d96fb6c71c', 'b9be0cf7-98cc-40d9-be15-8e0921dd0359'),
  -- NL Parking Reek (no city) <- Parkeerplaats N277
  ('eac71260-2259-4dfe-81a3-e2d494df8ba7', 'd11c5468-55d4-416f-b20e-fed654fc7967'),
  -- NL Sluispad (no city) <- Sluispad 2 | Sluispad Noord
  ('f15354f4-d944-4482-abe5-58a9d03921b3', '67adc7bb-665a-4016-9dfd-a13d14580ead'),
  ('f15354f4-d944-4482-abe5-58a9d03921b3', '390c92e7-a583-4304-88ad-58888a5190f6'),
  -- NL Spaarnwoude (no city) <- Spaarnwoude | Spaarnwoude toiletten
  ('c03e20d5-d57b-434e-a287-a178082de817', '5f51c95e-2ee8-4346-b4f1-736bc3c274ea'),
  ('c03e20d5-d57b-434e-a287-a178082de817', '0802396b-0a41-4460-bb46-f8401adccfc4'),
  -- NL Strekdam Ritthem (no city) <- Naaktstrand Ritthem | Strandje bij Ritthem
  ('fb7609d8-17c4-475c-8f7c-d0f4613684bf', '2581e6f1-f450-46ec-8b68-9e46cfd08e6a'),
  ('fb7609d8-17c4-475c-8f7c-d0f4613684bf', '00910f65-0295-4e59-b93d-372a152c5ace'),
  -- NL Twiske (no city) <- Recreation area in Het Twiske
  ('dd72ba1f-fe17-4895-b9da-a57cbd2539cb', '74dbc52e-2c9f-4fd6-94ac-4b290841e46c'),
  -- NL Vlagheide (no city) <- Vlagheide 2
  ('a75694e6-dc76-46e7-9b64-e75d0cd1a397', 'b0dfc1a4-5d39-4f24-aa51-930cd7284247'),
  -- NL Vlietland (no city) <- Naturistenstrand Vlietland
  ('8313e405-65fa-478e-bbd6-fdd751ed6b6a', '624ce3b6-cc21-46f7-8714-75994893190f'),
  -- US The Fens (Back Bay Fens) (Boston) <- Fens Garden
  ('0db4a007-db97-4e47-a8a1-8f3a05782d10', 'd4d3580c-b863-4531-b9a5-db0c91b8df70'),
  -- US Mall of Georgia (Buford) <- Mall of Georgia, Dillard's men's bathroom | Mall of Georgia, JCPenney back lowest level bathroom
  ('2bb2120a-2ae7-4c60-98ff-ac0012496a6d', '810ae491-7f19-496a-8a79-231041ca21f1'),
  ('2bb2120a-2ae7-4c60-98ff-ac0012496a6d', 'ddadc32b-d245-41fe-bb97-53e707b0b267'),
  -- US Lake Storey (Galesburg) <- Lake Storey Parking
  ('aaeeefcc-2ffc-4548-84fe-79e35e961515', '0e201dd9-06c9-4510-a8a8-c34f18bc6e54'),
  -- US Cottonwood Pass (Las Vegas) <- Cottonwood Pass
  ('f40d0eed-41bc-42a0-b026-49766c39dd23', 'c9e1b351-f080-4005-91f5-398d796ec962'),
  -- US Pine Island Conservation Area (Merritt Island) <- Pine Island Conservation Area
  ('346fca71-9ff9-4c9c-add1-319469e6bfa9', 'f70aa0dd-8e44-4403-8df2-e898757ce984'),
  -- US Bernal Park Deck (Pleasanton) <- Bernal Park Rest Room
  ('b1caf678-d6f5-4814-ab06-fea427ac49ab', 'c79217ea-5432-41a6-8862-f673963f87da'),
  -- US Funderland Restrooms (Sacramento) <- Restrooms in Landpark Park | Land Park Restrooms WEST End
  ('0e991959-f7c0-4b87-ab9b-6d3189660ef0', '88d32911-76d6-4845-9bc3-d6686348757d'),
  ('0e991959-f7c0-4b87-ab9b-6d3189660ef0', '0313caee-1584-412e-8220-4979fb54881b'),
  -- US Coddingtown Mens Bathroom (Santa Rosa) <- 2nd Floor JCPenny Mens Bathroom
  ('14cc312d-ffe6-4389-b0bb-7da0df9fe7c0', '36bce837-9e41-419f-8b04-105a1a0d8b0d'),
  -- US Nay Aug Park (Scranton) <- Nay Aug Park, lower pavilion
  ('3bfa9a7e-46dd-48ba-8594-a4e3c428d973', '93c93ca4-03ec-47db-a6bc-c151b1419aac'),
  -- US Playalinda Beaches (Titusville) <- Playalinda Beach Lot 9 | Playalinda Beach Lot 6 | Playalinda Beach Lot 8 | Playalinda Beach Lot 4 | Playalinda Beach Lot 7 | Playalinda Beach Lot 5 | Playalinda Beach Lot 3 | Playalinda Beach Lot 2 | Playalinda Beach Lot 10 | Playalinda Beach Lot 11 | Playalinda Nude Beach Lot 13 | Playalinda Beach Eddie Creek
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', 'b71310fd-8870-4247-995b-eab1e87c678f'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', '8314978d-3652-4355-98ab-1622a8fd3122'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', '7c331adf-cdec-43a8-a99e-4885e6ec7155'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', 'efb9d8ed-229c-4b84-806b-83d442baf3f0'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', '1a56d636-1194-47e3-8fd1-bff0e4c66b55'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', '4b51b4dc-08ee-482e-ae49-310612ad56e2'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', 'ec46bd3d-bd66-4aff-a33a-965903cc3573'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', 'd1a9538b-3e93-4de1-a4b8-7ce685589fe4'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', '23fc7771-f1de-47ae-b77f-51698a906d31'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', '708a0ab5-8c6d-4d60-99b4-2a41445a6245'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', 'c1c09f6e-f49e-45b4-b045-3e55db1d613e'),
  ('acf2e2a9-b82f-4a69-85cc-7dd3bfa28320', '222d902f-0810-4a70-b63e-c202682cc4c9'),
  -- US Sand Point Park Mens Room (Titusville) <- Sand Point Park Bathroom Near Marina
  ('3466b5b6-b4bd-4d99-98cf-5e287e682f98', 'a08d4779-b5f8-4a31-816e-1245caba0d36'),
  -- US Chain of Lakes Park (no city) <- Chain of Lakes Men's Room Near Hospital
  ('7e86e98a-fcb0-455d-b6f8-51c09616fc48', 'cb5badd8-a444-48e4-af80-62799b1e6f12'),
  -- US Exit 5 Rest Area (no city) <- Exit 6 Rest Area
  ('5dffa5a8-ee8c-44de-8b87-58c3a6062c4e', '0448d735-da68-49ad-b845-dc6ade740ab6'),
  -- US Fox Lake (no city) <- Fox Lake Mens Room | Fox Lake Park Trails
  ('1c68ef91-2a8a-46f8-8d34-9758ed6e2be5', '46506c0d-7a82-4bf2-b32a-d04654408cb8'),
  ('1c68ef91-2a8a-46f8-8d34-9758ed6e2be5', 'e4f3d422-02c7-4f5b-ade3-2cbe7a5b11c4'),
  -- US Mud lake (no city) <- Mud Lake
  ('79859012-495c-42ee-b36a-b9afe83d8538', '621e6211-d992-457f-ad4a-18aebaec2235'),
  -- US Overlook dam (no city) <- Ledge over look dam overlook
  ('590b5494-a48d-4f6a-84b8-966d83e1cdc5', 'fb976907-6474-417b-b799-76371ecab414'),
  -- US Rolling Hills Park (no city) <- Rolling Hills Park
  ('a3426b83-69b7-4941-8c1b-1928e3f55626', '111831ea-9c70-4d27-9a1b-25d0b5a69387'),
  -- US Rt.80 East & West (no city) <- Rt.80 East Overlook
  ('7eabbd5b-0623-4c0a-92ef-c5f257f7357b', '84f7c976-3685-472a-8928-609e2cbf2ca3'),
  -- US Wuesthoff Park Trails (no city) <- Wuestoff multiple use trail | Wuestoff Mulituse Bike Trail
  ('f41fa0ea-054d-4edf-b038-effc0d74168a', '93fd98ab-6b44-4ccb-82cf-ee1e68b6df6d'),
  ('f41fa0ea-054d-4edf-b038-effc0d74168a', 'b61c1b0d-4e3e-44e3-8318-99552e0bdee9');

-- 1. Keeper names (guarded on the current name).
update public.venues set name = 'Rugen (Interlaken)' where id = 'bd63062f-7fca-47b4-8e54-8281422b0cfd' and name = 'Rugen';
update public.venues set name = 'Groot Schijn' where id = '1b46b582-8e87-48e0-88a2-043f6cfa3db4' and name = 'Grootschijn';
update public.venues set name = 'Gare de Charleroi-Sud' where id = '24c4eaf4-9515-4c2e-831c-3ff684ef9f54' and name = 'Gare';
update public.venues set name = 'Parco dello Storga' where id = 'e43985bf-ad5d-473c-9c46-ec0f0a356257' and name = 'Parco dello storia';
update public.venues set name = 'Geestmerambacht' where id = 'd6e42f14-0843-4272-b083-a81937eaf4b5' and name = 'Geesterambacht';

-- 2. Enrich keepers before the merge (fill-if-empty only; planet-randy's
--    translate.google.com wrappers are never copied).
update public.venues k
   set website = coalesce(nullif(btrim(k.website), ''), d.website),
       phone   = coalesce(nullif(btrim(k.phone), ''), d.phone),
       address = coalesce(nullif(btrim(k.address), ''), d.address)
  from (select distinct on (p.keep_id) p.keep_id, d.website, d.phone, d.address
          from _ms_pairs p join public.venues d on d.id = p.drop_id
         where d.duplicate_of_id is null
         order by p.keep_id, (nullif(btrim(d.website), '') is not null) desc) d
 where k.id = d.keep_id
   and ((nullif(btrim(k.website), '') is null and nullif(btrim(d.website), '') is not null
         and d.website not like 'https://translate.google.com/%')
     or (nullif(btrim(k.phone), '') is null and nullif(btrim(d.phone), '') is not null)
     or (nullif(btrim(k.address), '') is null and nullif(btrim(d.address), '') is not null));

-- 3. Merge, resolving both sides to their live terminal first.
create or replace function pg_temp.terminal(p uuid) returns uuid language plpgsql as $t$
declare v uuid := p; n uuid; i int := 0;
begin
  loop
    select duplicate_of_id into n from public.venues where id = v;
    exit when n is null or i > 20;
    v := n; i := i + 1;
  end loop;
  return v;
end
$t$;

do $merge$
declare
  r record;
  k uuid;
  d uuid;
  v_merged int := 0;
  v_skipped int := 0;
begin
  for r in select * from _ms_pairs loop
    k := pg_temp.terminal(r.keep_id);
    d := pg_temp.terminal(r.drop_id);
    if k = d then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform public._venue_merge_core(k, d, null);
    v_merged := v_merged + 1;
  end loop;
  raise notice 'multi-source cruising dedup: merged %, already together %', v_merged, v_skipped;
end
$merge$;

-- 4. Close open review rows for any two members of the same cluster.
update public.dedup_review_queue q
   set status = 'approved',
       reviewed_at = now(),
       reviewer_note = 'manual multi-source cruising dedup 99991791634999'
 where q.status = 'open'
   and q.entity_type = 'venue'
   and exists (select 1 from (select keep_id, keep_id m from _ms_pairs union select keep_id, drop_id from _ms_pairs) a
                 join (select keep_id, keep_id m from _ms_pairs union select keep_id, drop_id from _ms_pairs) b
                   on a.keep_id = b.keep_id
                where a.m = q.keep_id and b.m = q.drop_id);

-- 5. Postconditions: end state, not this file's own writes.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from _ms_pairs p
   where pg_temp.terminal(p.keep_id) is distinct from pg_temp.terminal(p.drop_id);
  if v_bad <> 0 then raise exception 'P1 failed: % pairs do not resolve to one venue', v_bad; end if;

  select count(*) into v_bad from (select distinct pg_temp.terminal(keep_id) t from _ms_pairs) s
    join public.venues v on v.id = s.t
   where v.duplicate_of_id is not null;
  if v_bad <> 0 then raise exception 'P2 failed: % survivors are not live', v_bad; end if;

  select count(*) into v_bad from _ms_pairs p
    join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id is not null
     and not exists (select 1 from public.venue_merge_audit a
                      where a.drop_id = p.drop_id and a.undone_at is null);
  if v_bad <> 0 then raise exception 'P3 failed: % merged drops have no live audit row', v_bad; end if;

  -- P4: opposite motorway directions are different rest areas and must survive.
  select count(*) into v_bad from public.venues
   where name in ('Rastplatz Baltenswil Süd', 'Rastplatz Baltenswil Nord') and duplicate_of_id is null;
  if v_bad <> 2 then raise exception 'P4 failed: Baltenswil Nord / Süd must stay separate (% live)', v_bad; end if;
end
$verify$;
