-- Restore 67 venues that a bad address lookup moved to a different city.
--
-- Selection (re-derivable, frozen below): one of the venue's own sources names
-- city X and gives coordinates within 50 km of X's centre; the venue now sits
-- more than 50 km from EVERY source coordinate; and it is filed under a
-- different city, or none. On 2026-11-22 that returned 75 rows. 67 are fixed
-- here; 8 are held for a human (listed at the end).
--
-- How they got there (57 of the 67 carry the full chain in enrichment_status):
--   1. centroid_repair nulled real coordinates it took for a city-centre
--      placeholder (gays-cruising and some refuge-restrooms coordinates ARE the
--      town centre, so the "placeholder" was the only evidence there was);
--   2. the forward geocoder put them back on a namesake: before 2026-08-22 a
--      bare street address with no city ("6805 Ridge Rd" -> Lincoln, NE), and
--      after it a same-name town ("Banheiro do Posto, Soledade" -> Soledade, RS,
--      2,956 km from Soledade, PB, on 2026-10-13);
--   3. backfill-venue-cities:reverse refiled city_id from the wrong coordinates.
-- The same change closes step 2 in the geocoder (anchor guard).
--
-- Each row is restored to its source's coordinates and city, like The Max
-- (/venues/the-max-1, fixed by hand 2026-11-22). A queer_village link to a
-- village of another city is cleared. postal_code is cleared: most were written
-- by the postal drain from the wrong coordinates, and trg_venues_geo_enqueue
-- re-queues a NULL postal for the reverse geocoder. timezone becomes the city's,
-- or NULL where the city has none (53 of 67): NULL beats the wrong zone they had
-- (a Fort Lauderdale bar on America/Los_Angeles). safety_gated is re-derived
-- by its BEFORE trigger (city_id / country_id change), never written here.
--
-- Two rows take a city other than the source's literal city text, because the
-- source's own address names it: Steamworks Berkeley (sources say San Francisco
-- / Oakland, address "2107 Fourth St, Berkeley, CA") -> Berkeley; Oz -> Phoenix
-- (its address and two of three sources; the third, a spartacus Wausau "Oz", is
-- a different bar merged into this row and is left for a human).
--
-- Soft on preconditions: a row is updated only while it is STILL more than
-- 50 km from its frozen source point, so a concurrent fix is left alone. Hard on
-- postconditions: every frozen row must end within 50 km of its source point and
-- on its target city (or have been merged away).


create temp table _vspr (
  venue_id uuid primary key,
  slug text not null,
  source_id uuid not null,
  city_id uuid not null,
  lat numeric not null,
  lng numeric not null
) on commit drop;

insert into _vspr (venue_id, slug, source_id, city_id, lat, lng) values
    ('39ca22d4-77a8-46f8-8e13-4c08534fa3c4'::uuid, 'aktionsb-ndnis-queer-in-greifswald-e-v', 'f7043499-1f62-4ec9-b0fc-f6d403bb4db1'::uuid, 'a0a2c11c-8b7e-4201-a1e6-f49959e01766'::uuid, 54.096, 13.373),
    ('e17e29e1-00dc-4c30-92a9-ce22546a6946'::uuid, 'aldi-1', '98c21e56-bbda-4615-ad61-bec546d5de81'::uuid, 'a9c04884-503f-4de5-a6f7-00828e9ec918'::uuid, 41.3796786, -81.7337077),
    ('a2f43b43-1401-4882-9811-65d276de262d'::uuid, 'alex-shelby', 'fc572ad2-571e-4bd9-bc3a-2b6d26f300ce'::uuid, 'd7674a5b-3f06-4f23-97d2-2c73dd96bc40'::uuid, 44.3825567, -88.7393536),
    ('d01612ce-7baf-4e65-addf-51ff19eb1d6b'::uuid, 'banheiro-do-lago-3', '7664ae19-97b8-466f-a0dc-864dcbd43540'::uuid, 'f567328e-d776-4820-9eaf-c6e6e341b19f'::uuid, -20.5026302338, -48.9411239624),
    ('8eadfd95-ab06-488a-bc2c-fc3433c11a3d'::uuid, 'banheiro-do-posto', 'd3cd0fbc-2ddb-47bd-bb8b-a43d68b4fe2c'::uuid, 'e8bc300b-fcf2-4580-932e-9b23bff75e72'::uuid, -7.0597858429, -36.3555488586),
    ('8cd4b73f-1570-455b-85f4-768961289287'::uuid, 'banheiro-do-posto-3', '7923fa30-ee03-452c-9e38-039996df9522'::uuid, '20ed413f-602e-4681-8518-3d99c68865fe'::uuid, -6.0063438416, -44.2586784363),
    ('20718533-6598-498d-a9bb-29ac85e2a420'::uuid, 'beira-do-rio-s-o-francisco', '476181b7-e2c1-440f-b26d-e19213e73d58'::uuid, '9a774378-8e90-4d79-9bda-5bb2f7806ca1'::uuid, -9.6262750626, -37.7550125122),
    ('95c18cb9-32fe-4f8f-aec5-a1626ddc6201'::uuid, 'boys-boys-boys-the-gay-afterwork', '07896b00-ed95-42b8-b5e3-ebdbb6fa8b47'::uuid, 'af082d6a-800b-4cfc-96df-ca1e55c93115'::uuid, 51.2275, 6.7764),
    ('9ff7f341-f8e5-44fa-9e01-b329f6a69827'::uuid, 'business-and-engineering-convergence-center', '4df3e592-a6e4-4ce5-b132-ad3cf0dfb0d4'::uuid, '3848c5d5-2a75-412a-8563-23309c706a7d'::uuid, 40.6995435, -89.6171849),
    ('e3ff0f57-c464-48d4-b09e-64dbcb529040'::uuid, 'casa-de-sotano', 'a96f5fa3-7741-4672-aaeb-4c1d1939d19e'::uuid, '85a9dda1-8115-4667-a438-cb61edd51b61'::uuid, 21.9768981934, -103.5903930664),
    ('7cc7b060-9020-4777-baa4-ee6163907467'::uuid, 'casey-s-5', '1929085b-f7b4-42e0-abf8-e0be94e080a4'::uuid, '5d9c2ad6-9d3d-4c14-aba8-cd3174d40108'::uuid, 40.5909732, -89.4743386),
    ('459afc7f-6c44-4fad-a89e-1b3a4134c7a5'::uuid, 'casey-s-7', '6e4bf36e-22bf-4595-9e2c-93e7882a580a'::uuid, '8305709e-8026-4a6a-8147-aa1abd400717'::uuid, 41.3535042, -90.3859831),
    ('acacfa1f-ef2e-4048-ad86-13f0afc19db5'::uuid, 'chez-fabien', 'b8f80cd1-e5f5-4d64-a17b-05002e531198'::uuid, '952a37e8-8833-4dac-97a3-e3eb6e3e9c7f'::uuid, 32.938512, -97.0786659),
    ('dc5a6689-f264-4fbf-a31c-e6f86c87ac64'::uuid, 'chopped-and-sliced-bbq', '6fa06302-9712-40bb-b663-369cd584e4bc'::uuid, '6eea43ad-8f39-4cb9-8f45-1c5614d0b679'::uuid, 33.5481662, -101.8901939),
    ('713e746b-1ac2-45dc-82dd-156b2d14cb40'::uuid, 'crystal-s-2', '7aacfa1d-f37d-472d-993d-a32710fc2457'::uuid, 'ee50e738-7c1b-4ae0-bde2-c247a3ed0d4c'::uuid, 30.2296484, -93.2186407),
    ('cc4e4662-1c37-4661-a3bc-574f939f3733'::uuid, 'dark-neighborhood', '6fc44cb6-ca10-4fd0-859a-4f53cb91e911'::uuid, '9c617c3c-76e2-4759-a5f1-34bd9841d6d5'::uuid, 28.3570766449, -81.4216079712),
    ('b84558d1-1407-4571-b542-bd1a652a9981'::uuid, 'dead-end', 'df782245-0402-4644-a708-6f8ea0f8bb7a'::uuid, '5b228be7-c12c-4292-a2cf-71f7d379b1a8'::uuid, 43.9580383301, -89.8576889038),
    ('bc516957-247b-4adc-84bd-50c89a283557'::uuid, 'digitale', '35d85f59-12f9-4006-be0e-2ee9df07c3dc'::uuid, 'e3ed2803-a079-4f01-9de8-1cda6779136b'::uuid, 47.7443288, 7.3370973),
    ('12caa56d-30d6-44b1-9fed-35d1d48fbc25'::uuid, 'dos-amigos-burritos', 'f8cea799-b7cd-41ba-bbed-80f719d4ca89'::uuid, '15236843-07f0-4e98-af6d-87c6820dc01e'::uuid, 43.205115, -71.53565),
    ('85f5579f-27b1-4e97-9b11-3beb85b82c98'::uuid, 'dr-wall-and-associates', 'bbae8d60-5113-40ba-ad7e-016191f3767c'::uuid, 'ff48bd4f-0972-49a3-90cb-cd9a5f764299'::uuid, 43.5789378, -116.3943289),
    ('34e68b3c-28f2-4f93-b0a4-ba4e4daf95c7'::uuid, 'fonts-books-and-gifts', 'ebd373ee-0632-4a35-9b5a-a295794e395d'::uuid, 'de87aa9a-5efe-460b-a2b4-26ee3f42ecdb'::uuid, 38.9211903, -77.1523361),
    ('8884fec7-b1a7-44de-8750-94bd8b816d72'::uuid, 'gadsden-hotel', '6ef4462c-bd6f-4c5f-beb2-26f6d3aa132f'::uuid, '2fa091aa-f18a-454f-86ea-f2b32366c8d8'::uuid, 31.3450602, -109.5547655),
    ('c5a41ae0-37b5-42ba-b114-149df49f6d2c'::uuid, 'gents-barber-shop', '71fed6d2-68a9-4e3b-88b4-171f9612d08b'::uuid, 'eb2ad07d-f1ef-4386-83c9-031d6b861ce7'::uuid, 35.7628769, -83.9653344),
    ('c30c78f6-8261-42f8-bf05-b07431518cb6'::uuid, 'geronimo-s', '0d52fd52-1d88-4ada-86ad-3cf91bb1136a'::uuid, '553588f9-e85b-49b9-8c10-c109f52f41db'::uuid, 35.680424, -105.925257),
    ('b6296951-2309-4b6f-adf7-37ac4df6b458'::uuid, 'hammam-saint-michel', '6168dcec-116a-414b-8eba-74a57ff9e0a4'::uuid, '6a99564b-8c4a-4be8-844e-b9b4bc3182d4'::uuid, 43.9424106, 4.8091734),
    ('b04dce34-2191-4b5c-bbc3-6d2189f4405d'::uuid, 'hide-woods', 'b5b4ce40-b00a-4003-ae61-e8e575ff3857'::uuid, '49ea3845-bbb5-490b-bea6-a1fe49935344'::uuid, 45.7737503052, -92.7771377563),
    ('7da1ba07-f3c0-41a5-83de-34aa0f283dc6'::uuid, 'hylas-club-sauna', 'eeddf2bb-f39a-459c-81bb-a8b25dd93f1d'::uuid, '00f91545-754f-43b3-a0ef-b844fb906363'::uuid, 44.9382083, 4.9002622),
    ('6c26c241-f8d8-4914-9f38-d2f02a9daf49'::uuid, 'independence-place', 'd1db4364-18ab-4dc0-9396-938b1a21e4c6'::uuid, 'cc767dc1-e5b7-4452-bb35-15cb01410a85'::uuid, 37.304644, -89.53421),
    ('8a6c553a-65fd-4994-8827-f52dac3c9d09'::uuid, 'jack-flash', '17c64b29-bb10-4d86-b1c7-29c0f5121053'::uuid, 'ee51e169-c008-49ae-9aed-4868f6c57eca'::uuid, 39.445087, -89.648864),
    ('7f5f840e-276e-46f8-b200-bd43acd629a1'::uuid, 'jiffy-lube', '5f1e717a-8067-48fa-be3f-b6a0a7ba16da'::uuid, '6d711da8-9841-470e-8b58-2a1c67f908c5'::uuid, 40.3122778, -111.7021644),
    ('82c54101-751d-4912-9cc7-23dc7041f976'::uuid, 'keivi', '162d7528-a971-43c9-8915-fca02bd4f3a4'::uuid, '8e055c1c-e2a6-4414-afcf-684e37953c3a'::uuid, 35.656263, 139.700966),
    ('c802ed1f-740c-438a-9f25-c0967a4cfef4'::uuid, 'klub-sauna-piwnica', 'd387fc0b-ece7-4d49-9605-28647eff80d4'::uuid, 'a8aa078d-0817-4ab0-b726-9cdb546d1747'::uuid, 53.131138, 18.009333),
    ('6a257e87-bfd2-4056-97c4-c394d6cf4ef2'::uuid, 'lauritzen-gardens', '75605556-ba7b-4b8f-856e-963f48714c3d'::uuid, 'f815e6a7-cff6-4178-868a-e54971fef32c'::uuid, 41.2363008, -95.9165375),
    ('59d7f813-b8cb-4f7b-b8e2-0ea50b8b158f'::uuid, 'le-kls-sauna', '3545cee0-4824-4269-a0dc-bb46baf47877'::uuid, '0d7315f9-9de5-4995-b0f3-faae98645d5d'::uuid, 47.8115488, 3.5845463),
    ('fad82389-29f0-44ad-8a27-1a24b73944ae'::uuid, 'levi-jans', '21f734ad-4982-49a2-b471-e3b9659304c3'::uuid, '73b2afe1-bdab-4b2c-8424-c9ce57d17dab'::uuid, 49.6624969, -112.8053162),
    ('df128815-2b8d-4912-9294-baa2fc826ac3'::uuid, 'little-general-marathon', '0b8db4cf-1a3a-4815-9e0a-2d3cdcb5cec2'::uuid, 'd8785319-5fd2-4d1b-9da7-dddf91175d17'::uuid, 36.7419147, -88.6485424),
    ('5384d450-de8f-43df-b38b-19e9b65f04b1'::uuid, 'megaplex-theatres-at-geneva', '25c80b31-0e38-4c76-8a03-340b11abf1e2'::uuid, '11636f90-11ba-491e-8541-0194e6157d90'::uuid, 40.3076202, -111.7357246),
    ('b104ea7d-f101-4e18-b482-5351cd853267'::uuid, 'meson-sabika', 'ae77020c-c64e-4d26-923b-cbf843bdd397'::uuid, '87d9f1af-cae3-4a7b-ad7d-9f23b676969f'::uuid, 41.7684683, -88.1642778),
    ('5efcbab2-3911-4e08-8c46-11d0e4da49d7'::uuid, 'mokan-weight-management', '3379816e-3f02-42e3-981b-99caa2053f6a'::uuid, 'ea079f0d-5684-4948-b8f4-2e4741b48995'::uuid, 38.9782651, -94.6337164),
    ('0d1764b4-8556-4df2-8c89-3a715d100598'::uuid, 'n-mes-club-sauna', 'cd85556e-a055-4345-912b-20cfeecee0cf'::uuid, 'defb73d4-5737-4f42-8ee7-7bcf3f718248'::uuid, 43.8367157, 4.3541921),
    ('32aa0f88-a986-46c7-bf91-41ef72323f2f'::uuid, 'noodles-and-company-1', '7508e0ca-06c5-4f62-a406-e89aff7177be'::uuid, 'd20e05cb-8590-4130-b37e-d76a7772e1c1'::uuid, 40.9913625, -111.8933382),
    ('332686cf-61e8-4b5d-9a08-a06ee988d72a'::uuid, 'oak-hills-family-dentist', '4ec77ae9-1694-4ab4-8f57-62c0ce634527'::uuid, 'e8964227-7103-4029-979b-6ecba6f3354a'::uuid, 41.0585058, -111.9452626),
    ('3bb25cd5-9406-448b-a047-bcbdca3f7244'::uuid, 'oz-2', '5c030689-13d1-44b4-84f0-8e4d1208d7bd'::uuid, '98b4b94d-e155-4062-a83b-f0a76eadf8a8'::uuid, 33.524457, -112.09844),
    ('9c99feca-ed51-41c4-aa13-80039447b4b9'::uuid, 'p-terry-s-burger-stand', '0f51b2d1-6d33-4799-b82e-b827d3ab6efd'::uuid, 'f85fe49d-ef1f-4cf2-a43e-6daacc485490'::uuid, 30.6298682, -97.6905723),
    ('a9485e5e-fad0-455d-a0c9-ce3bb4aa5d16'::uuid, 'posto-s-o-mateus', '04121150-8453-4f0b-8a53-8ec76980b6dc'::uuid, 'b4caed8d-7c2d-458a-92f7-772ab4de0431'::uuid, -22.7972927094, -51.3766403198),
    ('5e5c2b9d-9701-49c5-9d5d-b7245d9a2801'::uuid, 'presley-s-cocktail-bar', 'b723c637-b4f0-4f70-a250-94ffd8a53252'::uuid, '99a6d708-56b1-4e3d-ae1b-c5c086c63d1a'::uuid, 40.6915838, -75.2067681),
    ('da483e64-25c9-431f-88e3-149604d8f4c0'::uuid, 'puerto-sabanagrande', '0918faeb-f736-4e3e-a286-9bbda66e966d'::uuid, '2164adac-71c9-47aa-83a0-0a6e93496920'::uuid, 10.7923641205, -74.7475814819),
    ('8e3a6adb-b8fe-46ae-9872-8a41f76ede01'::uuid, 'ramrod-fort-lauderdale', '495feaf4-8fab-4f13-ab34-ed3e25353006'::uuid, '18b126e3-fc91-4b3d-8c05-4016c740bbde'::uuid, 26.146196, -80.14034),
    ('e35fc61e-a918-4018-a122-94c3d00033ff'::uuid, 'reads-and-company-books', '502bc300-6a52-400a-bd1a-2c6c36798c0b'::uuid, '5bf4d098-0d30-4039-b9fd-1f40fa29c7c9'::uuid, 40.1335252, -75.5174588),
    ('0e825f63-101a-4ac3-91e5-38825b9120e0'::uuid, 'retro-bar-1', '65ffc688-909b-4f0e-ba66-3863f58a8397'::uuid, 'cbd7c40b-2cc5-418e-bb71-9efe0e1a697c'::uuid, 46.9496298, 7.441261),
    ('90fd00fb-e8be-4aaa-a6c5-b62a76910422'::uuid, 'riverton-memorial-park', 'b987533d-960a-457d-9ee4-523caa908704'::uuid, '52b03c23-ec0a-42ed-bec2-61947bc6c2c6'::uuid, 40.0102348328, -75.0059051514),
    ('4889f1ad-7f22-4d8e-9022-af92249ca774'::uuid, 'sauna-d-italie', '8e4fb8b9-2ede-4b22-8f14-92b19c41f7bc'::uuid, '2fb33ed5-c2b0-4560-a7e2-8818c67ca431'::uuid, 45.7820477, 3.0954071),
    ('ce120c8b-f630-4a69-9c62-19071bbabbf9'::uuid, 'savage-surplus', '48425b99-6804-4f72-85d9-2fb293a42886'::uuid, '1270135c-3a6e-4716-87b5-8d6fedf09109'::uuid, 44.7767801, -93.3474211),
    ('b7729f85-ccd5-4428-8d15-8037d4184998'::uuid, 'scout-coffee', '5a74cc94-1404-41ed-840a-548fb0c4b3fb'::uuid, 'c73b869b-d407-4d15-be00-63afc283658d'::uuid, 39.018242, -94.2809975),
    ('4624fe21-4b65-4f69-84de-873bfbd01312'::uuid, 'seekers-2', '6510b81a-e331-48b1-acd3-68b5bbef557c'::uuid, '9dbbbc15-f477-4f32-8efe-d155f6db1531'::uuid, 42.9452774, -82.4514836),
    ('cb23f6fc-5596-4146-8e8b-2cad3b337371'::uuid, 'starbucks-16', '232dd265-3feb-4c7e-89aa-e94a2f8b4267'::uuid, '59c8d5e5-e7e3-466a-a670-14684e52aae0'::uuid, 30.6547895, -87.9066265),
    ('c15db139-4600-405a-86d6-4ff673397fd2'::uuid, 'starbucks-18', '04c1916c-0840-4b58-9d85-cdd66a0717a1'::uuid, '278f0be5-ebe7-4e1d-8b1b-97c06dcc8c5f'::uuid, 39.0779119, -108.5790287),
    ('cc917cac-12cc-4098-97ea-096296e0b2dd'::uuid, 'starbucks-20', '603395b8-cf94-474b-bffc-3a1a7b9a0e4d'::uuid, '64358a69-aa0e-4eb7-99fa-054174239f7a'::uuid, 31.8052607, -97.1009714),
    ('b45c91ad-f758-40b6-8181-a6a0788360bd'::uuid, 'steamworks-berkeley', '1833a307-8235-4cdd-aba1-f13f1a587cd8'::uuid, '52389846-8604-469f-9bcb-25c1bb12b892'::uuid, 37.8659665, -122.2987483),
    ('7c47a007-99d7-4649-af3f-c45c9ce0a49d'::uuid, 'taco-via', '1cef9e4f-677a-4d57-9c63-72be9b9300af'::uuid, '354f157a-836f-4861-bb95-846cc873b614'::uuid, 38.9571565, -94.6886805),
    ('03b61289-9643-421c-90ce-a0a10b042ef6'::uuid, 'tin-lizzie-saloon-2', '5eded06f-5711-429e-b4a9-8e260798b6b8'::uuid, '8efd3d42-30bb-4d21-a45c-fe32b6049272'::uuid, 33.677607, -117.888239),
    ('821c3347-fc5a-4045-a805-1fe918656f69'::uuid, 'trader-joe-s-1', 'd83509a3-2c43-4dbd-86b4-b26291a67d61'::uuid, 'a7541d8d-0c6d-4afe-8d8b-84c05bb71d3c'::uuid, 40.543187, -111.890724),
    ('16ea8139-7f78-4e5f-ae60-e367ab843b07'::uuid, 'underground-fetish-1', 'a86f6406-aa1a-4627-88ae-7bf8c510bea5'::uuid, '32c83098-96dd-4448-9fb4-80c243903ccc'::uuid, 52.3738, 4.8919),
    ('6d63fb44-f9dd-43de-9782-31636d69fb16'::uuid, 'uni-botanical-center-room-016', 'b58d10ed-8737-40d9-8bce-dc127764895c'::uuid, '66a1ca62-f524-4b68-a4b9-1f2205ffd963'::uuid, 42.5134127, -92.4592925),
    ('1e24a233-a41d-4ccf-a582-b56df4d03316'::uuid, 'uni-botanical-center-room-018', '9f916c30-b5f6-4fe4-9f1e-e658ae82373a'::uuid, '66a1ca62-f524-4b68-a4b9-1f2205ffd963'::uuid, 42.5134127, -92.4592925),
    ('4afa8d84-4f6b-425c-9f9c-2654b0f533db'::uuid, 'walmart-supercenter', '01760960-b06f-4887-ba77-7240626e76d9'::uuid, 'bdf50286-089f-4bc1-bae1-b6830e057872'::uuid, 41.279871, -95.8688404),
    ('25d80701-f8f7-4340-a2ee-58d07755b976'::uuid, 'zona-de-descanso-3', '7eb57e40-a358-4b12-bc2d-07e8d868ff03'::uuid, '17c2c59f-2511-4e5c-8005-bbb918dd20f6'::uuid, -31.5636940002, -71.5388259888);

do $pre$
begin
  if (select count(*) from _vspr) <> 67 then
    raise exception 'venue_source_position_restore: frozen list is not 67 rows';
  end if;
  -- A typo in the file, not a corpus state: every target city must exist and be live.
  if exists (select 1 from _vspr f left join public.cities c on c.id = f.city_id
             where c.id is null or c.duplicate_of_id is not null or c.latitude is null) then
    raise exception 'venue_source_position_restore: a target city is missing, merged or has no coordinates';
  end if;
end $pre$;

select set_config('app.actor', 'migration:99991795377933_venue_source_position_restore', true);

-- The venue-identity organization above each venue (minted by the spine
-- backfill) mirrors the venue's wrong location. sync_entity_location_to_organization
-- only FILLS empty org fields, so it would keep the wrong coordinates beside the
-- corrected city and assert_entity_location_consistency rejects that. Move the
-- org first — only an org that belongs to this venue alone (the sync's own
-- eligibility) and still sits where the venue wrongly sat.
update public.organizations o set
  latitude = f.lat,
  longitude = f.lng,
  city_id = f.city_id,
  country_id = c.country_id,
  postal_code = null,
  timezone = null,
  updated_at = now()
from _vspr f
join public.venues v on v.id = f.venue_id
join public.cities c on c.id = f.city_id
where o.id = v.organization_id
  and o.duplicate_of_id is null
  and v.duplicate_of_id is null
  and (o.primary_venue_id = v.id
       or (o.primary_venue_id is null
           and not exists (select 1 from public.venues v2 where v2.organization_id = o.id
                           and v2.id <> v.id and v2.duplicate_of_id is null)
           and not exists (select 1 from public.hotels h where h.organization_id = o.id
                           and h.duplicate_of_id is null)))
  and (o.latitude is null or o.longitude is null or v.latitude is null or v.longitude is null
       or public.haversine_m(o.latitude::numeric, o.longitude::numeric, v.latitude, v.longitude) <= 1000)
  and (v.latitude is null or v.longitude is null
       or public.haversine_m(v.latitude, v.longitude, f.lat, f.lng) > 50000
       or v.city_id is distinct from f.city_id);

update public.venues v set
  latitude = f.lat,
  longitude = f.lng,
  city_id = c.id,
  city = c.name,
  state = case when c.region_name ~ '^[0-9]+$' then null else nullif(btrim(c.region_name), '') end,
  country_id = c.country_id,
  country = co.code,
  timezone = c.timezone,
  postal_code = null,
  address = coalesce(nullif(btrim(v.address), ''),
                     nullif(btrim(s.payload->'normalized'->'location'->>'address'), '')),
  queer_village_id = case
    when v.queer_village_id is null then null
    when exists (select 1 from public.queer_villages q where q.id = v.queer_village_id and q.city_id = c.id)
      then v.queer_village_id
    else null end,
  enrichment_status = coalesce(v.enrichment_status, '{}'::jsonb) || jsonb_build_object(
    'source_position_restore', jsonb_build_object(
      'at', now(),
      'by', 'migration:99991795377933',
      'source_id', f.source_id,
      'previous', jsonb_build_object(
        'latitude', v.latitude, 'longitude', v.longitude, 'city_id', v.city_id,
        'city', v.city, 'state', v.state, 'country_id', v.country_id,
        'postal_code', v.postal_code, 'address', v.address,
        'queer_village_id', v.queer_village_id))),
  updated_at = now()
from _vspr f
join public.cities c on c.id = f.city_id
join public.countries co on co.id = c.country_id
join public.venue_sources s on s.id = f.source_id
where v.id = f.venue_id
  and v.duplicate_of_id is null
  and (v.latitude is null or v.longitude is null
       or public.haversine_m(v.latitude, v.longitude, f.lat, f.lng) > 50000
       or v.city_id is distinct from f.city_id);

do $verify$
declare v_bad int; v_done int;
begin
  -- P1: every frozen row is at its source point and on its target city, or merged away.
  select count(*) into v_bad
  from _vspr f join public.venues v on v.id = f.venue_id
  where v.duplicate_of_id is null
    and (v.latitude is null or v.longitude is null
         or public.haversine_m(v.latitude, v.longitude, f.lat, f.lng) > 50000
         or v.city_id is distinct from f.city_id);
  if v_bad <> 0 then
    raise exception 'venue_source_position_restore P1: % frozen venues are still off their source point or city', v_bad;
  end if;

  -- P2: no frozen row keeps a queer_village of another city.
  select count(*) into v_bad
  from _vspr f join public.venues v on v.id = f.venue_id
  join public.queer_villages q on q.id = v.queer_village_id
  where q.city_id is distinct from v.city_id;
  if v_bad <> 0 then
    raise exception 'venue_source_position_restore P2: % frozen venues keep a village of another city', v_bad;
  end if;

  -- P3: the country follows the city (safety_gated derives from it).
  select count(*) into v_bad
  from _vspr f join public.venues v on v.id = f.venue_id
  join public.cities c on c.id = v.city_id
  where v.duplicate_of_id is null and v.country_id is distinct from c.country_id;
  if v_bad <> 0 then
    raise exception 'venue_source_position_restore P3: % frozen venues have a country other than their city''s', v_bad;
  end if;

  -- P5: the timezone follows the city where the city has one (a Tokyo bar
  -- kept Europe/Tallinn in the first dry run).
  select count(*) into v_bad
  from _vspr f join public.venues v on v.id = f.venue_id
  join public.cities c on c.id = v.city_id
  where v.duplicate_of_id is null and c.timezone is not null
    and v.enrichment_status->'source_position_restore'->>'by' = 'migration:99991795377933'
    and v.timezone is distinct from c.timezone;
  if v_bad <> 0 then
    raise exception 'venue_source_position_restore P5: % frozen venues have a timezone other than their city''s', v_bad;
  end if;

  -- P4: not vacuous — the frozen rows exist and most carry this file's stamp
  -- (a concurrent fix may have reached a few first).
  select count(*) into v_done
  from _vspr f join public.venues v on v.id = f.venue_id
  where v.enrichment_status->'source_position_restore'->>'by' = 'migration:99991795377933';
  if v_done < 50 then
    raise exception 'venue_source_position_restore P4: only % rows carry the restore stamp', v_done;
  end if;
end $verify$;

-- Held for a human (not touched):
--   woodys (Dallas)                 a wrong merge with a Philadelphia Woody's, not a geocode
--   human-rights-campaign-action-center-and-store-1
--                                   stores in Provincetown and San Francisco; no address
--   h-ibiza                         source longitude is exactly 0
--   the-vault-2, bar-69, canibal-lounge-pub
--                                   empty city_id, coordinates 139-178 km off; need a
--                                   position restore, not a refile
--   starbucks-3                     two Starbucks merged: refuge-restrooms Edinburgh
--                                   (Haymarket Terrace) and a Frisco, TX source whose
--                                   longitude is 0; the row's address is Frisco's
--   bumblebee-creamery              three signals disagree: source Belmont, NC; postal
--                                   94002 (Belmont, CA); filed under Boston, MA
--   apeler-lake-in-surheide         the source contradicts itself (city Neustadt in
--                                   Holstein, address "GM63+QQ Schiffdorf"); the row's
--                                   Bremerhaven position matches the address
--   oz-2 (fixed above)              its spartacus Wausau, WI source is a different bar
--                                   merged into this row
