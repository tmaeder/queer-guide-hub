-- Germany cruising-venue dedup (2026-10-10).
--
-- The 2026-10-05 cruising-directory imports (gays-cruising, planet-randy,
-- gayout) overlap heavily, and planet-randy translates place names into
-- English ("Flap at the Maschsee" = "Klappe am Maschsee", "People's Park
-- Hasenheide" = "Volkspark Hasenheide", "Parking lot Wachenburg" =
-- "Parkplatz Wachenburg"), so the nightly dedup_truth_sweep never pairs them.
--
-- Method: every pair of live German category='cruising' venues within 1.5 km
-- whose names agree after a German/English normalisation (312 candidate
-- pairs) was read by hand: 174 were judged the same place, 90 different,
-- 40 unsure. The site owner then asked for the unsure ones to be merged as
-- well except XtraJOY / Beate Uhse Augsburg (two shops at Stuttgarter Str. 23),
-- so 208 drops in 180 clusters are listed below. The 90 "different" pairs are
-- NOT touched (different U-Bahn stations, opposite motorway directions, two
-- shops in one street, castle vs cathedral square). Bremen is handled in
-- 99991791576009.
--
-- _venue_merge_core copies no fields; every merge is stamped schema:1 and is
-- reversible with unmerge_venues(audit_id). Where the best-scored keeper
-- carried a typo or a bare generic name, a better-named sibling was kept and
-- eight keepers get a German name.
--
-- Soft on preconditions (a pair already merged elsewhere is skipped), hard on
-- postconditions.

set local statement_timeout = '300s';

create temp table _de_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _de_pairs values
  -- Rastplatz am Tunnel (Aachen) <- Rastplatz am Tunnel 2 | Parking lot Am Tunnel
  ('3ab71cf4-eaef-4aea-b1b3-657e8ee7152b', '9030a511-af37-4f21-886a-044f337ae152'),
  ('3ab71cf4-eaef-4aea-b1b3-657e8ee7152b', '3b88e6fb-f14c-4e09-b3b7-d32e9d719b5e'),
  -- Novum Andernach (Andernach) <- Novum
  ('00641799-2957-44bf-bc60-dd9eb30d9fd2', '60c34267-7767-4239-ada1-f17c79e0c238'),
  -- Inkognito (Augsburg) <- Incognito
  ('b023d15b-0104-4557-bed6-8780652c7d42', '230c2994-634d-48dc-989a-28f64c4cdd90'),
  -- Waldseeparkplatz (Bad Rappenau) <- Waldparkplatz
  ('0de50d95-70f7-4d2d-83e0-6e13d9e44145', '10c38bc5-1f80-4aa4-8d9a-5d9c36fdef19'),
  -- P&R Aichelberg A8 (Bad Wildbad) <- Vor dem Aichelberg
  ('1b968159-946f-49e6-8564-cd162d04e454', '5933ff8f-048a-4915-8311-3c5060bffe08'),
  -- Festspielhaus Toilette (Bayreuth) <- Festspielen und Autorastätte | Flap at the Festspielhaus
  ('8168e50a-0a27-41ea-8b24-4e75ef5861fd', '6105a90a-34d6-4c97-877a-10f402492673'),
  ('8168e50a-0a27-41ea-8b24-4e75ef5861fd', '5c9f57e7-abce-4db3-aa00-6acb137e44c1'),
  -- Lustheide (Bergisch Gladbach) <- Parking lot Lustheide
  ('06c768b6-b022-4efb-9096-c5aa313a48e6', 'f1c8cc33-2b03-4e03-8f28-902ce28a1036'),
  -- Arkenberge (Berlin) <- Arkenberg quarry pond
  ('5434ef91-5600-45e7-817f-b7f5a04c9634', 'b2ece09e-3d8a-4bbb-a264-db83f41b8066'),
  -- Hasenheide (Gay Cruising Area) (Berlin) <- Volkspark Hasenheide | People's Park Hasenheide
  ('dcd5a4c0-c22e-41f7-a712-3b5a3e7bfc51', 'e81e1084-19ae-4b2d-936d-2277d38a3d6f'),
  ('dcd5a4c0-c22e-41f7-a712-3b5a3e7bfc51', '386eaa56-b327-4708-a2e5-fc6eeb807358'),
  -- Müggelsee (Berlin) <- Lido Müggelsee
  ('b6436607-1197-4e3b-a11b-08971b6d5686', '8ffbadb4-bd8f-4ab3-9cef-a9ae6fde91e1'),
  -- Parking lot Grunewald (Berlin) <- Grundewald
  ('32ecf4a7-88c8-4790-a216-5dc16e3c4e44', '20c4cc46-3f07-4fef-8c75-3f91a2933f77'),
  -- Parkplatz Waldeck (Berlin) <- Parking lot A117 Waldeck West
  ('3b7db126-604c-4773-8400-9cd55b8b0342', '5ad0cd3f-0872-4c19-9d3b-b9f0b09540bb'),
  -- Schäfersee (Berlin) <- Flap Am Schäfersee
  ('8c5e29b4-c280-445f-a5e0-90ffc5b88e75', 'cb63b6ba-859c-41ac-b3c8-2028ce5cd511'),
  -- Tiergarten (Berlin) <- Tiergarten (Gay Cruising Area) | Tiergarten Faulersee | Tiegarten | Tiergarten Berlin | Berlin Tiergarten
  ('811324dd-7155-4a4a-b7bc-cacf2ccaf705', '686dcb52-42b9-4ae5-aa7f-5923f2f49139'),
  ('811324dd-7155-4a4a-b7bc-cacf2ccaf705', 'f11a8a09-adda-4e45-acbe-a0fbba8c7f3e'),
  ('811324dd-7155-4a4a-b7bc-cacf2ccaf705', '9ec42382-d25d-451c-8866-e8f91a53d999'),
  ('811324dd-7155-4a4a-b7bc-cacf2ccaf705', '40ac4db2-4650-4e44-a527-4c4e1602acea'),
  ('811324dd-7155-4a4a-b7bc-cacf2ccaf705', 'aee9e48f-73d2-45ce-a826-1481cb8a085a'),
  -- Treptower Park Sternwartenwiese (Berlin) <- Treptower Park
  ('8a353920-74c2-4a4e-8c03-e881cbb5d1d6', '1f087ae4-a49d-43f2-a951-c699651bd009'),
  -- Volkspark Friedrichshain (Gay Cruising Area) (Berlin) <- Volkspark Friedrichshain | People's Park Friedrichshain
  ('ab6cf953-047a-4803-9ab6-ec062048f07d', '83a2c261-231e-451c-9f28-1b32aadd4acc'),
  ('ab6cf953-047a-4803-9ab6-ec062048f07d', '17f3fc90-fc8d-4375-999a-7b5b0c5c06d0'),
  -- Volkspark Prenzlauer Berg (Berlin) <- People's Park Prenzlauer Berg
  ('134c3ff8-1d94-4f01-b950-8ac497344197', 'a849ffe9-25c3-4d29-9714-9a243acc2b03'),
  -- Pendlerparkplatz Am Togdrang (Bielefeld) <- Hiker parking Togdrang
  ('e09302ea-553a-49b1-8dbf-9f6c21ee1a17', '5915fe28-b130-401f-aff8-a4fc95552e10'),
  -- Erotic World (Bocholt) <- Erotik World
  ('bc2f5871-5fe5-4458-9085-e1552dcb76f0', '86e990a1-7ee0-4537-8372-9a0e89a29ef1'),
  -- Klappe Marktplatz (Bochum) <- Marketplace flap
  ('6711a961-8dab-4421-8f79-acc32f0d7337', '70cba5b3-613e-4624-9e71-390f2f11a45f'),
  -- Kortumpark (Bochum) <- Kortumpark Bochum
  ('aaa3f7e6-1e41-4890-83c5-2d7637fdeacb', 'ebaaf4e2-5d6b-4fa5-8eb3-04c8c6a64745'),
  -- Parkplatz heidesee Bottrop (Bottrop) <- Parkplatz Heidesee
  ('427e891a-9fcd-409a-9e12-90e428ba3b12', '9d8628a9-887e-4f8a-b99d-63248c774c3f'),
  -- Dolly Buster Centre Braunschweig (Braunschweig) <- Dolly Buster Center
  ('7a4f591a-4919-43aa-b34f-36c8e9e0045b', '36582ba1-7453-4d8e-9385-cf2e7b165acb'),
  -- Rastplatz Wüstenbrand (Chemnitz) <- Wüstenbrand | Forest parking lot Wüstenbrand
  ('9dee0e1b-a551-4ec5-8af8-28b24db0a858', '296baa26-91ec-42be-bf03-906312388b67'),
  ('9dee0e1b-a551-4ec5-8af8-28b24db0a858', '573a1fd3-8b66-470f-bf1b-5e3dc33a642b'),
  -- Aachener Weiher (Cruising) (Cologne) <- Aachener Weiher | Aachen pond
  ('1f1a1274-3552-4025-be92-67f85af01af8', 'f969cfb9-0507-4855-a59b-8a3d81584f34'),
  ('1f1a1274-3552-4025-be92-67f85af01af8', 'cd3e8525-e348-4a34-b441-eb297d22acf6'),
  -- Erotic-Studio 13 (Cologne) <- Erotic Shop 13 Cologne
  ('316d573a-5359-4fbd-947d-01f49ec61a7e', '7c1fefa9-71e5-4af8-b154-54438de66917'),
  -- FKK am Kiesgrubensee Gremberhoven (Cologne) <- Gravel pit lake Gremberghoven
  ('3275f370-1b35-4064-9939-d71b8c059e0d', '8eace11c-c254-49b8-b709-dad670db2257'),
  -- Sachsendorfer Badesee (Cottbus) <- Sachsendorf swimming lake
  ('2468cdd4-7680-46c0-b7ad-fe64a355f6bc', '64bc1266-fdd3-4026-931c-d5fffb41cfae'),
  -- Bessungen (Darmstadt) <- Bessungen 3 | Bessungen 2
  ('97f78357-327c-4f7a-b8ac-2e48db4d89cc', 'e538e8c3-09d5-452a-b97c-97f847511f24'),
  ('97f78357-327c-4f7a-b8ac-2e48db4d89cc', 'ca70a278-5b12-41e2-91b5-4b9395b38562'),
  -- A45 Autobahnparkplatz Mausegatt (Dortmund) <- Mausegatt seam parking lot
  ('1283ee05-4d32-43e0-bddf-45bb6c8a936e', '889c63e2-0c16-49eb-bedc-0abc33012bad'),
  -- P+R Eichlinghofen (Dortmund) <- Parking lot Eichlinghofen
  ('9fd0ad78-e2f3-44e6-9263-cf21901e877e', 'cd4ecd5d-8344-47c2-884e-ed1315673026'),
  -- Rastplatz Westerfilde A45 (Dortmund) <- Rest area Westerfilde
  ('2782a1e8-cc54-4da7-a80c-8aca1d6f9c81', '63377c60-3b7c-4867-862a-6748107b24d5'),
  -- Stausee Oberwartha (Dresden) <- Reservoir Oberwartha
  ('a6e53e39-9562-4ee8-8c20-b1b5ecf3d548', 'cd036727-015c-4b3e-bb0f-c7b4f873d767'),
  -- Angermunder See (Düsseldorf) <- Angermund lake
  ('8c4570df-8b3f-405b-845c-bc403a7eb3de', 'ed57f969-ccb9-41f9-9aaa-f9494bf38dcf'),
  -- Parkplatz, Kalkumer Schlossallee (Düsseldorf) <- Parking Kalkumer Schlossallee
  ('0d971b35-7241-4627-818e-7035fe095171', '51149cb1-533f-4555-9c86-5a12061629e4'),
  -- Rheinufer Fleher Brücke (Düsseldorf) <- Fleher Brücke Uedesheim | Rheinufer Fleher Brücke / Uedesheim
  ('223ab1b8-6aa2-4f4c-b71d-38d52bae4250', '971e943f-67b6-40e4-833b-edbc3c5541db'),
  ('223ab1b8-6aa2-4f4c-b71d-38d52bae4250', 'f56460d0-72ea-4b08-ad69-3ca73630930d'),
  -- Silbersee Ratingen (Düsseldorf) <- Silver lake Ratingen
  ('b6442bc3-2028-4027-842c-b72d30e31e9c', '574f20cf-6897-4552-9ce5-6037c29dddad'),
  -- Uedesheimer Rheinbogen (Düsseldorf) <- Uedesheim Rhine Arch
  ('390cef15-9e9e-4eb9-875d-32a916d53a70', '8bad4870-87b5-4220-bef5-89367b4c98e0'),
  -- Rheinbrücke (Emmerich on the Rhine) <- Reinbrug
  ('2534a183-a98a-4d40-a644-7f5658c9a604', '21c71db5-d323-49ac-a300-4f45a1073225'),
  -- Pleasure Shop und Kino Erfurt (Erfurt) <- Pleasure erotic Erfurt
  ('19662e7d-e0ce-44ec-9c34-f60ec0f21f23', '5063d4f2-6c95-468b-a6b4-2b2bb477b456'),
  -- Stadtpark (Erfurt) <- City park Erfurt
  ('bd134b25-50af-465e-b0a1-031fcf9f8052', 'd1d56151-a7b7-44fe-b3bd-476165ccff56'),
  -- Frankfurt Central Station (Frankfurt am Main) <- Hauptbahnhof
  ('03ea5c92-5b0d-4611-bbe5-6fabb8d67cee', 'a45e8cef-b71c-465e-a3bb-4cda438ea35e'),
  -- Grüneburgpark (Cruising) (Frankfurt am Main) <- Grünberger Park
  ('879ca551-44d2-4cce-b2a6-6814ac8ddb23', '900702d5-ac3d-41b3-88fc-78a1e15bb6ff'),
  -- Colombipark (Freiburg) <- Öffentliche Toilette Colombipark | Toilette Cruising
  ('9f1654a2-7c00-403b-9852-e3beebda404c', '8c50bb99-f0e6-49d7-b761-02885be8944a'),
  ('9f1654a2-7c00-403b-9852-e3beebda404c', 'eb0c7312-b4ce-4010-a50f-01d8338b8079'),
  -- Opfinger See (FKK / Ferkelwiese) (Freiburg) <- Opfinger See | Lake Opfingen
  ('d476a98e-93d7-44d8-aff6-efb7445b7b35', 'c5b3f4ab-d00f-4e80-830f-cc9dc99ddfd5'),
  ('d476a98e-93d7-44d8-aff6-efb7445b7b35', '9fd404a8-1fed-41ba-a580-67dcf0ab491a'),
  -- Parkplatz vor Ausfahrt Eltersdorf (Fürth) <- Parking lot Eltersdorf
  ('b3971b37-081c-4ffc-ad19-18b9fb2e9b69', '7346e224-ee3f-4642-a46e-b0ed1295663b'),
  -- Bulmker Park (Gelsenkirchen) <- Bulmker Park
  ('12fc3f7a-b487-4f50-b1a4-f7e77a183061', '1d863be3-bd98-4d42-bbfd-2775f9bf599e'),
  -- Parkplatz Resser Mark A2 Fahrtrichtung Dortmund (Gelsenkirchen) <- Parking lot Resser Mark
  ('3e52c656-8d2e-4667-a1bb-e0d9f59d304c', '6267d9e7-d6b6-4b5d-86a5-6693ee57ccab'),
  -- Parkplatz A480 Silbersee (Giessen) <- Parking lot Silver Lake
  ('b867b478-f488-4d1a-9f58-dbf910fc59a9', 'ed8acf02-b7d3-4cf7-9ab9-25399aebe3f3'),
  -- Oberhofenpark (Göppingen) <- Oberhofenpark/Oberhofenkirche
  ('48a16732-5ce3-49a2-916b-a8ffc57d0980', '2b9e3945-e2c6-41cb-a114-85758412660f'),
  -- Flötengraben Grone Industriegebiet (Göttingen) <- Grone West Industriegebiet
  ('6d5e55ec-fdbe-4d5f-8cba-fab83767581a', '9bbf1881-da15-4ad2-8a6b-19a17b411506'),
  -- Kanal Halle (Halle Saale) <- Am Kanal | Kanal
  ('b9605041-0943-4016-8211-edfa83ce1048', 'f1384fa0-5cdb-496c-84f7-c2d744bd58a4'),
  ('b9605041-0943-4016-8211-edfa83ce1048', 'ff799125-2acc-4cd1-8e6d-667d2ed0e37b'),
  -- Jacobipark, gleich hinter der Kirche (Hamburg) <- Jacobipark
  ('6effa1a0-09ce-4642-bd48-462912237f7e', 'f226dbf1-0b30-47a1-9da1-a9fa7bcf90a0'),
  -- Parkplatz Boberger Dünen (Hamburg) <- Boberger Dünen | Lake Boberg
  ('414efbfd-363f-4518-80ad-f5dd7b347e76', 'b1c270e5-ec83-45c2-a899-085f965b155b'),
  ('414efbfd-363f-4518-80ad-f5dd7b347e76', '3d748c06-9355-4a8f-a2f1-793ec6d1f6b6'),
  -- Planten un Blomen (Hamburg) <- Planten un Blomen
  ('9f38b62f-1ad1-4642-ad66-e4cc54d79e85', '56e5b79e-973c-4112-9eca-662d50d18490'),
  -- Pornokino Kools Harburg (Hamburg) <- Kools Hamburg
  ('1f7e4b3e-3a8c-453d-b5c8-78805e166197', '9de4636a-2ca4-45fd-bf02-c0f8d65dd407'),
  -- Stadtpark (Blindengarten) (Hamburg) <- City park - garden for the blind
  ('e0a2377f-140f-4ef3-ac49-663839ffc8f3', '9a544f38-2458-46a9-8c8e-8511c8e48ffe'),
  -- Volkspark Bahrenfeld (Hamburg) <- Volkspark | Lake Bahrenfeld | People's Park
  ('d952445e-88d7-4610-bd08-342e0346cdd6', '404da0f2-fd11-456c-84da-998c069aafb3'),
  ('d952445e-88d7-4610-bd08-342e0346cdd6', '8155e896-af2b-404f-93f1-16db2405a959'),
  ('d952445e-88d7-4610-bd08-342e0346cdd6', 'cfb2edde-5e9f-4744-b3b3-cb8d3bcea75d'),
  -- Rastplatz A1 (Hamm) <- Rest area An Der Landwehr
  ('0371b8a9-b98d-4173-ba0b-1de707ffd121', '74c7ff71-5323-44b2-bf4d-7fdbcf9a2b4c'),
  -- Bullenwiese (Hanover) <- Bullenwiese - Ricklinger gravel ponds
  ('17bdced1-4c6f-48e2-ab9e-a73916df02c7', '1eb21000-15f5-4bbb-a543-3bde332c66d9'),
  -- Eilenriede (Georgengarten edge) (Hanover) <- Eilenriede city forest
  ('df42c5f7-a4d5-4feb-a984-6a4a9f81d7d6', 'b2212131-1e59-4564-907f-6395f911d275'),
  -- Klappe Stadtfriedhof Stöcken (Hanover) <- Flap at the city cemetery Stöcken
  ('c2889a82-b3b7-4c2d-b462-e868e2c9b7e8', 'cc62486b-787f-4235-831f-385b176361bc'),
  -- Klappe am Maschsee (Hanover) <- Flap at the Maschsee
  ('688f13be-1a09-4f19-8ca5-bdd9ee069074', '4827da3a-f5c6-4727-93a0-410d2716e43a'),
  -- Schulenburger Sudsee (Hanover) <- Schulenburg South Lake
  ('0cda0852-187f-4efd-9b2e-1f4747e4f6eb', 'bf1ab3c1-d762-462c-a1d4-089754a460f3'),
  -- Sex-Point (Hanover) <- Sex Point Hanover
  ('e11f7a48-d798-4ffa-ae95-6dc4b1e92c04', 'ad0622e3-7d2b-45ce-a881-1be186887fce'),
  -- Baggersee Feilenmoos/Forstwiesen (Ingolstadt) <- Fkk weiher feilenmoos | Feilenmoos | Forstwiesen
  ('1cf56310-30d2-454d-8007-41cbc3e4cb78', '9ad3458d-a5ad-42d2-b3b8-58ee974b7603'),
  ('1cf56310-30d2-454d-8007-41cbc3e4cb78', '11f8d929-49d1-401c-a93d-1ec414bac892'),
  ('1cf56310-30d2-454d-8007-41cbc3e4cb78', 'de935a4b-149b-42a4-924b-5a4c20545184'),
  -- Erotikmarkt A9 (Ingolstadt) <- Erotic market Ingolstadt
  ('618049a5-5067-4169-a7e1-088e4092b356', '1988c294-5e87-40b5-b392-576d5d710dc0'),
  -- Paradiespark (Jena) <- Paradise Park
  ('0c890dcf-fb58-48e6-a142-0071a7ae6682', '299c985e-c89d-4599-b25b-10e8abc94d4d'),
  -- Parkplatz Vogelwoog (Kaiserslautern) <- Parking lot Vogelwoog
  ('54bcb05f-f82a-4929-93ce-9999e5ec3bfd', '9924c74e-49b2-4c54-9171-77fd21e090f3'),
  -- Nymphengarten (Karlsruhe) <- Nympfengarten | Nymph Garden
  ('b6a9dd5c-d178-4be1-ab29-9e44e843e7bd', '30e261a2-48ad-4abe-b447-88c9fded7c5d'),
  ('b6a9dd5c-d178-4be1-ab29-9e44e843e7bd', '6d15b6aa-c133-42cc-a258-547c519c9f9f'),
  -- Erotik Shop No 1 (Kassel) <- Erotic Shop No. 1
  ('07003712-0e85-4f42-a93f-f52d2d61fc16', '3bec9e14-7667-44b1-ac84-72335c4f59cd'),
  -- Pleasureshop Kassel Centrum (Kassel) <- Pleasure Erotic Kassel
  ('6e863aa7-88f1-4005-9b0f-b6e5b7516e2e', 'c96f9726-3319-4adb-8eb8-485471b58f4d'),
  -- Koblenz main station (Koblenz) <- Hoblenz HBF
  ('d9bf661f-a3fb-4032-9c16-6e77bd554271', 'a36ca6d8-9afa-4948-8ab2-d47c18d7e128'),
  -- A57 Rastplatz Geismühle (Krefeld) <- Service area Geismühle
  ('8405b1e5-e0c4-4c3b-938a-61df95ff284a', 'a4b016b4-2c6a-4347-b2f9-c786888469c5'),
  -- Elfrather See (Krefeld) <- Lake Elfrath
  ('b9da6759-ec8f-4148-a4b9-48c64833bd7c', 'cc98d4c3-e70c-4098-95df-d0e245d3d45b'),
  -- Clara-Zetkin-Park (Leipzig) <- Clara Park | Clara Zetkin Park
  ('80ea13d0-b618-445a-b07f-f01c313262fb', '661e2404-b1b9-43ac-9d4a-3072bc6e64b8'),
  ('80ea13d0-b618-445a-b07f-f01c313262fb', '2438289c-eaf7-4988-b1ab-cad4ee28e4f0'),
  -- Dolly Buster Leipzig (Leipzig) <- Dolly Buster Eroticworld
  ('4ddc1359-d4a6-49c7-81d5-f2df5980d4b3', '64a1fd8d-97e8-4267-863c-adc670b71950'),
  -- Parkplatz Brikenwald A14 (Leipzig) <- Parking lot birch forest
  ('86c53508-5609-4568-b288-1cb5ce4bf6e8', '650d52e8-78a4-4717-9b40-d5b49a3ccf71'),
  -- Stünzer Park (Leipzig) <- Stünz pond
  ('300c6ac2-44ae-4630-97b3-0d3bf07a828e', '9cf41943-e6d6-4ac5-a2c7-1bc544e3aae2'),
  -- Rastplatz Alten Hau (Liblar) <- Rest area Am Alten Hau
  ('25ac7a54-5e0c-4327-8643-46b1d14e2fc7', '52766a13-6957-4bbb-b818-fe9fcb93215d'),
  -- Planet X Sexkino Ludwigshafen (Ludwigshafen) <- Planet X Ludwigshafen
  ('36a22178-66ce-4b49-b853-161f1a7a0c06', '14fb6f95-aab7-4b2a-acc7-e4b650dca42f'),
  -- Parkplatz Lohmühle (Lübeck) <- Parking lot Lohmühle
  ('7e1323ee-ac02-4dda-ba66-c90c5aefe90d', '8206af7b-4a6d-4a91-828b-8fb2b4fe358f'),
  -- Parkplatz Seeretzerfeld (Lübeck) <- Famila Parkplatz/Seeretz
  ('f1180019-5a3d-4eff-91ea-332ef981f6bf', 'b680af93-f448-4292-8fd9-d0b0a73920ca'),
  -- Barlebener See 2 (Magdeburg) <- Lake Barleben II
  ('5ad67f47-79fb-443d-a91f-4737554d43ce', '275df801-dfeb-47b1-bd4f-f71029129226'),
  -- Beate Uhse (Mainz) <- Beate Uhse Wiesbaden
  ('022887ff-86e4-470e-a1a4-f1ca1b3ce8c2', '1e44a36f-e624-4111-87ec-9a9ece1e4777'),
  -- Parkplatz Geiseltal (Merseburg) <- Parking lot Geiseltal
  ('3ddcc366-126a-4ce2-b7c6-8968005840cc', '38eada81-b76a-4701-88e8-33c76eff3c09'),
  -- Duplexx München (Munich) <- Duplexx
  ('adb98709-1365-476b-a899-c682ca41eea5', '045a982b-44c1-4265-b509-a8be506acb94'),
  -- Erotixx (Munich) <- Erotixx Munich East
  ('2fa99e79-004b-41c2-929d-c9a4468e7a6e', 'f20986aa-c463-4c96-973f-72f7c26be363'),
  -- Flaucher (Isar River Cruising) (Munich) <- Flaucher Kiesbänke | Flaucher Islands Müchnen
  ('26e183d2-b0d9-4cb0-aef7-66674218f213', '9932ddff-7be9-4475-a481-1729dac0106f'),
  ('26e183d2-b0d9-4cb0-aef7-66674218f213', 'f135215d-bfe7-4b24-aa63-4ed1db9fd9e8'),
  -- Ost Park (Munich) <- East Park
  ('311b7078-e67f-43b5-bec5-1103270b9c35', 'd17d92b0-2a35-462c-a5d3-898eac9babeb'),
  -- A1 rest area Münsterland (Münster) <- Rastplatz
  ('10bdd6cf-dd86-465b-a041-f82e823f2bdc', 'f31199f3-795d-4699-9b77-20d8172cb659'),
  -- Forstweiherwäldchen (Nürnberg) <- Forest pond
  ('bc930c1f-264e-41da-8046-d8b6d1d64dc7', 'cf6b1f54-38db-411c-aff6-05ebdc01c1ca'),
  -- Stadtpark (Nürnberg) <- City Park Nuremberg
  ('7b92a98d-ab34-4ff8-bbd5-20cabab2ab57', '17c57c07-3270-4c2b-bd7b-345b68749691'),
  -- Tullnau Park (Nürnberg) <- Tullnaupark
  ('118aa8fa-d0c7-4b70-91d5-4eb6819d9bc9', 'fdff75cc-4088-47b0-a2a3-11503ad0f408'),
  -- U2 Röthenbach (Nürnberg) <- Flap at the Röthenbach
  ('f91ac117-f465-4c71-a1a7-c2886e65e864', 'f07114b9-18be-450f-b57e-941b89176084'),
  -- Parkplatz Flugplatz Oerlinghausen (Oerlinghausen) <- Flugplatz Oerlinghausen
  ('1b50e648-bcd4-469e-9b2f-51c7db46663e', '00028805-c314-45ac-b87b-f051c28cceb2'),
  -- Blankenburger See (Oldenburg) (Oldenburg) <- Lake Blankenburg
  ('242f77c9-76cd-4636-9e92-6b1791c95488', '8e6b77c0-c93a-4b51-982b-b043c3059025'),
  -- Hilter / Wellendorf (Osnabrück) <- Hilter - Waldstück am A33
  ('0239288d-6572-44ed-bb23-6fdadb86de28', '680d3ce4-f914-4a4f-9973-e6d1313adb0c'),
  -- Lippe See (Paderborn) <- Lippesee Autobahn Parkplatz | Parking lot Lippesee - West
  ('e1e7fdae-a01e-4024-92b3-0e9dd6af61c8', '4dc69e63-4b5a-4d1d-9a3d-99b758fd8d5d'),
  ('e1e7fdae-a01e-4024-92b3-0e9dd6af61c8', 'd3bc7c11-694a-405d-be5b-543ce94b455f'),
  -- Novum Pornokino (Paderborn) <- Novum Paderborn
  ('40c9831b-f2e6-4b64-95ce-6145da2eee81', '19ec0a26-b99e-4123-a86f-4770ac6fb396'),
  -- Fkk Badesee Mittich (Passau) <- Mittich nudist lake
  ('0f03d272-4a1e-4ed8-b0bc-217276ac4f0c', '1c79f6f2-e837-4b93-91bb-aa7f7d0e4c78'),
  -- An der weser unter der A2 in holtrup (Porta Westfalica) <- Holtrup
  ('40989141-8903-49da-8852-f47c7d1f21d6', '21a0b6ed-4fad-41c4-afba-c4a680fb8ea5'),
  -- Eroticats(Sexshop und Kino) (Potsdam) <- Eroticats Potsdam
  ('9ec7ac2a-2f7b-4bd6-b5a1-5d71993d708e', '855d2c93-56f8-486a-aa12-f9754514cd8f'),
  -- Rastplatz Am Stern (Potsdam) <- Rastplatz Parforceheide/Stern | Rest area at the star
  ('27dc3dd7-30e1-4160-9341-21bb905d6889', 'f4a6403d-b544-4a50-b9a6-a2b228be25a5'),
  ('27dc3dd7-30e1-4160-9341-21bb905d6889', '92a6caff-f9ae-4e1d-94ae-72ef3e44516e'),
  -- Ramminger Weiher (Rammingen) <- Ramminger Weiher
  ('148c7937-1d6a-489d-96da-ec0be4a11598', '8fb42c61-51b6-482b-a834-029668a42395'),
  -- Almer Weiher (Regensburg) <- Almer pond
  ('6a21e282-5c76-4e7b-b314-5c9ad2bfc408', 'c57e4688-02d6-4204-880f-64dff06795b8'),
  -- City park Regensburg (Regensburg) <- WC im Stadtpark
  ('b457ca50-366d-4b52-886a-3e3c46ec806d', '85399809-22ff-4392-a21b-bad98d565e30'),
  -- Don Boscoheim Nieder Roden (Rodgau) <- Don Bosco Heim
  ('185a0ede-46ea-43b0-84b5-720d868d2823', '088be161-b3f7-429d-a74b-fa21fe8679f5'),
  -- Parkplatz RuheForst (Selm) <- Cappenberger Ruheforst Parkplatz
  ('07b17a28-8199-4d12-9736-43ba3974b861', 'd89a7962-3437-4994-a53e-09d84f9b7c49'),
  -- Binsfeldsee Otterstadt (Speyer) <- Binsfeldsee | Lake Binsfeld
  ('26f22907-bc53-47b3-aed0-bc16d7689914', '0e518fc3-ce67-4336-acd0-d686bd24ea04'),
  ('26f22907-bc53-47b3-aed0-bc16d7689914', '6e1a9763-eeb8-4fe5-9cc9-50daa697100b'),
  -- Weipertshofen (Stimpfach) <- Weipertshofen Stausee
  ('1893c2f6-ba44-4eab-9b78-1cf6bce0447f', 'e78b5ed2-2ff4-4939-91e3-fc76173942ef'),
  -- Fernsehturm Woods (Cruising Area) (Stuttgart) <- Parkplatz Fernsehturm
  ('100a7a73-78c3-49ab-a93c-6341eb46f4cb', 'fc0eb99b-0662-43ba-9f7d-044006872085'),
  -- Rosensteinpark (Cruising Area) (Stuttgart) <- Rosenstein Park
  ('dc08832f-c5e7-483b-8119-4d2dc687b84e', 'a0e0f7bc-f927-4284-aa30-c046060d5b83'),
  -- Rastplatz Pellingen (Trier) <- Rastplatz / Bucht Trier Richtung Pellingen
  ('28e295e6-944f-4baa-a713-39d0e9cbb251', '5df9e7f3-89ab-43e5-8150-d289805d2767'),
  -- Rastplatz Rivenich (Trier) <- Rest area Rivenich
  ('8581d265-b3f2-4826-9af3-0d3ac2217d4a', 'e567308f-8bd3-464f-b932-8b1087397892'),
  -- Rastplatz Kemmental (Ulm) <- Parking lot Kemmental East
  ('d324a460-1032-46be-88e9-7a3b312ba738', '675f25e2-6b40-4de4-b2a9-8e4ab7733049'),
  -- FKK Feringa See (Unterföhring) <- Feringasee Parkplatz (nördlich)
  ('202bedd8-4c3b-4783-9585-365d75e5230f', '2e2a52b2-3aef-43cf-952e-03d832bc78a3'),
  -- Parkplatz Märkerwald (Urbach) <- Parking lot Märkerwald
  ('1334b8f0-d5ee-40ca-b650-6a8f8af2ad22', 'd0f7dd88-dd42-4fd8-9f41-1a6ac68e8ed5'),
  -- Parkplatz Wachenburg (Weinheim) <- Parking lot Wachenburg
  ('c2de10dc-72ed-438b-94df-77659200717b', 'c41f2077-f167-4deb-88cf-0e76717a61b9'),
  -- Rastplatz Mainhausen (Zellhausen) <- Rastplatz A3
  ('1733c290-deda-4886-9c65-e08effd341d4', '5a120f7b-c578-4e1a-a7c9-3a83e081e2af'),
  -- A14 Parkplatz Alter Postweg (no city) <- A14 Parking lot Alter Postweg
  ('a991ed56-c207-4e44-9235-f3c25fafb8a8', '7a0a7f17-9846-422b-a978-af3e9db00262'),
  -- A57 Parkplatz  Dong (no city) <- Parking lot Dong
  ('bfbd1490-4c38-4b80-aa2f-4a431485f7b7', '9ab6da25-2aaa-46f1-84f0-2ba2ff36d578'),
  -- A65 Parkplatz beide Richtungen (no city) <- Parking lot Spielberg
  ('e5d917a1-3a87-4e3c-aa05-b4da8e53e12c', 'c8544712-7e91-4110-89ad-56206349b81c'),
  -- A8 Parkplatz Kämpfelbach (no city) <- Parking lot Kämpfelbach
  ('b3a818c6-cea1-4d5d-9583-db499654b7c9', '218e64a6-856b-4a94-a4ef-2de45e81da26'),
  -- Altholzkrug (no city) <- Rest area Altholzkrug East
  ('98a874d8-6048-44d7-b269-d87ebadadc17', 'a9d76b73-d11d-45c7-82d8-4603e5a03ca6'),
  -- Autohof Hermsdorf A9 (no city) <- Erotic Market Hermsdorf
  ('907b015b-6a67-40e1-b0c1-7e8d22ab5744', 'aee65f39-95bb-4923-b6f7-b4be6383b5d1'),
  -- Bleibtreusee (no city) <- Lake Bleibtreu
  ('eaebcf99-1c4c-4345-8e9b-91183ade55bf', 'da2c4ac3-d7a6-437c-8d70-8a082a8f892e'),
  -- Bornbruchsee (no city) <- A5 Rastplatz Bornbruch
  ('87af0330-b519-41c5-9ed4-b169d6694850', '8de8fff9-6029-4dab-b820-95904041e473'),
  -- Böninger Park (no city) <- Böninger Park
  ('f78f95de-0a4e-4a8e-82eb-f219defb2d8d', 'e8987083-91a2-4dc9-80e5-78a0162070f7'),
  -- Einfelder See (no city) <- Cruising at Lake Einfeld
  ('5889f514-eb74-4d57-833f-0071ba60599a', '46388dc3-1400-4415-8a0f-6ecaca582e2c'),
  -- Erotik Kabinett (no city) <- Erotic cabinet empty
  ('892c83a9-11e9-4828-9cb7-94e6824fa75b', '2b80d275-fe2b-4a80-a604-ac8df473d59e'),
  -- Eschachtal (no city) <- Freeway service area Eschachtal
  ('cff92bcb-5f07-4844-9b46-30385e8b1793', '5eb9dbe9-9bca-4740-8326-cbfb5119cc3f'),
  -- Forest parking lot Vockerode (no city) <- Parking lot A9 Vockerode
  ('cabe9cb5-745f-4f61-bc84-3fc1e7719114', 'bb03947e-06d1-4430-b925-01a89433f6dd'),
  -- Fraunhoferstraße (no city) <- Subway Frauenhoferstraße
  ('b5bdb350-c915-4ca5-8661-3f329610326d', 'a0a30c52-0890-4d3c-a8e7-165d1a900589'),
  -- Gay Bi Area Parkplatz Hüsby (no city) <- A7 Parkplatz Hüsby | Rest area Hüsby A7
  ('9d081a18-86ec-4c40-808d-aeaf2d8cdf30', 'a72a015d-6a19-4d97-a74b-dab17c565920'),
  ('9d081a18-86ec-4c40-808d-aeaf2d8cdf30', 'b6a51ffb-4983-47ae-8a45-acd9dba2205b'),
  -- Godnasee (no city) <- Lake Godna nudist beach
  ('a8018c31-cf26-4da2-9db6-b58d819995ec', '97193daa-78f1-4c26-bdcb-a821cbf716a0'),
  -- Gremberger Wäldchen (no city) <- Gremberg
  ('823d0bb5-0e46-45ee-aa2c-b8cde1a3a0dc', '88bef92b-31b4-4504-8a18-7dee6917c0a8'),
  -- Grütepark (no city) <- Grüttsee
  ('e61b8de6-3508-436c-9c09-e6cafadbb70f', '2f65d6bc-871e-4385-998b-e970c69e9755'),
  -- Gänsedrecksee (no city) <- Gänsedrecksee
  ('f0ecbf4f-0cbe-45ec-b5ca-2a1418caa76d', '644f436a-e30a-4bd6-8405-5002d034e073'),
  -- Hasenwinkel B6n (no city) <- Parking lot Hasenwinkel
  ('d5125381-0d06-4b9f-8ff0-9f05b7e0085b', '9bdaabd5-c47d-40a5-8091-673303ef998f'),
  -- Hauptwache U-Bahn Station (no city) <- U-Bahn
  ('89187684-2bd8-4340-bf92-0fd45ef2a0db', '08b577c3-7dd9-4d36-9f60-bc186bb8669f'),
  -- Hofgarten Cruising Area (no city) <- Hofgarten
  ('d82587fd-c413-4b1d-b161-95a258305bf8', 'c85ff4fb-af9e-4fde-b3c0-f8a4b9a1bcda'),
  -- Ibbenbüren (no city) <- Ibbenbüren
  ('fcf251e8-3353-4692-9614-2acf46d5fffd', 'c18205e7-2ba9-43df-9c92-75eb086b23c9'),
  -- Kornberg (no city) <- Parking lot Kornberg North
  ('92dc10c8-d8bf-4cbb-9a09-fb5091e106b6', 'e31a0b8a-1c17-492c-986f-1562ef99450b'),
  -- Landschaftspark Duisburg-Nord (Cruising) (no city) <- Duisburg landscape park
  ('7059e30b-e24a-40fd-9d0c-917d390e7602', 'fbb4689d-bccf-4109-8135-40daf96f1d21'),
  -- Leinawald (no city) <- Leinawald
  ('ad8bff4f-426a-4611-a7b4-408e8f1aaf14', '733ce8b1-572c-447d-98ca-bf3c62d3049b'),
  -- Lindhöft Strand (no city) <- Lindhöft - Eckernförde Bay
  ('b3cfd697-a8c3-47be-a5d3-009f9a664029', 'b853b530-1871-4086-8e30-5a818303de38'),
  -- Motorway / Exit Alzenau-Mitte (no city) <- A45 Alzenau Mitte
  ('d1a56038-c255-40fe-968d-5373c5fc97d2', '9c4d040d-a79f-4c56-b272-6a7b4a500ee2'),
  -- Nicklass See (no city) <- Lake Niklas
  ('8104c64b-b0d1-42ed-9421-ff9fabd0833c', 'b7a55eee-28f3-45a3-a303-3679dcd59d21'),
  -- Nonnenweier quarry pond (no city) <- Nonenweier
  ('7c563e27-a38b-4335-a4fa-ec1b8c37d724', 'dc615887-dc4d-45b6-82ca-a9ee0bf9eb1b'),
  -- Oberer Seewaldseen (no city) <- Lake Seewaldsee
  ('6014159f-456e-4693-b4f7-ce2b3df2d12d', '6474d8fa-f299-4fb8-95b3-cae00b973d4a'),
  -- Parking lot Reichshof (no city) <- Parken
  ('7a7280bf-7c81-487b-8ad7-08097b2df5a3', '71e41aba-3c8e-4c01-be2c-9e7233a78b53'),
  -- Parking lot at the Bergwitzsee (no city) <- Bergwitz See
  ('7308740e-75b8-417d-8423-0b9a86648f87', 'c010f35f-c66a-4d36-97c1-5992c16dd859'),
  -- Parkplatz / Park now Ride (no city) <- Park n' Ride
  ('fbe2a24c-8a4d-409c-948a-9ea959f65701', 'd967e28b-99c0-4045-bacf-53dce67d0d2f'),
  -- Parkplatz A28 (no city) <- Parking lot A28 - Plietenberg quarry pond
  ('d42cc1da-8674-4a28-95f0-9ee672863d1a', 'bc2872a2-55dc-4ac7-ae16-3a12a3a62deb'),
  -- Parkplatz A99 Kirchheim/Aschheim (no city) <- Parking lot Aschheim
  ('f898a00a-731e-476e-8023-45d7ce63939f', '6115b160-d892-4163-9ce8-e3719e7fc72c'),
  -- Parkplatz Brunnthal Nord A8 (no city) <- Parking Brunnthal
  ('b82eb9d0-966b-4350-a358-47596e0306e2', 'f1529aef-ca58-49a5-8ad7-f1383b084f90'),
  -- Parkplatz Erzkaul (no city) <- Rest area Erzkaul
  ('e79f01cc-a1b1-403f-90f8-fed0f1e6b0dc', 'b1b47679-c4de-47c1-aed7-d1fbd0e34f63'),
  -- Parkplatz Kreuzlinger Forst Süd (no city) <- Parking lot Kreuzlinger Forst
  ('5e3fd0a6-73f4-4b8c-9927-f23b097b3865', '83c36de5-924d-4224-9b14-da78612a7827'),
  -- Parkplatz Laggenbeck (no city) <- Parking lot A30 Laggenbeck
  ('6bb0067d-fc4e-46a8-8f5b-b1bb6167cd22', '1061f05e-5df4-4b5c-8560-c3c22c16e28a'),
  -- Parkplatz Rosengarten (no city) <- Parklatz Rosengarten | Rest area rose garden
  ('5a020582-6960-40b6-aa23-34e09723c4cc', 'cd8a2f00-0bd3-4dfa-9fb3-15454799383e'),
  ('5a020582-6960-40b6-aa23-34e09723c4cc', '79d1f791-b693-4d69-8ece-8062580b0644'),
  -- Parkplatz Udler (no city) <- Parkplatz Udler
  ('f38d5c22-932c-421f-80b0-7bb13216df7e', '84d28312-b3ef-458e-bd2e-415695219038'),
  -- Parkplatz bei den Alhorner Fischteichen (no city) <- Parking lot Ahlhorn fish ponds
  ('d3beefda-0bb8-4865-aaf8-040cede3a465', 'af2601d6-c01a-470e-8d53-83a261bc8926'),
  -- Pomology Park (no city) <- Flap on pomology
  ('5a346563-bc3d-4b42-8fe5-777d99590d7b', 'd9a8e4b9-9d8d-45de-8402-cbc7a79a4058'),
  -- Pornokino Dolly Buster (no city) <- Dolly Buster Solingen
  ('20e5ce41-e04f-40f1-b31d-037561680baf', '6494603a-8be7-4ff6-9979-f36d372261bb'),
  -- Pupplinger Au (no city) <- Pupplinger Au
  ('d8df595c-a2ac-4ed2-9ef0-a2401d599b05', '8121ecd2-44bb-4ed1-a47b-98e5d2254a02'),
  -- Rastplatz B206 (no city) <- Forest parking lot B206
  ('a8c2952c-f51c-45c0-87fe-2539fb7bacd9', 'd1728dec-f8bc-42e9-93e1-644065d9c0ff'),
  -- Rastplatz Binshof (no city) <- Rest area Binshof
  ('7b4fc457-f839-49bf-aef8-d952756576ef', 'f169e03c-07c1-49bd-aaa3-deece8470fab'),
  -- Rastplatz Denkendorf (no city) <- Raststätte Denkendord Nord
  ('e13a37a8-ba71-48cf-b8f2-6788c096feac', '848d9986-d611-4536-810d-7db785b7e7bd'),
  -- Raststätte Alleinstein (no city) <- Parking lot Allenstein
  ('e60e273f-09c7-4d44-8389-e588f9ca9cbe', '2762b851-5492-4e5d-ac31-90aca7429ef3'),
  -- Reusrather Heide A3 (no city) <- Parking lot Reusrather Heide
  ('66d1e847-0ba3-4ef7-aea4-33eb23e9df5a', 'f0a34272-d787-4722-82e3-f6df9a25e7b6'),
  -- Rosenstrasse 1 (no city) <- Flap in the Rosenstraße
  ('bc2af9b7-412f-495f-b703-8c72194f7596', 'c87baa28-0e65-4712-a205-f9277b71f6dd'),
  -- Rößler Weiher (no city) <- Roesslerweiher
  ('64681af1-4a18-47b1-8f34-ab9c5ef85928', '6382dbf6-8a4e-42b5-adfa-95fd21db662c'),
  -- Saaleufer unter der Autobahnbrücke Jena-Göschwitz (no city) <- Jena Göschwitz
  ('b9d663eb-66e1-4c59-a98a-7c3b86ebb95a', '7a78ede9-1c46-491b-8ea5-ae83a0f3d662'),
  -- Silberbach (no city) <- Parking lot Silberbach
  ('dc26af41-462a-4429-9afb-d454e94a820f', 'fe04e783-27a8-4c4d-ab9c-b69c60945910'),
  -- Silbersee (no city) <- FKK am Silbersee
  ('7b671630-4725-47be-912a-36305530b914', 'f98ed212-0196-4247-a01d-0c30413bc175'),
  -- Stindertal/Stinderhof (no city) <- Rest area Stindertal A3
  ('755861a8-8754-48eb-b556-de2038327f92', 'a1abcab3-b1b9-4bdc-8d2d-0767f184710b'),
  -- Ufergebiet am Kernsee (no city) <- Kernsee
  ('9910187c-9470-457f-a784-f0e5301ec3c7', '8f49572a-b47c-4b48-b11c-1eb545b4e449'),
  -- Wanderweg zw. Rickartshofen & Nonnenhorn (no city) <- Rickartshofen
  ('9a4a8ae7-7a73-40f0-8880-d90df2eaa6f2', 'f32f1fd3-f90e-4d52-9664-393d23c04bed'),
  -- Öffentliches WC im Parkhaus neben dem Rathaus (no city) <- WC Parkhaus
  ('76150916-009e-4ab9-9589-b00abd335442', '62ce36b5-c6fb-4843-84da-d67958c2777e');

-- 1. Keeper names (guarded on the current name).
update public.venues set name = 'Koblenz Hauptbahnhof' where id = 'd9bf661f-a3fb-4032-9c16-6e77bd554271' and name = 'Koblenz main station';
update public.venues set name = 'Frankfurt Hauptbahnhof' where id = '03ea5c92-5b0d-4611-bbe5-6fabb8d67cee' and name = 'Frankfurt Central Station';
update public.venues set name = 'Parkplatz Reichshof' where id = '7a7280bf-7c81-487b-8ad7-08097b2df5a3' and name = 'Parking lot Reichshof';
update public.venues set name = 'Baggersee Nonnenweier' where id = '7c563e27-a38b-4335-a4fa-ec1b8c37d724' and name = 'Nonnenweier quarry pond';
update public.venues set name = 'Rastplatz Münsterland (A1)' where id = '10bdd6cf-dd86-465b-a041-f82e823f2bdc' and name = 'A1 rest area Münsterland';
update public.venues set name = 'Stadtpark Regensburg' where id = 'b457ca50-366d-4b52-886a-3e3c46ec806d' and name = 'City park Regensburg';
update public.venues set name = 'Pomologie Reutlingen' where id = '5a346563-bc3d-4b42-8fe5-777d99590d7b' and name = 'Pomology Park';
update public.venues set name = 'Grunewald' where id = '32ecf4a7-88c8-4790-a216-5dc16e3c4e44' and name = 'Parking lot Grunewald';

-- 2. Enrich keepers before the merge (fill-if-empty only; planet-randy's
--    translate.google.com wrappers are never copied).
update public.venues k
   set website = coalesce(nullif(btrim(k.website), ''), d.website),
       phone   = coalesce(nullif(btrim(k.phone), ''), d.phone),
       address = coalesce(nullif(btrim(k.address), ''), d.address)
  from (select distinct on (p.keep_id) p.keep_id, d.website, d.phone, d.address
          from _de_pairs p join public.venues d on d.id = p.drop_id
         where d.duplicate_of_id is null
         order by p.keep_id, (nullif(btrim(d.website), '') is not null) desc) d
 where k.id = d.keep_id
   and ((nullif(btrim(k.website), '') is null and nullif(btrim(d.website), '') is not null
         and d.website not like 'https://translate.google.com/%')
     or (nullif(btrim(k.phone), '') is null and nullif(btrim(d.phone), '') is not null)
     or (nullif(btrim(k.address), '') is null and nullif(btrim(d.address), '') is not null));

-- 3. Merge. Rows may already have been merged by another pass (a concurrent
--    admin session merged 94 cruising venues on 2026-10-10, some in the other
--    direction), so both sides are resolved to their live terminal first.
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
  for r in select * from _de_pairs loop
    k := pg_temp.terminal(r.keep_id);
    d := pg_temp.terminal(r.drop_id);
    if k = d then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform public._venue_merge_core(k, d, null);
    v_merged := v_merged + 1;
  end loop;
  raise notice 'de cruising dedup: merged %, already together %', v_merged, v_skipped;
end
$merge$;

-- 4. Close open review rows for any two members of the same cluster.
update public.dedup_review_queue q
   set status = 'approved',
       reviewed_at = now(),
       reviewer_note = 'manual DE cruising dedup 99991791632592'
 where q.status = 'open'
   and q.entity_type = 'venue'
   and exists (select 1 from (select keep_id, keep_id m from _de_pairs union select keep_id, drop_id from _de_pairs) a
                 join (select keep_id, keep_id m from _de_pairs union select keep_id, drop_id from _de_pairs) b
                   on a.keep_id = b.keep_id
                where a.m = q.keep_id and b.m = q.drop_id);

-- 5. Postconditions: end state, not this file's own writes.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from _de_pairs p
   where pg_temp.terminal(p.keep_id) is distinct from pg_temp.terminal(p.drop_id);
  if v_bad <> 0 then raise exception 'P1 failed: % pairs do not resolve to one venue', v_bad; end if;

  select count(*) into v_bad from (select distinct pg_temp.terminal(keep_id) t from _de_pairs) s
    join public.venues v on v.id = s.t
   where v.duplicate_of_id is not null;
  if v_bad <> 0 then raise exception 'P2 failed: % survivors are not live', v_bad; end if;

  select count(*) into v_bad from _de_pairs p
    join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id is not null
     and not exists (select 1 from public.venue_merge_audit a
                      where a.drop_id = p.drop_id and a.undone_at is null);
  if v_bad <> 0 then raise exception 'P3 failed: % merged drops have no live audit row', v_bad; end if;

  select count(*) into v_bad
    from public.venues
   where city_id = '63465b98-8237-43e9-bb4a-ca2960afadfa'
     and duplicate_of_id is null
     and name ilike '%am tunnel%';
  if v_bad <> 1 then raise exception 'P4 failed: Aachen has % live "am Tunnel" rows', v_bad; end if;

  select count(*) into v_bad from public.venues
   where name in ('XtraJOY Augsburg', 'Beate Uhse Augsburg') and duplicate_of_id is null;
  if v_bad <> 2 then raise exception 'P5 failed: XtraJOY / Beate Uhse Augsburg must stay separate (% live)', v_bad; end if;
end
$verify$;
