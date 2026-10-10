-- Cruising-venue dedup for Spain (2026-10-10).
--
-- Fourth pass after Germany (99991791632592), the multi-source countries
-- (99991791634999) and Brazil (99991791636544). Spain's ~8.7k cruising rows
-- are almost all gays-cruising submissions, so duplicates are repeat
-- submissions of one spot ("Casa de Campo" + five sub-areas, "Montjuïc" x5,
-- "Parque del Oeste Cruising" = "Parque Oeste").
--
-- Method: every pair of live category='cruising' venues in ES within 1.5 km
-- whose names agree after a Spanish/Catalan/Galician normalisation (playa/
-- platja, parque/parc, plaza, embalse/pantano, aparcamiento, baños/aseos/
-- lavabos, centro comercial, bosque/pinar, estación/renfe; accents and
-- trailing numbers stripped): 535 candidate pairs, all read by hand. About
-- 230 are different places sharing a generic word (different car-park
-- toilets in Málaga, different streets in Inca, airport terminals T1 vs T4,
-- old vs new bus stations, different gyms and bars) and are NOT touched.
-- Named or numbered sub-spots of one place are merged into one entry, per
-- the site owner. The C-58 rest areas in each direction are kept apart and
-- asserted below.
--
-- 290 drops in 252 clusters. Keeper = most events/sources, then gayout,
-- then the most generic (shortest) name. _venue_merge_core copies no fields,
-- so keepers are enriched fill-if-empty first; every merge is schema:1 and
-- reversible with unmerge_venues().
--
-- Soft on preconditions: both sides resolve to their live terminal, so a pair
-- another session already merged (either direction) is a no-op. Hard on
-- postconditions: end state only.

set local statement_timeout = '300s';

create temp table _es_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _es_pairs values
  -- Bastiagueiro (A Coruña) <- Pinar al Este de la Playa Bastiagueiro
  ('c970a1eb-1e5f-4340-b92c-bf40c06e4c8e', '7c2ed848-115c-459f-b61e-50673f43dc52'),
  -- Playa de Las Americas, C.C. Salytien, Chaplins Bar (Adeje) <- Playa de Las Americas, beachside of shopping centre SALYTIEN
  ('0e7c4a4f-a0b7-495e-ac8f-cfe466db0ffc', 'b861cbd1-fc91-4518-abc0-a7223bb09244'),
  -- Imaginalia (Albacete) <- Descampado Imaginalia
  ('42e6cdb8-c0ad-4b5c-8378-d73f737fb05c', 'b09039d2-35d6-4742-b775-069419e82f54'),
  -- Gimnasio Forus (Alcalá de Henares) <- C.C. Alcalá Magna | Gimnasio Forus C.C Alcalá Magna
  ('0b9521f9-0453-4d51-8cb2-98aa92aedec6', '5e28a675-d758-4e92-a147-4b4ac4eb5032'),
  ('0b9521f9-0453-4d51-8cb2-98aa92aedec6', '0f3b1b5c-725a-427d-bcdb-9fa8f17d5869'),
  -- Tres Aguas (Alcorcón) <- Camino frente a traseras de Tres Aguas
  ('29cbe769-0d6e-41ed-9b24-b9e95fc512da', 'dbbd6f6b-00d6-4d24-98e3-50c26bbca302'),
  -- Túnel 1° Polvoranca (Alcorcón) <- Túnel 2° y 3° Polvoranca
  ('c6fe5511-7256-409a-85ec-bbe079e09d40', '05bf8ef4-74e9-4f16-82a9-e1883b7e49db'),
  -- Baño Estación de Autobuses (Algeciras) <- Detrás de la estación de autobuses San Bernardo
  ('1f7c9758-44bf-4f3d-ac82-4d1ef2b6706e', 'a2bae986-7933-49ce-8a1b-1eeb38f8f87d'),
  -- Body Factory (Algeciras) <- Cafetería Body Factory
  ('142d87eb-2557-4e97-b87d-1a081f058e26', 'e7421ed6-8de5-4561-b6a8-8a53d69316a1'),
  -- Ermita (Algeciras) <- Zona La Ermita
  ('0e731211-414a-442f-ba44-13157a049c6a', '8ac45d22-1688-4182-bb1d-d87a1bf56acf'),
  -- Parque del Centenario (Algeciras) <- Cala junto Parque del Centenario
  ('56ca3dcf-6441-4949-8590-59c00adaf36f', '2a3139af-92fa-400b-81f4-596ade299c44'),
  -- Río Pícaro (Algeciras) <- Camino pedestre del río Pícaro Algeciras
  ('860c9a1b-ffba-49b2-a186-690766d2aacb', '3225cb22-084d-48d5-8a15-9fabea2ceb0e'),
  -- Olivos - Parque de Bomberos (Alicante) <- Cruising Parque de Bomberos
  ('3b18654c-4a7a-409b-8594-9571fb31b1bc', '7b7c41a2-99cb-4a94-b741-3b5ee8d9ad0c'),
  -- Parada de tram La Sangueta (Alicante) <- Zona pasando la parada de Sangueta
  ('e3942679-a5da-4e0b-8f47-38d95dcec7f3', '586ffb3a-eecd-40cc-934c-ad860a06b4de'),
  -- Platja de la musclera (Arenys de Mar) <- Platja Nudista Musclera
  ('b580631a-97ef-48fc-a9c1-debca6d384ad', 'd4fce18e-441c-4935-b2a5-110ff00e7650'),
  -- Montaña Amarilla (Arona) <- Punta de Montaña Amarilla
  ('1c49bf5b-2f4c-4461-85ff-6abed5926a17', 'a6221507-1873-4a7f-ab21-fd50dd1b32dd'),
  -- Playa San Bruno (Ayamonte) <- Playa San bruno
  ('01514d96-2a49-46e3-a716-6d9520dba5a2', 'a5754e81-1a77-4d28-a3ab-874677554074'),
  -- Parc de Montigalà (Badalona) <- Paraje natural Parque Marina Montigalà
  ('dc07425c-f54b-4a06-9531-f0ad3d437f71', 'c497d220-bf5e-4b1b-b42a-c1ea8a4440a1'),
  -- Puerto de Badalona (Badalona) <- Zona puerto de Badalona
  ('8dbc107d-ba88-4f2a-8a8c-5b20ed8e236f', '4046f30d-60ba-4774-8f0e-8ca20d71c98b'),
  -- Hierbabuena (Barbate) <- Playa Hierba Buena
  ('0ed1cda1-b913-40c7-a5ec-9843fb28eb71', '07a5e9fc-404f-4ef3-8a00-3b22339bf369'),
  -- Caminos de Vallvidrera (Barcelona) <- Baixador de Vallvidrera
  ('6eb57760-ae7c-4f4f-a3b4-342e9917cd07', '4e769a68-8463-4882-b1c4-c1957e753572'),
  -- Carretera de les Aigües Cruising Area (Barcelona) <- Carretera de les Aigües
  ('954e1f6a-fd38-442f-bdb6-b57cd01a46d8', '9db0b092-8726-4083-8ffd-402e6033f89b'),
  -- Lavabos Estació Sants (Barcelona) <- Lavabos Parking Estació Sants
  ('63fd4841-9b2a-4f26-bed2-b491e613ed1c', 'aa7bc8ca-a3f6-4662-bf6b-14e775994147'),
  -- Montjuïc Cruising Area (Barcelona) <- Montjuic | Montjuic - Barcelona | Miradores de Montjuïc | Parking de tierra Montjuic
  ('f3c1d58a-f811-4e91-8691-33852cd1bdaf', '08268074-21c1-49be-9253-30ad57c4ca3c'),
  ('f3c1d58a-f811-4e91-8691-33852cd1bdaf', '808ea603-5ff8-46dc-8e9c-6e4a43af2ece'),
  ('f3c1d58a-f811-4e91-8691-33852cd1bdaf', '91fe125a-08d0-4576-953f-c6ec09fda788'),
  ('f3c1d58a-f811-4e91-8691-33852cd1bdaf', 'ef1c49f3-3352-4229-b607-5af098fddf40'),
  -- Nou Barris (Barcelona) <- Parque Central de Nou Barris
  ('17d7a6e0-c6f2-4c49-9a13-66dc8dde397d', '40772788-398f-4d73-8751-e15af1a2400a'),
  -- Parc del Poblenou (Barcelona) <- Parc del Centre del Poblenou
  ('d75d0ba5-ffad-4513-936e-d4a6bf482f2e', '6a8387e6-4258-43ee-936d-43d4b163b2e9'),
  -- Torre Baró (Barcelona) <- Debajo de la torre eléctrica de Torre Baró
  ('402906f5-8513-4f5c-a1e0-f706208b15e6', '74ba98b2-2125-48b8-ae16-5e339f600fbf'),
  -- L’Aigüera (Benidorm) <- Aseos de L'aigüera
  ('0522f069-33f6-49a1-975f-53990f7bb8ed', '4636d73f-85c9-433a-aff2-5db3aa63afa8'),
  -- Gorliz (Bilbao) <- Faro de Gorliz
  ('94bf930b-d6bc-4987-9441-b86ece590835', 'f2fbf98b-42b0-4ab7-98ea-85703a938f12'),
  -- Mega park (Bilbao) <- CC Megapark - Barakaldo
  ('22941eb9-d215-450e-b5d6-44151287be74', '258703be-35e3-4d91-86e1-5fc3a520d9f5'),
  -- Parque de Dona Casilda (cruising) (Bilbao) <- Parque de Doña Casilda - Bilbao
  ('c15f1a9a-e7a8-49a4-b1e4-a2c0990298a8', 'aea61835-98ac-401e-a9a3-b2b0283dc427'),
  -- El Castillo (Burgos) <- Parking de tierra del Castillo
  ('69114e10-6f1e-413e-ae8f-0dff26a03de1', 'ec0ee370-bd29-4848-9009-249d5ae2e50e'),
  -- Área de descanso Cigales (Cabezón de Pisuerga) <- Área descanso Cigales dirección Valladolid
  ('26e3ca06-2f12-4065-9038-dab451ee8606', 'd5ff3859-45b7-4e33-a9b5-c06130d9d5da'),
  -- Vega del Rey (Camas) <- WC Parque Comercial Vega del Rey
  ('16e63c7b-f3ee-422c-9915-c19971fa28aa', 'eaf7215b-5dfd-497c-9f44-2c522755740e'),
  -- Puente Medieval (Colmenar Viejo) <- M-607 Puente medieval Cerceda
  ('2eb9aeaf-7c0d-40de-a914-f93e61c19996', 'ffaba9d1-91df-4fcc-b1b8-6582719a9677'),
  -- Área descanso GALP (Elche) <- Pinada área descanso
  ('4738e0e9-baa6-41d8-9ad8-35cac3de5cef', 'cb8e32b2-3216-42a5-a6ea-b7a17a520167'),
  -- Esmelle (Ferrol) <- Zona dunas Playa Esmelle y pinar
  ('31d3cf59-75d2-4839-ac6e-aa0be4072a54', '0effed8f-58b2-4e1a-b74a-1dd660cf96fe'),
  -- Playa de Llás (Foz) <- Baños de la Playa de Llás
  ('25633acf-fbf0-4850-8b4e-802ed1351640', '0cf1a152-5c5a-4ceb-9b35-b1d73c38f1ac'),
  -- Los boliches (Fuengirola) <- Los boliches recinto ferial
  ('3c25b2ad-2c0d-4162-83a4-66e924941b64', '9c7bed63-cca3-496e-b249-d89e7ddc830a'),
  -- Baños Parking C.C. Plaza de la Estación (Fuenlabrada) <- Baños planta del medio C.C. Plaza de la Estación
  ('269232cf-8bd5-492e-9071-eec6ee5ce6e9', '7b73c920-200a-42d8-992a-dbafea0617aa'),
  -- Parque Calvario Beniopa (Gandia) <- Calvario de Beniopa Park
  ('520d7d57-88d0-4e42-b064-ca04701a09d3', 'ed92f0bf-0ea9-4920-b7c3-ddf42f47e911'),
  -- San roque (Garachico) <- Plaza San Roque
  ('3e10750a-fe3f-4fb4-b053-cd471714586c', 'b6769a4e-d0dd-4585-b9db-e536813fff81'),
  -- Parque la Alhondiga (Getafe) <- Parque la Alhondiga, alrededores del lago
  ('c79acea9-300b-4b78-8f64-530fc95e404f', '55bacf48-dc36-4363-9dea-b19ec58eb273'),
  -- Pinar Arroyo Culebro (Getafe) <- Arroyo Culebro Nassica
  ('07766e81-e7ac-443e-a20b-0f26a8bc1376', 'a3939aed-8804-47d9-8884-de3ad800699c'),
  -- Playa Azkorri (Getxo) <- Área de aparcamiento Playa Azkorri
  ('c834d051-2f42-4796-b26a-7cb1f492c806', 'a31f308c-b68e-476f-a566-ff36cc79dd74'),
  -- Chana (Granada) <- Parque de La Chana
  ('31a48fa2-5bd7-4fa1-ab63-2752fadebd93', '752dfb1d-a803-4406-b3cb-75e8787919bc'),
  -- Puleva (Granada) <- Rivera del Río Genil, junto la fábrica de Puleva
  ('09f7c3e3-9cf2-4953-bd0d-d77e1e3ddec1', 'bd67af8e-6087-4a43-8988-799699ddb609'),
  -- El Sotillo (Guadalajara) <- Sotillo - Guadalajara | El Sotillo Poblado Villaflores
  ('7598a091-5189-4d12-8de6-72c0ca2f6dc1', 'd7f8078d-2be3-4c9c-84e8-367720b20cdd'),
  ('7598a091-5189-4d12-8de6-72c0ca2f6dc1', '3b09675a-ce22-462f-9665-6c0182261c27'),
  -- La Farga (Hospitalet de Llobregat) <- La Farga Centro Comercial | Parking La Farga (Planta -2)
  ('22d17fbb-17b8-4b44-b9a2-846c6289a344', 'c783f066-1877-4612-81bf-492991ebe987'),
  ('22d17fbb-17b8-4b44-b9a2-846c6289a344', 'd5f7cef0-a852-47af-b167-21336a2ad381'),
  -- Rec (Igualada) <- Rec
  ('3bbc2b1b-b40f-43bf-bb8e-7571dd5ebf3a', '3292dd03-9b7d-48ea-9638-0333bb2a7965'),
  -- Aeropuerto (Jerez) <- Servicios Aeropuerto de Jerez
  ('1e533b4e-53e5-4396-854b-fdab5beca88d', 'c16b1b93-8a8f-4d18-b028-5385cbbc9367'),
  -- Las Aguilillas (Jerez) <- Parque de la Aguilillas, parte izquierda
  ('29688d26-cc02-4357-b9cd-f6fa9134628b', '33b46534-b72b-46ed-a0ef-0762e873991d'),
  -- Camino a Isla Perdida (Las Palmas de Gran Canaria) <- Barranco Isla Perdida
  ('48efb26e-bc9a-44ec-8008-283081bc0184', '099e88ae-8eae-4655-873b-9e3c96b0a700'),
  -- Estacion de tren (Lebrija) <- Estación de tren abandonada y debajo del puente
  ('1bac6107-f7c4-42ff-b2a6-44932642f447', '661bedb5-fdfe-4af3-b04e-5bed3251dd26'),
  -- Arroyo Butarque (Leganés) <- Barrio de la Fortuna, Parque Arroyo Butarque
  ('2f88c948-94d5-415d-948d-a14615b6af69', 'd7758877-706b-452e-9a91-427a7c9377ee'),
  -- Mendibile-Leioa (Lejona - Leioa) <- Mendibile-Leioa
  ('0387f053-2a67-4728-9a1b-292765df86fd', '32d9b214-09ba-4c3e-93c1-b2810d8f6f2f'),
  -- Parc de la Mitjana (Lleida) <- Parc de la Mitjana
  ('298149fb-dc5d-4a0c-aa9b-efaf84191783', 'c9691504-082d-44d4-860a-fbca9362ab1e'),
  -- La Boadella (Lloret de Mar) <- Cala sa Boadella - Paya nudista y bosque cruising
  ('3ad511bd-80cb-4d2b-9c0a-3853201bb5c2', '9cd8f0b6-1c3b-41d9-91f9-ceea882639a0'),
  -- CC Trocadero Los Llanos (Los Llanos de Aridane) <- Centro Comercial Trocadero
  ('07697fe4-e20b-4805-b874-6e42d661fedd', '090103a3-9943-476d-9f2d-7316e11930d8'),
  -- Playa de El Remo (Los Llanos de Aridane) <- Playa de El Remo
  ('e3090ef1-a8fe-4069-aee7-4b6a3a2240c0', 'bb447000-c8e5-4f17-b0c9-3963242eca12'),
  -- CC As Termas (Lugo) <- Centro Comercial As Termas
  ('183ed7ab-0fbd-4549-8d11-65c4150798b4', 'a305b5bd-ad95-49a6-bd1c-ebb2fad33108'),
  -- Baños de la estación de autobuses de Méndez Álvaro (Madrid) <- Jardín detrás de la estación de autobuses de Méndez Álvaro
  ('b14b3dd2-44e2-488f-ac3c-5aa583b4a6b0', '31e3936a-beaf-446c-b766-e3bce673087b'),
  -- CC La Ermita (Madrid) <- Parking Centro Comercial La Ermita
  ('f48b9b93-0e2c-4ae8-917a-b6bf26b2c75d', '04920b14-7cdd-42dc-b745-1b8126aaab87'),
  -- Casa de Campo (Madrid) <- Casa de Campo Cruising | Casa de Campo: Zona del Zoo | Casa de Campo: Pistas de tenis | Casa de Campo: Cerro de Garabitas | Casa de Campo: Aparcamiento del Teleférico de Madrid | Casa de Campo: Senderos cerca de Torre del teleférico
  ('cbd906d8-e20e-4952-898f-c70e22f04f69', 'c2f97c3f-5da9-4210-981f-0a9b662ed3dd'),
  ('cbd906d8-e20e-4952-898f-c70e22f04f69', 'd6de43dd-6e64-4b4d-9b24-dba6ada46802'),
  ('cbd906d8-e20e-4952-898f-c70e22f04f69', '9d0adc50-340d-4d04-8a69-7b2c2c32fcec'),
  ('cbd906d8-e20e-4952-898f-c70e22f04f69', '058b1bfb-1e26-43c2-b172-a01ae8af166b'),
  ('cbd906d8-e20e-4952-898f-c70e22f04f69', '73086d3d-0f93-4c94-a040-29c40d61aa23'),
  ('cbd906d8-e20e-4952-898f-c70e22f04f69', '085067c4-53b1-482c-88b8-f79e326dacff'),
  -- Centro Comercial Alcala Norte (Madrid) <- WC Parking Centro Comercial Alcalá Norte
  ('46071354-912c-49ee-a8b5-2d320dc06ba2', '9d773572-006a-4d29-a03a-8336024e10be'),
  -- Madrid Río (Madrid) <- Arbustos Madrid Río
  ('82f00b59-bf61-4cac-a319-53e68e7e5a43', '81e8a7ff-fda7-409d-9ff0-6127195122a7'),
  -- Parque Lineal de Palomeras (Madrid) <- Moratalaz - Parque de Palomeras
  ('830fdd33-48c9-4641-8a08-50a0146d1a23', '9da8f174-51c8-4144-b98d-d652837e843d'),
  -- Parque de la Cuña Verde de Latina: Punto Limpio (Madrid) <- Parque de la Cuña Verde de Latina: Calle Caramuel
  ('3ac76c68-9d1f-431f-87bb-9802f81e0558', '4517c226-1374-4d49-8218-55c117920e6f'),
  -- Parque del Oeste Cruising (Madrid) <- Parque Oeste | Templo de Debod y Parque del Oeste
  ('972ebbc1-c056-4f86-b911-3949ef4efaba', 'd0ac3b71-95d6-469d-b923-e49f9a6398b3'),
  ('972ebbc1-c056-4f86-b911-3949ef4efaba', '9d9f9cbd-1e54-4fc4-95cc-887eb75ebb40'),
  -- Rejas (Madrid) <- Rejas Campo
  ('6f7fa322-0add-4c75-a704-882bfc9f71f8', '95e0481c-0e85-418c-b03c-1da7a4a8d8e6'),
  -- Centro Comercial Gran Plaza 2 (Majadahonda) <- Exterior del Centro Comercial Gran Plaza 2
  ('10a84f24-ab0b-440f-b591-ec9bc68daa38', 'e7444940-de2c-473f-8f27-3147654a7fa2'),
  -- Baños Marina Banús (Marbella) <- Baños del paseo marítimo de Puerto Banús
  ('1a42576f-1655-4532-a3a8-ef062b3ecf9e', '8b90fc81-a931-43ad-84d0-60104cd8b065'),
  -- Cabopino (Marbella) <- Cabopino y dunas de artola
  ('e9b53766-4093-4f6b-94a7-a81841e6cbad', '34347c77-aeb3-4ee7-a383-906a806c5722'),
  -- C.C.Cita (Maspalomas) <- Baños C.C. Cita
  ('207b2393-92b2-411e-b139-2638675df396', 'eca243dd-0b14-4298-a2b4-ff5a1ad7f774'),
  -- Cruisebar (Maspalomas) <- Cruise Bar
  ('d4a1fec0-f6ce-4f90-9f7b-8a6a8594b6fe', '017605c0-2bf8-4be2-9ed7-adac5b09cfe9'),
  -- Maspalomas Dunes (Maspalomas) <- Dunes | Dunes - Camel Station
  ('7af8d258-19fd-4547-81d8-739d36e03bfe', 'dc5bc601-81fa-4ff1-a13c-3285d5fdb343'),
  ('7af8d258-19fd-4547-81d8-739d36e03bfe', '02bebe5e-a9a6-47c4-928e-82ef79ebe5ec'),
  -- Beach of Meliana (Meliana) <- Playa de Meliana
  ('51481af6-0a1a-4221-ae06-e29219ea1f45', '650e0e71-947e-4dbe-b53c-371f01f7f472'),
  -- La Fuensanta (Murcia) <- Aseos La Fuensanta
  ('3fbc7f44-07ce-4837-b3e0-cbb037540cc3', '4daf3099-e414-4fae-9578-8da79b19b811'),
  -- Los Dolores (Murcia) <- Puente de los Dolores bajo las escaleras
  ('74871779-39d3-4f10-90e5-16e26f7576fc', 'e7e44504-09a7-41c0-8f79-39adfdf934ff'),
  -- Nueva Condomina (Murcia) <- Baños de la Nueva Condomina | Parking Zona CC Nueva Condomina | Detrás de Media Markt de la Nueva Condomina
  ('95843385-3cf9-4d27-8cfe-782bf399b9bf', '170cfe30-4dba-4456-9a01-b9f8770b032a'),
  ('95843385-3cf9-4d27-8cfe-782bf399b9bf', '69efdc0f-e7c0-489f-a275-f9e535bd5c06'),
  ('95843385-3cf9-4d27-8cfe-782bf399b9bf', 'dce23590-d7fa-4720-bd57-70333415f555'),
  -- Parking Malecón (Murcia) <- Paseo nuevo del Malecón
  ('665edc57-083f-4ca2-848f-b326d1e7855b', '13ac54e6-1cfb-4cc8-81fb-31309ec286c9'),
  -- Aeropuerto (Málaga) <- Baños aeropuerto | Mirador Aeropuerto
  ('a73369f4-6600-4b76-9f44-b2c43f307887', '2add19af-dd70-4434-87dc-96e3b785e4a3'),
  ('a73369f4-6600-4b76-9f44-b2c43f307887', '78721c30-0514-4a2e-9c0c-315006c62ff5'),
  -- Area descanso Pantano del Agujero (Málaga) <- Pantano del Agujero - Embalse de El Limonero
  ('de871586-f612-4608-89cb-95817ca3032f', '5ce427ff-304b-4360-8e0c-d7c35e6a5e12'),
  -- Baños parking Vialia (Málaga) <- Baños junto al cine del Vialia
  ('c4e1d87e-620f-46d8-bb5f-478836c2b93b', '90b01024-a4fe-4b6b-9efa-a746bc192f6f'),
  -- Rotonda Puerto la Torre (Málaga) <- Canal Puerto de la Torre
  ('510118d6-43e9-4e4e-bc38-5e4c122c5b50', 'dd9e5f2b-e569-4561-8dfb-440f636a90c5'),
  -- Fuensanta (Móstoles) <- Baños del CC la Fuensanta | Centro comercial Fuensanta
  ('0a7064a5-c18e-41d6-b9a1-d75a8af4e49b', '7cc19b54-6fc3-4b6b-8f3d-94022cfcf69a'),
  ('0a7064a5-c18e-41d6-b9a1-d75a8af4e49b', 'b8c386c8-2d61-4687-b2d4-009b9d46c205'),
  -- Hospital universitario (Antiguo) (Móstoles) <- Aseos del Hospital Universitario
  ('04a76a42-ca38-4c94-a0db-ffe55d197578', '76eddbef-41ba-4a78-b0c7-642c21f4e546'),
  -- Parque Finca Liana (Móstoles) <- Parque Finca Liana (OUT)
  ('31c0f297-3eae-4033-b668-8bf6277ed066', 'e9db1147-d452-4d4a-a3df-3c4bad3519c1'),
  -- El pinar (Navalcarnero) <- El Pinar de Navalcarnero
  ('07d573dc-7d3b-44df-9bb4-5b698eabc900', '6072cc35-a72e-4658-a6d9-306694c8f935'),
  -- Debajo del puente de la N-340 (Nerja) <- Descampando por debajo del puente N-340
  ('85874890-205e-4bc0-acc9-514370f88208', '06b0c20f-29d4-49c1-b363-ce04bae7a182'),
  -- Desvío 340 (Nerja) <- Desvío N-340 dirección Nerja
  ('e5eabf9a-686f-49a1-8628-a6483467788a', 'e14577f2-5e57-42b3-bbc0-0c97a9a954a9'),
  -- Dehesa de campoamor (Orihuela) <- Dehesa de Campoamor
  ('147bad9b-7677-4ca6-9e20-331f57844774', 'e5d15573-49ef-4dd2-8bf8-f9915981c6b4'),
  -- La Monjoya (Oviedo) <- La Manjoya
  ('0f41f4ee-d0fa-4652-ad1c-8f1d3f8c91f1', '07e12cf5-5b55-4ff0-8352-50a61e168525'),
  -- Parque de Invierno (Oviedo) <- Baño Parque de Invierno
  ('062a8c9c-4648-4571-8856-dcd62a6dd929', 'e1633710-4b45-4cf9-81e5-a566b4abafdf'),
  -- THE HOLE´S (Palma) <- The Holes
  ('e7a883e5-29c7-4206-a2c7-3cb45207cd25', 'accb3f0b-d320-4847-bf07-5834bb3276b0'),
  -- Parking CC El Ferial (Parla) <- Centro comercial El Ferial
  ('2b41cb8d-2c5e-4b91-9ef4-16f5c6382971', 'b5a27ffd-1027-4a7e-8660-143ece86ddc8'),
  -- Final polígono Táctica (Paterna) <- Arbolada quinta rotonda Polígono Táctica
  ('37f59aed-0ac6-4afb-8bba-9d4a48416cf7', '21cd08f4-e335-4f32-9b73-8793c3476926'),
  -- Pinada (Paterna) <- Pinada Parking
  ('458c9b9a-26e0-413a-9c56-3f73c9b3b067', '6fbaf270-d2c8-4f6d-b102-4df2ecb09b78'),
  -- La Algaida (Puerto Real) <- Pinar La Algaida
  ('0cc51c5f-92aa-40d0-9f32-b03c4145ed64', '759b7333-475d-42bf-bbbf-4d21d0f84514'),
  -- Las Palmerillas-Roquetas de Mar (Roquetas de Mar) <- Palmerillas - Estanque de los patos
  ('0f7009b9-fd91-46b0-8792-199ea2597302', '26af7e2d-e1db-40e3-939b-a4e8ff490e65'),
  -- Castellarnau (Sabadell) <- Castellarnau (coche)
  ('65569968-c0c5-4501-9ec8-4830b037e2e2', 'add211ec-3fad-4c83-9074-34e4c5a1ade9'),
  -- Torre-Romeu (Sabadell) <- Polígono Torre Romeu
  ('156ed95f-7715-4672-97a2-f53fa2a0384f', '6554c400-5877-4a80-a454-6348d2a22a37'),
  -- Playa de Almardá (Sagunto) <- Playa de Almardá (nudista)
  ('2558260f-e8af-4ae2-be59-baeae238e232', '20f769bc-5fb5-40a6-9d75-ce3190d828ce'),
  -- Área aparcamiento Araeta (San Sebastián) <- Aparcamiento Sidreria Araeta
  ('2fc9ddab-da37-4dad-98cc-be64979b24ed', 'd21e1d64-56bc-4e54-b1d0-22113098e125'),
  -- Dehesa Boyal (San Sebastián de los Reyes) <- Dehesa Boyal | Duchas vestuario Gimnasio Dehesa Boyal
  ('1d4c2430-f3a4-4427-ae78-01b1846d0b12', 'eb85aa4f-a9e6-4bba-b51a-dce6d25cce76'),
  ('1d4c2430-f3a4-4427-ae78-01b1846d0b12', '6dacb731-33f1-4f1a-809e-dde433f71367'),
  -- Centro Guadial (Sanlúcar la Mayor) <- Guadial (Huevar del Aljarafe)
  ('c9cbba12-d2bf-49f0-9c8b-c8c412732c4c', 'aae7cb5a-5e7b-4180-8e1a-15f1b7f41c1b'),
  -- Baños Leroy Merlin (Sant Cugat del Vallès) <- Zona oscura Leroy Merlin
  ('448f49be-fdf3-4f3d-bf80-44f3a3cca62a', 'b56f46ca-9cf3-42f8-a106-e42c8dcf70f3'),
  -- Camino (Sant Cugat del Vallès) <- Camí de la Salut
  ('2e682dea-03c5-44d0-898e-1b7e02e7b1ba', '5b6254d2-1db5-4a30-b8f1-7a6dd22fd88e'),
  -- Galdar (Santa María de Guía de Gran Canaria) <- Entrada a Galdar
  ('270a2717-1aea-46cc-a955-719caa561740', '79e24309-5fb2-45f7-a78c-70a840eede08'),
  -- Bomberos (Santa Perpètua de Mogoda) <- Bomberos Mollet | Área de bomberos Mollet
  ('143920d5-1b4e-4744-9b30-4b836a02d1b8', 'b6de85f0-c4eb-4f12-9ca6-a4ff3905cd00'),
  ('143920d5-1b4e-4744-9b30-4b836a02d1b8', '27208f4f-1d20-45b5-b4d7-958e6eecb7e6'),
  -- Baños centro comercial Peñacastillo (Santander) <- Salas antiguas cine Centro Comercial Peñacastillo
  ('522c6814-f8a1-45ca-945c-7b4faeb07beb', '2f462c49-c8f9-4251-9157-fa31beb1130b'),
  -- Callejón (Santander) <- El callejón verde
  ('5bdf14f4-84f4-41e2-b900-b349a7d9066d', '0c823a59-fc61-48fa-8e83-d15512af995d'),
  -- Dunas de liencres (Santander) <- Pinares de Liencres
  ('3856b7be-947d-4c76-a43a-16854c9a0e12', '3f957580-4ed2-414e-852e-8c838e1f1f37'),
  -- Liencres Bosque / Parking (Santander) <- Dunas y bosque de Liencres (Ría de Mogro)
  ('a0afe692-b1d0-485f-916a-f92ea43a8236', '0e078ba0-63f0-4208-998c-11bcae5434b9'),
  -- Parking Facultad de Derecho (Santander) <- Baños (-1) Facultad de Derecho
  ('37cdba40-9778-42af-ac29-ca9c723d3e91', 'e5edbf78-5137-4f12-a65f-c48f93b27783'),
  -- Aldea Nova (Santiago de Compostela) <- Aldea Nova (Antes de la gasolinera)
  ('049ebd7e-c2e2-4ff3-b016-302de4aa04e6', '7b0ea965-1112-41c9-be72-72d5a472d235'),
  -- Parque as Cancelas (Santiago de Compostela) <- Centro Comercial As Cancelas
  ('ecc9e749-25b4-44dc-b9e5-c9f5483ec1c1', '661d3525-419d-4351-8ca1-bee5c48f7e05'),
  -- Guadalquivir riverbank (Alamillo-Cachorro) (Seville) <- Jardines del Guadalquivir
  ('dcfc225f-139c-43b8-b407-2708fb6473f2', 'f47cb7fe-d1b3-4f16-9c24-c5724588bcdd'),
  -- Hospital Militar (Seville) <- Azotea Hospital Militar
  ('34786efb-d71a-4686-87a7-8cb53a66a455', 'b3daeaa6-bb62-4aa8-91b7-48691222ba98'),
  -- Parque de Maria Luisa (cruising area) (Seville) <- Parque de Maria Luisa
  ('5d065cf3-5006-4a29-b9c7-fb10767f0407', '6a18cf5f-7056-4f01-99d7-ffd3d19dbee9'),
  -- Industry Cruising Bar Sitges (Sitges) <- Industry
  ('b51bd513-4fc5-4be7-ad1d-50a825fba157', 'd3fc3dca-3bff-4ba8-9c1c-00e67c77035f'),
  -- Massis del Garraf (Sitges) <- Cortafuegos de Las Roquetas - Massis del Garraf
  ('4028a4c5-fe04-4146-9528-ffbb8f1828f7', 'b9cacecc-0bdc-4bb8-a7e7-a4ac4fd3c6a9'),
  -- Parking de la Atlántida (Sitges) <- El puente Dolce/Atlantida
  ('093be836-c7d3-45f8-bb10-20b19215b0af', '3de201eb-c282-4f27-bef4-f63ea0ea7311'),
  -- Baños Centro Comercial Altamira (Torrelavega) <- Baño del C.C. Boulevard Altamira
  ('c3c1bd95-d5b3-482c-a0c2-376c04754101', 'f56fe8aa-69c6-4a10-adc4-39605181c926'),
  -- Alcatraz (Torremolinos) <- Alcatraz Men’s Club
  ('d6608f7e-57cb-44a2-8fb3-40f0d681a101', 'bbb1cc03-825d-45c0-a646-9a7d9de83257'),
  -- Exxxtreme / Conexxxtion (Torremolinos) <- Exxxtreme Cruising Club
  ('e47600ab-5192-4a3a-9bc3-f2b075eb923b', 'b17325af-66bb-420a-a84a-493ac7166c7f'),
  -- Parc Central (Torrent) <- Pinos Parc Central
  ('3ef20135-51ee-4ded-a657-c41ff050ae00', '1013a0a5-b173-471c-a865-f925564b4d39'),
  -- El Pinet (Torrevieja) <- Playa El Pinet
  ('5194f75a-6b23-42e6-8664-2e825625569f', 'ff1ef071-65b4-4892-8758-d7ebe01f0d16'),
  -- La Zenia (Torrevieja) <- Aseos del centro comercial La Zenia
  ('c7f9a6cf-9a3d-4653-9a35-01c0e0381e62', '0297dcf0-c474-4c03-b196-b9b00384a2a6'),
  -- Punta Prima (Torrevieja) <- Punta Prima
  ('f221a782-3cba-4062-9cf5-acc01e19b8bf', '8818d685-476c-472c-873f-8c173774f318'),
  -- Gola del Ter (Torroella de Montgrí) <- Gola del Ter SUD | Gola norte del Ter
  ('0e67b4b5-16f4-4955-8aa0-0e79d51b4b4b', '090d7245-86ac-4281-81ee-2668ea9aae77'),
  ('0e67b4b5-16f4-4955-8aa0-0e79d51b4b4b', 'a0f710fb-93ee-4cdb-8ca7-de90756eede2'),
  -- Las calderas (Trescasas) <- Entrada al camino de las calderas
  ('08c26fbb-2c6e-4f3c-b23c-69d01d56c4e5', 'df98a3b2-dfca-42a0-b8f8-e6d2c90dfd1b'),
  -- Santa Quiteria (Tudela) <- Santa Quiteria
  ('c10dce51-9b85-4e0e-a1f8-86beec4a0b5c', '9f6e8c78-a9c2-4711-8388-c1e5a0cefbec'),
  -- Frente a Nuevo Centro (Valencia) <- Servicios Nuevo Centro | Parque de Tendetes, Nuevo Centro
  ('e8719681-767d-477b-8b67-0a82eb16ac6f', '14bf6d3c-c059-44d0-ae2d-c6912be977f6'),
  ('e8719681-767d-477b-8b67-0a82eb16ac6f', 'c5771b56-1938-431e-9540-76ef7766819a'),
  -- Homens SEX Bar (Valencia) <- Hòmens
  ('1e3cbd89-1fc4-41fe-8765-2b8bccb61c5c', '476cd6ea-cb5d-458e-be1e-74ebf3d2d63b'),
  -- NUNCADIGONO Sex Bar (Valencia) <- Nuncadigono Cruising Bar
  ('d202994a-020b-452e-92f9-59327f761e9b', '2a5b2c0b-0738-41c3-8f3e-1bbebb70f706'),
  -- Parque de Cabecera (Valencia) <- Lago Parque Cabecera
  ('dfe02447-9932-40ef-8705-ac5909a23c6c', '7ab658e7-ee3c-4c1a-8f2c-f7b2df6dee7d'),
  -- Playa natural Pobla Farnals (Valencia) <- Playa de la Pobla de Farnals | Rotonda de La Puebla de Farnals playa
  ('2d7b01fd-6a7b-4975-a744-513791d090ab', 'efe8e685-de08-4886-b5f0-b8d09ecad27a'),
  ('2d7b01fd-6a7b-4975-a744-513791d090ab', '123132b3-3c3c-4250-b0a9-73e530db0cc8'),
  -- Playa nudista Pinedo (Valencia) <- Playa nudista Pinedo
  ('4e568d5a-a297-4b37-819f-f325e47ef2d6', 'fb6dc56a-172e-4e06-aa79-d6e367303208'),
  -- Rambleta Park (Valencia) <- Parque Rambleta
  ('0fcf408b-bda6-45f9-851a-714b1062d362', 'c598c0f3-1106-4909-870f-b5ea4f16671b'),
  -- Turia River. (Valencia) <- Turia Cruising Zone
  ('b6a9a878-5810-4d27-ad04-9d558e1562cb', 'b8479d42-7ce7-4827-9234-b0d4e217aa3b'),
  -- Wc Hospital Peset (Valencia) <- Parque Hospital Peset
  ('c648d35a-b089-427e-834a-5e0a3833e858', 'c42fef50-0473-4745-9848-2ddc8925f8f9'),
  -- tête-à-tête (Valencia) <- Tête-à-Tête Cruising Bar Gay
  ('8822fe6f-811a-4e29-95af-518c0deaa4de', '00badb83-7cb4-4f04-a73d-eec1805c624a'),
  -- Aparcamiento de camiones (Valladolid) <- Aparcamiento de camiones FASA Valladolid - Pgn San Cristobal
  ('1e59649f-764f-4d5e-a5de-dcbe5b34c663', '3a1b65ce-10fd-485a-ba7f-7cb0404e4e04'),
  -- Moreras (Valladolid) <- Parque de las Moreras
  ('6f0d0e3d-9527-438b-b507-624e52d15888', '37d16fb8-b00a-4cc5-8964-ce36e0b2a541'),
  -- C.C. Travesía (Vigo) <- Travesía de Vigo
  ('692bbaab-f597-4067-b593-ed870d849776', '6ff379d4-e6d0-4450-9eab-4dbfbc4b27ac'),
  -- Monteferro (Vigo) <- Monteferro
  ('5209167e-f1b2-41dc-a22c-1a70ad3dd42a', '1211b8a1-16c3-4538-a3c2-de8f6cecfb20'),
  -- Pantano Amadorio (Villajoyosa) <- Embalse Amadorio
  ('f44ef292-0782-482c-ac2d-ed38a3f5f36f', '57c4d922-75d2-4b4e-9240-bee685039443'),
  -- Baños del Ingenio (Vélez-Málaga) <- Baños C.C. El Ingenio | Parking del C.C. El ingenio
  ('594ab4ef-c2ad-47e8-89b6-1c05a4e4c797', '082ada3a-4e5e-41bb-a4fd-0ee9bc6d4933'),
  ('594ab4ef-c2ad-47e8-89b6-1c05a4e4c797', '5658c8b2-f971-424e-8673-aa414677af8f'),
  -- Rio Vélez (Vélez-Málaga) <- Cañas Rivera Río Velez | Desembocadura Río Vélez | Desembocadura Río Vélez 2
  ('2f3eba84-45bd-453b-b69b-2897101ec557', '5a6c3c0f-8ad5-494a-b261-4cd1e44e4189'),
  ('2f3eba84-45bd-453b-b69b-2897101ec557', '98f96d05-98bd-45c5-a323-b4ff21a82a78'),
  ('2f3eba84-45bd-453b-b69b-2897101ec557', '97da3285-303a-4613-84f8-39a5dc9fbd22'),
  -- Baños Plaza del Pilar (Zaragoza) <- Parking Plaza del Pilar
  ('e021077b-022d-4c2a-ac56-6b3cc1a7483e', '1afaecf9-8ab2-40c1-9313-ecd79a17d920'),
  -- Centro Comercial Puerto Venecia (Zaragoza) <- Torre con vistas Puerto Venecia
  ('f4036e2a-d3cb-429e-86f9-7d044cd10d9f', 'f08eb625-a92f-45c5-a853-96394c45667e'),
  -- Pinares de venecia (Zaragoza) <- Parque Pinares de Venecia
  ('c4e20d30-6e19-42a8-8c41-95fec8c90bb4', 'dabbdb7c-fc2c-44a9-850d-d30f14875168'),
  -- Polígono Portazgo (Zaragoza) <- Frente Polígono Portazo
  ('19fdffc1-30f5-4bdd-bdab-6f88bd6c1e76', 'a9c8766f-f861-469a-90b3-10a48848ad79'),
  -- Francás (el Vendrell) <- Bosque francás
  ('bb31f3e4-9e9b-4983-9509-75425f9c4bb3', 'bbd0dc1a-b54e-4ea3-a260-ef178c0abc03'),
  -- Duchas pista de atletismo (la Vall d'Uixó) <- Duchas pistas de atletismo
  ('42bf040e-b758-4121-97bb-f4f3dbb2b69a', 'e117ac4c-62b2-4096-bdcf-2eebd9217ab5'),
  -- Antilla (no city) <- Parque La Antilla
  ('a6381bc2-3426-4f0c-ac54-d0dbde3f38c0', '223f2270-5798-4f21-8e25-ed43857babf2'),
  -- Aseos Monasterio de la Rábida (no city) <- Parque de Monasterio de La Rábida
  ('944a8094-02c8-4d51-93fd-3ea72a21d85e', '5cd7b420-7b87-4851-a812-3acbea6a9e03'),
  -- Avenida de montezenia (no city) <- Arboleda de Montezenia
  ('6979d5a6-d714-4d4e-ac1a-57923d37b112', 'c9895c9b-c0a0-4501-8ccf-968022cb9841'),
  -- Baladrar Beach (no city) <- Cruising Cala Baladrar
  ('29e42127-606d-445d-b7aa-55fd06d01112', '616b3003-9820-409a-ba78-0a8550db7226'),
  -- Baños Alcampo C.C. La Dehesa (no city) <- Baños del Centro Comercial La Dehesa
  ('7e1870df-8cae-4f6e-b823-77ee3879c4b6', '8b006929-069d-4053-bcac-e28a9aaf8099'),
  -- Baños Estación de Autobuses (no city) <- Paseo del rio, Campolongo-Estación de Autobuses
  ('e302403b-353c-4ba6-8ec6-0e38cca41d41', '26291d74-6914-4504-b868-d3d70123c49f'),
  -- Baños T1 - Aeropuerto de Barajas (no city) <- Aeropuerto Barajas Terminal 1 y 2
  ('fc04292c-0140-4b2a-b783-de02ba04b40d', 'd6b6cd8e-2121-4e3c-883a-391b430e3435'),
  -- Baños de Eroski (no city) <- Baños Eroski Niessen | Baños parking Niessen
  ('2631e129-d2bb-481b-a585-12a87db9dd65', '59a23109-f595-49cc-ab92-4f5f9e5ae821'),
  ('2631e129-d2bb-481b-a585-12a87db9dd65', '3ac900f3-8be9-4e3c-aef8-38b08f681fca'),
  -- Baños de Polvoranca (no city) <- Cerro de Polvoranca
  ('cad9f22b-1020-436e-9e34-cc3ebfeb83fd', '819e2db0-5533-4884-b8b7-323c45070e57'),
  -- Baños de Sant Simó (no city) <- Platja de Sant Simo
  ('dbb45ae1-8ac4-4079-83be-1b473611f19a', '28e52ca4-53cf-4d4d-9df2-c47921ec38f9'),
  -- Baños hiperfroiz planta 0 (no city) <- Baños del parking -2 del Hiper Froiz
  ('70221b97-dd2a-4123-a0a8-dfb96abf31fe', '17eed757-aabd-4676-9aec-d5b98d8831d9'),
  -- Bosque Pinos Santa María de Getxo (no city) <- Jardín de la Parroquia de Santa María de Getxo
  ('ba32ecc2-eddc-4a27-89d8-eec85797a43d', '9859ab6f-5d5c-42a7-ab19-a6c59ff8a895'),
  -- C.C. Xanadú (no city) <- Baños al lado tienda Apple - C.C. Xanadú
  ('de4044c7-7e72-4ef3-9bb5-709850b6dbc5', '8e643338-8e35-47d6-89a0-cb14347a33e8'),
  -- Cabecera aeropuerto (no city) <- Calas playa zona aeropuerto
  ('6f4869b7-df7c-41eb-92b0-4a5d2d241870', '845ef598-ca9d-4c11-a1d5-a6e7f5410ce4'),
  -- Calle Everest (no city) <- Everest End st
  ('d953deac-3448-4623-9d28-006bb0a072a9', 'bae2eb5a-262d-4759-87e8-fa4f6642c250'),
  -- Calle Francisco Rabal (no city) <- Calle Francisco Rabal 27
  ('f6ef5972-49af-4afa-bc9a-d2acbd1905b0', '4f2eb96d-0b5f-4d33-8937-6a1aea0387d5'),
  -- Calle de la Mediterránea hacia Cova Xoroy (no city) <- Calle de la Mediterránea hacia Cova Xoroi
  ('fcd2b31d-20bb-4f5c-91eb-121955067db0', '882ae97d-3142-49cb-ba1f-008a751bd6b1'),
  -- Camino La Lobata. Polígono La Hiniesta (no city) <- Camino de la Lobata. "Cuesta de los condones"
  ('979ffa3e-eccc-4b73-a01c-39d54e8ad992', 'f67e08bf-ca4a-4b3f-aea0-ad41f59496ae'),
  -- Cantarriján (no city) <- Playa nudista Cantarrijan
  ('e29e2379-8c06-4fc8-8a89-fba22c798808', 'fc4acc63-da83-4789-a63e-8b87046e1797'),
  -- Cantueña (no city) <- Parque de la Cantueña
  ('6fb59b17-6f7f-4d5e-ba31-681cd8ff4ab3', '0bb7d7fd-f064-4a02-9f84-85fab87cc61c'),
  -- Carretera Vieja (no city) <- Carretera Antigua Rambla
  ('4b53ec27-3b1d-424d-adf8-1e415be4d4ad', '481f195d-22c2-4fce-b35b-84bbdd38711d'),
  -- Cenes de la Vega (no city) <- Junto al río-Cenes de la Vega
  ('60ee3b65-5a53-4d62-b355-fd8853dc7641', '9e5d7261-1e50-4dac-af71-542cae86faf0'),
  -- Cerro de los Ángeles (no city) <- Polígono detrás del Cerro de los Ángeles
  ('fb24bb06-6fd3-4bfc-97cd-0835c9f9cb31', 'b788c51e-380a-46d3-b02b-55709861541e'),
  -- Charco Pandero (no city) <- Parque Charco Pandero
  ('5bd49c9c-ac32-415c-afc7-9a02d8c785bb', 'ce81da10-9886-4c38-8a7a-5f08678bd756'),
  -- Charco del Palo (no city) <- Charco del Palo - FFK Dorf | Costa sur de Charco del Palo | Viviendas abandonadas en Charco del Palo
  ('c2546c44-651f-43a0-99a7-3e5056cc530e', '322f4be5-ce36-4a6d-b7ae-1c66f683f324'),
  ('c2546c44-651f-43a0-99a7-3e5056cc530e', '0b444a5c-a948-47d4-bcb2-4f58f89e044d'),
  ('c2546c44-651f-43a0-99a7-3e5056cc530e', '641f6da2-f6c4-49a3-8994-2bc779ceefbb'),
  -- Clot de Galvany (no city) <- Camino Clot Galvany
  ('fffb6bc2-f72d-4b15-8a96-9827745c4f22', '6c38ff19-832f-4ad1-9374-8fa6cd53de6e'),
  -- Costa Calma (no city) <- Palmeral de Costa Calma
  ('18e4f405-52f6-450f-adf5-19ffa984a1e9', '1f139b67-6fa0-4c86-8853-3fa08adab5fb'),
  -- Delta, Rio Palancia (no city) <- Desembocadura del Río Palancia
  ('7c5137ad-88a0-4803-b991-bd85c65e0625', '239bbe63-05ce-4bb5-9179-34317fb500ce'),
  -- El Padrón (no city) <- Río Padrón
  ('f91c46cb-b8af-4a2d-8c03-ed5243d2857e', '920ab3b0-bbf9-4fbf-b154-e57f5ea07fcf'),
  -- El Tiro Pichón 2 (no city) <- En el Tiro Pichón detrás de Makro
  ('d867b744-fc21-47ee-a145-f9f0408819a8', '83a3e76b-1e61-4416-b4e5-e765410a689d'),
  -- El faro (no city) <- Faro de Calella | Mirador parking y arena de descanso Faro Calella
  ('8018177a-0588-409c-a200-4729acd069e6', 'a7dfd38c-b35e-4cda-8585-9065443d1f18'),
  ('8018177a-0588-409c-a200-4729acd069e6', '65ea7901-e21e-411c-ae0a-f427ca932b66'),
  -- Embalse de Pena (no city) <- Pantano de Pena
  ('ec0c47f6-114f-4b15-89aa-8cb2c1e801cf', '81d33ace-9c51-4c38-b2de-4bb0ebb97c45'),
  -- Erotikmarkt Denia (no city) <- Erotic Market Denia
  ('6456512a-d52f-48c5-a79f-1ded23023c19', 'b4d5d5a3-9305-45c7-9cbc-d0abf4f3db47'),
  -- Estación de autobuses (no city) <- Toilets en la Estación de Autobuses
  ('d86f49b0-92e5-433a-a4fa-f90019bfcaa9', '46693266-e567-4930-abf3-67da8377d0eb'),
  -- Frente Restaurante O Castelo - Vilasobroso (no city) <- Antigua fabrica enfrente restaurante O Castelo
  ('f6e63490-619a-4422-8d9b-f6d45cec50fe', 'c44dbc51-c946-4c58-b76d-ad88a71c5382'),
  -- Gran Turia (no city) <- Duchas Dreamfit Gran Turia
  ('d2178ef8-e860-4f16-a662-43c0713acd01', 'f912f295-0bce-4710-8baa-a35f580ebcdb'),
  -- Guadalmar Dunes Cruising Area (no city) <- Playa Guadalmar | Camino Playa Nudista Guadalmar | Playa Guadalmar y los Chochales
  ('bfd77069-566e-4371-a6fc-e37301aaf4fa', 'e1ecdc06-31d2-430c-9db4-03583acf7060'),
  ('bfd77069-566e-4371-a6fc-e37301aaf4fa', 'cfaaf2f2-6b43-46b2-af88-112f7f4fae79'),
  ('bfd77069-566e-4371-a6fc-e37301aaf4fa', '191bda31-d856-4ceb-80f2-9403ae556dc5'),
  -- Huerto de la rueda - Ramblar (no city) <- RAMBLAR (los domingos de 20:30 a 21:30)
  ('d251bc13-d41b-45ef-a238-3636a40f4a67', '76d8a9d6-4415-4f75-b4f5-02b4803b5818'),
  -- Jardines de Puerta Oscura Cruising (no city) <- Jardines de Puerta Oscura
  ('ef1a05b1-b58b-436f-b9f3-16affe5af316', '69450400-641c-49c5-8e21-1a898092edca'),
  -- La Breña (no city) <- Parque Natural La Breña
  ('b688287c-9217-4454-b6db-a6c6f490cd5d', '550872ce-54db-4dfd-9668-ec5acc46ff3e'),
  -- La Minilla (no city) <- Baños Centro Comercial La Minilla
  ('7ce35537-1163-45e7-9001-1187e624ccb8', '0039991b-2564-4e71-8f2c-c936b4ca015f'),
  -- La Perla (no city) <- Entrada a Urb La Perla | Urb La Perla, Estrella de Mar
  ('cb3f9889-c563-4cb7-8e1d-d92c5f8478a8', 'e29ae4f5-758f-490f-959c-b983873b389b'),
  ('cb3f9889-c563-4cb7-8e1d-d92c5f8478a8', 'd3828a3c-65e0-438a-8b84-c29b35a6c60d'),
  -- La isla (no city) <- La isla de los maricas
  ('ca5a6ec5-1006-4628-be13-760f01b93f5c', '386a245d-557a-4df6-bcf3-eb060f8204b7'),
  -- Las Terrazas (no city) <- Duchas Fitnesspark Las Terrazas | Las terrazas antes de llegar a la bp
  ('76729be5-46fb-42df-8575-7e4d7c7ee0c3', 'dd03d12f-7792-48a5-b700-a86f23740da4'),
  ('76729be5-46fb-42df-8575-7e4d7c7ee0c3', '85a03492-341b-4c49-a8e5-ce23a30a062c'),
  -- Lavabos Mataró Park (no city) <- Calle encima Mataró Parc | Montaña encima Mataró parc
  ('c6d3b1fd-c1a2-4671-9c3f-b1a0e6e0884c', '19b8b6ab-df89-4513-9680-63161355a378'),
  ('c6d3b1fd-c1a2-4671-9c3f-b1a0e6e0884c', '6c22ce49-c3b0-4cae-a94c-37ded2c50ae6'),
  -- Malpaís de Güímar (no city) <- Malpaís de Güímar
  ('e2fd9439-2012-4b4a-b3a7-d9ac3b690d96', '77cfec61-8c54-4f55-9387-7bca965ebacf'),
  -- Monte en Torreagüera (no city) <- Descampado de Torreagüera
  ('b7b69f90-4e52-45ca-bcae-7ece7e9e2e18', '9cc26704-9a5c-43b5-b31e-ecb02e981fe6'),
  -- Muebles Lara (no city) <- Polígono Muebles Lara
  ('76a51ec6-5534-4b7e-9a16-95253feb2a69', '2783bca9-cb96-47a6-8086-b69ba32b3e57'),
  -- Multicines (no city) <- Multicines (2)
  ('8f9d9c2e-1097-4b6e-8289-efc0d6097cd0', '01df20d8-97ed-414f-bc71-e972e676cd08'),
  -- Mutilva (no city) <- Gasolinera Mutilva
  ('fc80a618-380b-478d-8e76-641002d0c798', 'd89b2b04-baec-473f-b85f-7db1ff0fd3b2'),
  -- Odeon Multicines (no city) <- Parte trasera Odeon Multicines
  ('e9cba0db-ad5d-4aa8-aef5-8d50adbc1bcc', '9677c5cf-c42d-4b5f-b054-9640a40b4a15'),
  -- Paelleros Portaceli (no city) <- Merenderos Portaceli
  ('e0c0b368-27f8-496e-9190-bec8faefaf37', 'cb1dba69-405f-4a2e-891c-979bd60c3ab0'),
  -- Pantano de Graus, zona de Aguinaliu (no city) <- Embalse de Barasona, zona de Aguinaliu
  ('97072a76-d13a-499c-857d-ffd0afcba16d', '69be2b36-86ee-464a-8b57-6908d9da2864'),
  -- Para de la Marina (no city) <- Centro Comercial Vilamarina
  ('b1a3d170-6ad3-4142-8e76-d282c6e2f05a', 'e69b9c45-d366-4845-8d33-0fa09a497eda'),
  -- Parking de camiones (no city) <- Carretera del rio - Parkin de camiones
  ('e95a4cb5-7699-456b-801a-b6cabcd86ca5', '32fd4049-17bb-4adf-a133-d5d653e569f6'),
  -- Parque Alfonso XIII (no city) <- Al final del camino de tierra del Parque Alfonso XIII
  ('b2886bb7-f0f3-46d8-a6b7-72c2791153f3', 'a4b64d9c-4518-4889-bda4-a0ff46407b50'),
  -- Parque Can Boixeres (no city) <- Nuevo Parc Can Buxeres
  ('73535621-5f8f-4c50-9f38-be5f31fbe736', '8b736719-14e8-4283-8437-cd8c0f342657'),
  -- Parque El Vivero (no city) <- Aseos Parque El Vivero
  ('6a32d38d-0b73-44b7-b354-648cb839765f', '49079cab-120c-4e88-a518-d634541fa3e1'),
  -- Parque Iregua (no city) <- Parque del Iregua
  ('d4c0178d-84f8-42ac-8bd0-420dbeba44f7', '60872b57-621f-43ad-9cb0-1a3a45807bbf'),
  -- Parque Montarco (no city) <- Parque Montarco
  ('b0b03db9-6bb7-4b4c-ac1e-a3c45ed5c6d6', '5e2e17ac-fb2d-411f-82db-6e5c7459c7b2'),
  -- Parque Ovejero (no city) <- Parque Prado Ovejero
  ('e6e71207-663d-46b8-bcd2-95b9814f851b', '0fff462d-f0a5-483b-8ccf-87cee33eb957'),
  -- Parque Torreblanca (no city) <- Descampado al lado del Parc de Torreblanca
  ('38890d2e-03c3-45d0-8e3f-4225bdbe2c2d', 'ffeb1e56-de9d-4621-974b-2c7666f18054'),
  -- Parque junto Centro Comercial los Alcores (no city) <- Centro Comercial los Alcores (Planta de aparcamientos)
  ('76c4d4e1-7b4c-488d-8e54-d551fceaee43', '3f7e37fc-ec81-4ea1-af84-7cf520abed2f'),
  -- Peñón (no city) <- Ladera oeste del peñon de Ifac
  ('d25c00f7-b204-465b-b802-2e89969c6057', 'c6c975dc-af82-47f3-84d9-46233968fffc'),
  -- Piscinas el Soto (no city) <- Olivar frente piscinas de el Soto
  ('758f159a-2124-49fd-a854-24d677c81700', '171fd876-bab9-4390-a9b6-c81cda623ad2'),
  -- Planta -2 Corte Inglés Cornellá (no city) <- Lavabos planta 4 Corte Inglés Cornellá
  ('5f44be60-e7e4-4fa7-8c7e-225e96e8a09c', '1df3919c-87d9-493a-b047-84febe0e84f5'),
  -- Playa Nudista (no city) <- Zona cruising al lado de la playa nudista
  ('a829e938-c0e6-4b74-ae1d-604192842716', 'be12403c-55c6-4b64-a7c1-7b0c96a2a586'),
  -- Playa de Barra (no city) <- Dunas de Playa de Barra
  ('9f9a807d-ebd4-427e-8c65-3af042826c01', 'a409998e-011b-43e6-a2fc-cb3b4b9fde1b'),
  -- Playa de Caranza (no city) <- Última Playa Caranza
  ('ef5128f8-af1b-485b-9ced-e5c5f4588dee', '498ec874-592c-46ff-b6a1-f0688aa1a7db'),
  -- Playa de Extremadura (no city) <- Río Tajo la Playa de Extremadura
  ('f708a214-17f3-46d8-9d84-febb1ce7334e', '93cb5203-b375-45ff-9c5e-27ef3f1c7f58'),
  -- Playa de San Antolin (no city) <- Viaducs San Àntoļlin
  ('f620854a-4e3f-421d-9710-2235ea144bd1', 'ec398934-43ab-430d-bae3-e99bde27b828'),
  -- Playa de Señor Ramón (no city) <- Playa de Senyor Ramon
  ('e068ab3a-1187-45da-8e6c-dd300b5ab11b', 'e0aa467a-06ae-4b54-a2c8-a00c4cbc37f2'),
  -- Playa de Vargas (no city) <- Playa de Vargas
  ('81a1dafd-3611-4d94-abea-86452280bb34', '6d86ad38-47dd-4562-b48d-84e895bb420f'),
  -- Polígono Leganés Fuenlabrada (no city) <- Polígono de Leganés pegado a Fuenlabrada
  ('d1c393b6-b872-4f32-bc17-2d7e20a002f7', 'bacb7e01-4ae0-44f3-9827-264c6baa2d87'),
  -- Pont de Esplugues (no city) <- Pont d' Esplugues
  ('a8c00bb8-b996-4c35-a82c-aef87a69028b', '01fc9583-dfb7-47a6-99ea-b57ab1213271'),
  -- Ponte (no city) <- Ponte Nova
  ('880759b2-a03f-4db9-887f-e2d5a80a2ec4', '040472a6-9c32-40d2-b2f8-e9291f71c9e7'),
  -- Punta Entinas (no city) <- Punta Entinas - Almeria
  ('a2233223-306f-4d2a-9a87-dc2b12adec36', 'f01e0be7-1b5a-4a15-9e12-72cd7bfc1293'),
  -- Puntilla camino a Puerto Sherry (no city) <- Aparcamiento playa Puerto Sherry
  ('709ee2a5-1943-4bf0-9f7f-68d5017586ec', '8934594f-265a-4431-91ac-398e7b97b8ec'),
  -- Punto Limpio (no city) <- Camino Punto Limpio
  ('86af14fc-8b89-4924-bcbf-8264e4cab084', 'cb8c7f01-68ce-4581-b021-86c636f35f2b'),
  -- Rambla cementerio (no city) <- Cruising en la Rambla
  ('7b86543a-728c-47d5-9555-d9cf861b0fc6', 'bad32d59-6a97-4260-9a88-dc30835fa214'),
  -- Río Llobregat (no city) <- Rio de El Prat de Llobregat | Parking río Llobregat El Prat
  ('c9289c39-98c4-4062-bff2-54a20ae16005', '15768dad-23f2-4bb8-bd84-36486b95505b'),
  ('c9289c39-98c4-4062-bff2-54a20ae16005', 'bf0bd3ed-aea6-4682-9a03-40d9eda44dd0'),
  -- Río Tordera (no city) <- Rio de la Tordera | Desembocadura Río Tordera
  ('d102a153-e31d-409d-80e2-bd15d691e496', 'fb3e3674-a349-489b-a926-2db3a246cbae'),
  ('d102a153-e31d-409d-80e2-bd15d691e496', 'd1780a74-dfc5-4b4a-9eb7-5144c3d3b30f'),
  -- Saler (no city) <- La Rambla El Saler
  ('bf7cff57-9c3b-436b-bdd4-76885a4d3d27', '50d0399f-c455-4484-9362-f8c473834799'),
  -- Saltoki 2 (no city) <- Zona Saltoki
  ('c0bcb0c7-2570-4df6-b004-d6538b5744f9', '243ffdaf-d616-4ba9-a9dd-497443692574'),
  -- Santiga (no city) <- Polígono Industrial Santiga
  ('cf723762-d2d1-4160-b6be-cbcd398f2961', 'bbf6f935-aaf5-4b5a-a6a6-14c12dd84c8f'),
  -- Santullán (no city) <- Parquing del cementerio - Santullán
  ('a5534a01-c400-4f5f-9aef-6a843db1e232', 'd06eb4ff-6616-4aea-8289-b7d007b44bb7'),
  -- Son Bou (no city) <- Son Bou - Menorca
  ('b59e9c0b-adeb-4c66-9974-9df6b2dbf78a', 'a4eb5481-5e16-4fbf-b986-695ff9350042'),
  -- Subida Monterrei (no city) <- Castillo de Monterrei
  ('a35a24b7-43aa-4cbe-8f99-8bf948d14b71', '5df19c72-333b-4284-ada9-49d66ef29b3f'),
  -- Torre Castilnovo (no city) <- Playa de El Palmar - Playa de Castilnovo | El bunker de El Palmar - cerca de la Torre Castilnovo
  ('d6a57dfb-fd8d-4db2-9b71-a8d62a310017', 'ca7a0aaf-1343-44a3-98eb-e2f32dac8ba7'),
  ('d6a57dfb-fd8d-4db2-9b71-a8d62a310017', 'd0de2715-64dc-49e7-9e8d-9b600e99a09a'),
  -- Urb. Costa Ballena (no city) <- Baños CC 100 montaditos Costa Ballena
  ('ddcc2f94-4c9d-4c83-a559-057e3773625e', '854f0a72-3bf8-41ff-bc79-8d034c7fd11b'),
  -- Velle (no city) <- Presa de Velle
  ('6b38a4a9-e1c8-4e46-ac81-795c59241025', '12d877eb-4ee5-4708-b4e9-cb0f6b887764'),
  -- Vilamarina Camino Discreto (no city) <- Vilamarina c/Antonio Machado
  ('5dd615aa-2ecb-4bea-871b-c010e16879bf', 'e49607ef-0748-44d4-88dc-82b0109c89db'),
  -- Zona del mirador del pantano (no city) <- Zona del mirador del pantano
  ('d597da79-54ce-4edf-946e-76310b9629d4', '7fc757a0-3ef8-4648-8628-e2df451d5361'),
  -- Zona deportiva (no city) <- WC zona esportiva
  ('93613b54-8d43-46bf-b42b-9f8ef58b6018', '8a010f7a-9b57-4cac-bb33-cabb62c8bd26'),
  -- Zuatzu (no city) <- Garbiegune de Zuatzu
  ('c05a8ca3-9871-45be-9793-917df6e42377', '4b6885c9-1667-4116-bace-2390e2666d7c'),
  -- Área de servicio Arroyo de la Miel (no city) <- Caféstore del Área de Servicio Arroyo de la Miel
  ('5eddf071-9074-4dc6-a8bd-ea59123e4abf', '1ce7a86d-72e5-430d-a031-279acbc6d29f'),
  -- Bar calabardina (Águilas) <- Descampado en Calabardina | Embarcadero de Calabardina
  ('3419f2ac-a5f4-4393-87d2-6dc8fd786d6a', '8197c69d-6e2f-49ba-9d46-7ef5aa3778f4'),
  ('3419f2ac-a5f4-4393-87d2-6dc8fd786d6a', '380fb3ae-4530-4c71-8676-2b22643eb813');

-- 2. Enrich keepers before the merge (fill-if-empty only; planet-randy's
--    translate.google.com wrappers are never copied).
update public.venues k
   set website = coalesce(nullif(btrim(k.website), ''), d.website),
       phone   = coalesce(nullif(btrim(k.phone), ''), d.phone),
       address = coalesce(nullif(btrim(k.address), ''), d.address)
  from (select distinct on (p.keep_id) p.keep_id, d.website, d.phone, d.address
          from _es_pairs p join public.venues d on d.id = p.drop_id
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
  for r in select * from _es_pairs loop
    k := pg_temp.terminal(r.keep_id);
    d := pg_temp.terminal(r.drop_id);
    if k = d then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform public._venue_merge_core(k, d, null);
    v_merged := v_merged + 1;
  end loop;
  raise notice 'ES cruising dedup: merged %, already together %', v_merged, v_skipped;
end
$merge$;

-- 4. Close open review rows for any two members of the same cluster.
update public.dedup_review_queue q
   set status = 'approved',
       reviewed_at = now(),
       reviewer_note = 'manual ES cruising dedup 99991791636873'
 where q.status = 'open'
   and q.entity_type = 'venue'
   and exists (select 1 from (select keep_id, keep_id m from _es_pairs union select keep_id, drop_id from _es_pairs) a
                 join (select keep_id, keep_id m from _es_pairs union select keep_id, drop_id from _es_pairs) b
                   on a.keep_id = b.keep_id
                where a.m = q.keep_id and b.m = q.drop_id);

-- 5. Postconditions: end state, not this file's own writes.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from _es_pairs p
   where pg_temp.terminal(p.keep_id) is distinct from pg_temp.terminal(p.drop_id);
  if v_bad <> 0 then raise exception 'P1 failed: % pairs do not resolve to one venue', v_bad; end if;

  select count(*) into v_bad from (select distinct pg_temp.terminal(keep_id) t from _es_pairs) s
    join public.venues v on v.id = s.t
   where v.duplicate_of_id is not null;
  if v_bad <> 0 then raise exception 'P2 failed: % survivors are not live', v_bad; end if;

  select count(*) into v_bad from _es_pairs p
    join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id is not null
     and not exists (select 1 from public.venue_merge_audit a
                      where a.drop_id = p.drop_id and a.undone_at is null);
  if v_bad <> 0 then raise exception 'P3 failed: % merged drops have no live audit row', v_bad; end if;

  -- P4: the C-58 rest areas in each direction are different places.
  select count(*) into v_bad from public.venues
   where id in ('1eefbfff-465f-4b59-ba39-487a0af75075', 'b96d01e9-5c17-487e-b4df-5a5f5e96d82c')
     and duplicate_of_id is null;
  if v_bad <> 2 then raise exception 'P4 failed: C-58 Barcelona / Sabadell rest areas must stay separate (% live)', v_bad; end if;
end
$verify$;
