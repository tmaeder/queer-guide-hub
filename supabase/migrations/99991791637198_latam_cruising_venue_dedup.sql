-- Cruising-venue dedup for Spanish-speaking Latin America (2026-10-10):
-- MX, CO, CL, AR, PE, EC, BO, VE, CR, DO, PY, PA, UY, PR.
--
-- Fifth pass after DE (99991791632592), the multi-source countries
-- (99991791634999), BR (99991791636544) and ES (99991791636873). These rows
-- are almost all gays-cruising submissions, so duplicates are repeat
-- submissions of one spot ("Parque Nacional" x3 in Bogotá, "Mirador Sur" x3
-- in Santo Domingo, toilets of one mall listed store by store).
--
-- Method: every pair of live category='cruising' venues in the same country
-- within 1.5 km whose names agree after a Spanish normalisation (playa,
-- parque/plaza/alameda, laguna/presa, estacionamiento/parqueadero,
-- baños/sanitarios, centro comercial, bosque/cerro, estación/terminal/
-- central camionera; accents and trailing numbers stripped): 717 candidate
-- pairs, all read by hand. About 400 are different places sharing a generic
-- word (different gas stations, supermarket branches, university faculties,
-- metro stations, internet cabins on different streets) and are NOT touched.
-- Named or numbered sub-spots of one place (toilets inside one mall, accesses
-- of one park) are merged into one entry, per the site owner. Two Mexico City
-- metro stations are asserted to stay separate (P4).
--
-- 279 drops in 237 clusters. Keeper = most events/sources, then gayout,
-- then the most generic name, with a few clusters pointed at the place name
-- explicitly; two keepers are renamed to the place itself. _venue_merge_core
-- copies no fields, so keepers are enriched fill-if-empty first; every merge
-- is schema:1 and reversible with unmerge_venues().
--
-- Soft on preconditions: both sides resolve to their live terminal, so a pair
-- another session already merged (either direction) is a no-op. Hard on
-- postconditions: end state only.

set local statement_timeout = '300s';

create temp table _la_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _la_pairs values
  -- AR Parque de Mayo (Bahía Blanca) <- Parque de Mayo II
  ('9ef97e19-e178-4069-bc4e-764fa572a297', 'd4093248-24cd-403f-9132-6caf4d30811e'),
  -- AR Corredor Aeróbico (Bella Vista) <- Vías del Corredor Aeróbico
  ('ac743de5-4fbe-4f6a-a046-ecec0ef0aed3', '3906ffad-ec7d-4aab-a5d4-c8553c4862e4'),
  -- AR Plaza Pakistán (Buenos Aires) <- Ex Plaza Pakistán
  ('4cb56d53-79ea-4e7e-a031-7ce12aef417a', '2fe6c779-b67c-4c91-ac71-a1361f9779a6'),
  -- AR Reserva Ecológica Costanera Sur (Buenos Aires) <- Costanera Sur | Reserva Ecologica de Buenos Aires
  ('25cdca01-6879-4dce-9f16-aa2edcceff6c', 'cb8a73cc-94b1-43cd-b7e5-38839ca8dcb0'),
  ('25cdca01-6879-4dce-9f16-aa2edcceff6c', 'a36d63c4-acff-4925-b810-3bc513517b41'),
  -- AR Velodromo Lanús (Buenos Aires) <- Velódromo Lanús
  ('f9fee89f-79c1-4578-ad2c-1ccfa5bb3764', '23b9330a-f399-4fb2-afd1-c0850f7523ba'),
  -- AR Zoom (Buenos Aires) <- Zoom
  ('acbcd915-a6c8-4b2c-9935-0ae246c810a3', '45578d1c-76f2-41a8-b1a2-bf34c5650051'),
  -- AR Pelay (Concepción del Uruguay) <- Banco Pelay
  ('e1586b76-5fd6-49b1-8754-2f4be4a1b2a7', '36ba1ee5-54fd-4444-bc2f-6f02a6dacc83'),
  -- AR Parque Sarmiento (Cruising) (Córdoba) <- Parque Sarmiento
  ('2b80d19b-8906-4c1b-89f4-cce82ad77ea3', '22497531-0b27-4513-b404-22fdf94c5551'),
  -- AR Parque de la Vida (Córdoba) <- Parque de la Vida 2
  ('de5bf047-fc9d-41b5-9109-b079dc17b5d9', '05a9644a-c9b4-46f3-8c91-229d4ce0e912'),
  -- AR Mall de Maschwitz (Ingeniero Maschwitz) <- Centro Comercial Maschwitz
  ('1f859444-7946-45c1-a711-b601dfd9529a', 'd0417848-d265-4615-b31a-413e67d84c0e'),
  -- AR Bosque Santa Catalina (Lomas de Zamora) <- Reserva Santa Catalina
  ('0254ac1f-dd98-47f1-87a3-d23ef7d1c22b', '89d89c3f-b551-4b4a-acfe-664107af0467'),
  -- AR Acceso Oeste (Posadas) <- Acceso Oeste, Calle Costera
  ('a452a987-bdba-4e5b-99ef-f3e9465b122a', '42e7619b-f3f8-43e8-bff6-09c53d9d65fa'),
  -- AR La Placita (Posadas) <- Baños la Placita del Puente
  ('05d9100c-df3c-42cc-920d-ca8de9696fc0', '234996c7-c084-4120-b0b0-1df5342eab08'),
  -- AR Baños del Aeropuerto Internacional de Resistencia (Resistencia) <- Isla de la Paja en el Aeropuerto Internacional Resistencia
  ('93fa5f5e-9bc1-4cde-b439-1a4a34099ba2', '9b99825d-4b53-4fa8-a444-bc4758e2a5c7'),
  -- AR Plaza 9 de Julio (Resistencia) <- Baños Plaza 9 de julio
  ('34e655a9-c63d-4e2b-bbec-9f0ebccf2df7', 'ba72a592-9140-47e7-bbb0-2d07c1844369'),
  -- AR Estación San Miguel (San Miguel) <- Baños de feria de la estación San Miguel
  ('7905e3f3-7746-4b16-80f0-e761b6139d88', 'e1bfba0a-1b5b-48d2-abd4-0f7bd04ee53d'),
  -- AR Baños de Terminal Plataforma 18 (San Miguel de Tucumán) <- Terminal Nueva, Baños plataforma 65
  ('f3f71eaa-b402-439a-8d25-65335405d75c', '278daf7f-acaf-4e49-95bd-05344736587c'),
  -- AR Parque Barrio Soeme (San Miguel de Tucumán) <- Rotonda Barrio Soeme
  ('4ee95553-9626-404b-a054-1eff21a8b392', 'dbf39bd4-6d52-40a6-b41d-4066263ada89'),
  -- AR Asomadilla (no city) <- Aparcamientos Asomadilla
  ('c16407d5-53ac-408e-bddd-6817868e6fcc', '58c4be10-02e7-4b84-aa01-fd55e345af3d'),
  -- AR Baños de la Biblioteca (no city) <- Baños de la Biblioteca Central
  ('2ad46651-587b-4920-8f15-0cf350724968', 'bd793967-19fa-4299-8a9b-9e99098e4700'),
  -- AR El Arenal (no city) <- Olivos Arenal
  ('eadfd946-42bc-4731-bec9-c433d78eaeb3', '8da5b197-1b66-4c9e-8293-18f088b98e87'),
  -- BO Irpavi (La Paz) <- Baños Irpavi
  ('016e9591-833f-4f15-b314-d59b1a744f86', '3bc57640-75f4-4d2d-bb21-e18e72d96670'),
  -- BO Satélite (La Paz) <- Ciudad Satélite
  ('30b03500-009a-4a68-9dd6-3eb172f5e801', 'd16c4fe5-ae76-43eb-be47-2450995ca77c'),
  -- BO Baños Mercado San Antonio (Santa Cruz) <- Baños del Mercado San Antonio
  ('1ed516db-f9c0-4154-adde-47941424eb95', 'c486aed5-3b64-496c-8a39-5252698bd456'),
  -- BO Mercado Mutualista (Santa Cruz) <- Baños en el estacionamiento del Mercado Mutualista
  ('01e56aa6-7dde-4ccb-a91f-f08f00a1b045', '49772e0b-2186-4b3c-a5fa-0656f14f401a'),
  -- BO Plazuela 6 de Agosto (Santa Cruz) <- Plazuela y Calle Mexico
  ('46dc0f1a-ea04-4934-862c-1fb412a95b70', 'a00abaa9-2c6d-4b39-abe3-dc4c1f139b18'),
  -- BO Cancha San Aurelio (no city) <- Canchas del Ingenio San Aurelio
  ('66d91188-0583-4f11-97d6-d317fd9c8c3b', 'db94e4c7-01af-46ed-9c4c-376a8eed2efa'),
  -- CL Playa Las Almejas (Antofagasta) <- Baños y duchas Playa Las Almejas
  ('67979ae1-5ba7-4494-8bab-2ad2799c28a3', 'c668c37f-604c-4f25-ac6a-5407b05698df'),
  -- CL Baño primer piso Mall Plaza Oeste (Cerrillos) <- Baños patio de comida mall Plaza Oeste
  ('0410b1b5-4576-4e16-9e7c-3a2a929919b4', 'c5a1bc0b-b708-465b-a5d5-565f15b1eba1'),
  -- CL Los Pinos (Collipulli) <- Los Pinos 2
  ('1ae8f082-b0d2-4530-a0cb-59f14be17404', 'fbebe0db-bc92-4c58-be4c-1366afa2f3a7'),
  -- CL Camino Cosmito (Concepción) <- Cerros de Cosmito
  ('7fc44203-ff25-4dd7-8fe6-f3776cb55926', '9062b2a4-2423-4702-8d74-16881dc0a8e4'),
  -- CL Cerro Universidad de Concepión (Concepción) <- Baños Universidad de Concepcion (Foro)
  ('6bbdad10-bc76-4305-a9e3-17a0dbe5379f', '02976217-ce9f-4054-a5bc-f1f8bd1da14b'),
  -- CL Cerro parque Ecuador (Concepción) <- Baños Parque Ecuador | Estacionamiento Parque Ecuador
  ('5cdf2999-8c75-4ae3-b407-94d0cc748eb5', '48a03152-4591-4fd5-8e91-2ad5ab62d5b5'),
  ('5cdf2999-8c75-4ae3-b407-94d0cc748eb5', '9ca97c17-7aef-424e-aa07-487da8546cf2'),
  -- CL Facultad de Derecho (Concepción) <- Facultad de Derecho UCSC
  ('c5648bf2-49b4-4460-87d4-dad421839880', '55dff5bd-30b0-40fb-964d-9540b1c53512'),
  -- CL Laguna Redonda (Concepción) <- Parque Industrial Laguna Redonda
  ('45975362-a153-4903-8605-e6de9c7d2704', '8a7b4a0d-7fe4-462c-9783-4c786194b749'),
  -- CL Peñuelas (Coquimbo) <- Baños Outlet Peñuelas
  ('14946780-ea0b-4319-b777-a313d18c6367', 'f63008b8-f6fe-4574-b79f-090d69991d81'),
  -- CL Playa Los Ahogados (El Quisco) <- Escaleras playa Los Ahogados
  ('3fcdc15c-6080-4400-9b9f-491c76fcaab1', '3d7ac88b-f78c-4ae6-afea-3ad5cb59f6a6'),
  -- CL Faro norte (La Serena) <- Faro norte
  ('517ad488-5241-496c-95aa-546ef43be867', '7420bf64-c167-4ca8-82c0-2082af6008ae'),
  -- CL Sodimac Homecenter - Los Angeles (Los Ángeles) <- Detrás de Homecenter - Los Angeles
  ('2726ab60-a87a-474e-85e1-b150ca6bf30b', 'b49246eb-e945-4f87-a777-17f493337dfc'),
  -- CL Mall Panorámico (Providencia) <- Baños Mall VIVO Panorámico
  ('e176fd97-81e7-48e7-b353-81bc441e6536', 'bade954e-da18-4c9b-8c3f-51b0d7418b03'),
  -- CL Baño Santa Isabel (Santiago) <- Baños Santa Isabel República
  ('6613dbcc-9263-4ee3-8250-cbb9df3a8f56', 'df75c7f0-e81a-4bc4-aeb1-b8bdf3a75fbf'),
  -- CL Cineplanet Florida Center (Santiago) <- Baños 2° piso Florida Center
  ('0565a9bd-7e90-4659-b2d0-c3d8050243ec', '6fc08f8d-7400-43de-95c8-26bcbe19a9b2'),
  -- CL Mall Vivo Imperio (Santiago) <- Mall Vivo - Santiago
  ('746bfd20-b33f-4da0-a5a2-7c94976bbe4c', 'f60d21c1-3828-4d66-b946-5b5225c632f9'),
  -- CL Plaza los Dominicos (Santiago) <- Mall Plaza Los Dominicos | Mall Plaza Los Dominicos
  ('197ad91c-76a6-4b05-b2c0-314b45d79d6c', '9c90c9d6-6b3e-4c97-96bc-efaa95bd2ccd'),
  ('197ad91c-76a6-4b05-b2c0-314b45d79d6c', 'da3d2c86-608b-4045-89af-a8def7e84a9f'),
  -- CL Terminal buses (Santiago) <- Terminal de Buses Turbus
  ('ca30a36f-e483-4e49-896d-f6b176696910', '29fffd9e-f678-4462-9cdf-9766a2e2cf6e'),
  -- CL Titanium (Santiago) <- Smartfit Titanium
  ('1cca6bf0-3b77-4aa9-97d1-330ed192d69e', 'e67fc247-8041-4040-9144-b570f9cb12c2'),
  -- CL Terminal Talca (Talca) <- Terminal Tur Bus, Talca
  ('2d4dc736-e1d8-4d0d-99eb-8d0311787b92', 'e80fb0c4-831f-40a3-8d04-57250e8b62e4'),
  -- CL Canchas (Talcahuano) <- Canchas Salinas
  ('98d30d54-4271-4dc9-910f-439e34e83670', 'a9362cce-19b9-489e-bad0-8d959d7ce52b'),
  -- CL Paseo Wheelwright (Valparaíso) <- Plaza paseo Wheelwright
  ('1014f648-c2c1-4ea1-9f3c-9136be93808b', 'e185fd34-f25f-472e-9958-622e54be9b65'),
  -- CL Banheiro Praça (no city) <- Banheiro Praça Pequeno
  ('73ea5a9c-21a0-4611-a3be-b977ac69f8e5', 'cefed9ba-abbd-4944-bb43-1c354c3c507b'),
  -- CL Baños 2do piso Mall Tobalaba (no city) <- Baños primer piso Mall Tobalaba
  ('34619975-937e-44b1-9ab1-5d582f36d3ba', 'f1653253-8f7e-4333-a5f0-c73e94be39b9'),
  -- CL Baños Líder (no city) <- Baños Lider Homecenter -1
  ('e47064cf-ab54-4af6-8a11-97d88e7a5897', '2779fffe-c7f0-4a6c-baac-d7cd87d8deab'),
  -- CL Baños Mall Plaza La Serena (no city) <- Baños del sector Aires del Mall Plaza
  ('d18cfa63-6a9a-4489-b1d8-eeeb08a1722a', 'b0371ae4-e6d3-467a-a654-99c63dc2128d'),
  -- CL Baños de Aires, Mallplaza Vespucio (no city) <- Baños Mall Plaza Vespucio primer piso
  ('a4492806-c798-4885-b345-5873340f7cbe', '192eb6b1-78d7-4fd2-b0d6-0e9ffc3ed9dc'),
  -- CL Mall Arauco Maipú (no city) <- Baños Jumbo Arauco Maipú
  ('e4f32fb9-373a-430e-81b6-8875fc3ff240', '63b7e779-4e8f-43de-b23a-30a0e8c5f97c'),
  -- CL Marathon (no city) <- Marathon
  ('83d04211-e594-460b-8bc3-b81a8abe01fb', '7a093a33-11e7-47c4-935a-c6a151586fe9'),
  -- CL Parking auto (no city) <- Parking auto 2
  ('827d25ee-437f-49ae-82b1-1c076882a598', '21c693ab-b01e-40f3-8cb5-edef5a889683'),
  -- CL Parque Arauco (no city) <- Baños Piso Diseño Parque Arauco
  ('94d1a9de-f61e-4787-a562-91a8ff332778', '25a7bd58-6ff1-496e-81ed-bb862664f174'),
  -- CL Parque Isla Cautín (no city) <- Bosque Isla Cautín | Mirador Isla Cautin
  ('f529c9f3-edf8-4d40-bf03-0da14e1d47de', 'f95d6dbd-d7c3-45a0-bbb4-0f496e5fab17'),
  ('f529c9f3-edf8-4d40-bf03-0da14e1d47de', '4e4ec97c-3ea4-438a-b73d-e997c8333367'),
  -- CL Plaza Perú (no city) <- Baños Estacionamiento Plaza Perú
  ('7ab03dd2-1e9a-4168-9956-c20c02db8520', 'f6537c66-8f29-471d-873b-143d36d0f175'),
  -- CL Style Outlet (no city) <- Parada de camiones al frente del Style outlet
  ('f47aeda6-21cc-4c76-b33e-7818a996e15e', '206af29e-3b81-4cd4-81cf-736f8c5b4781'),
  -- CL Terminal Buses Pajarito (no city) <- Ex Terminal Express Pajaritos
  ('99a7eb41-121b-4820-9f79-31aeb2109512', '5005c683-0a07-4288-ab9c-4e5a925338f8'),
  -- CO Baños CC San Diego Sotano (Armenia) <- Centro Comercial San Diego
  ('8a22573a-fe26-4cf1-be42-0554ae3d956a', 'e14d38e4-a91b-45ec-92fb-465214037771'),
  -- CO Centro Comercial Viva (Barranquilla) <- Escaleras de emergencia Centro Comercial Viva
  ('0d4b2003-f94a-4e8b-beb2-681084373c74', '5f2f509b-fd3b-4bb0-9d34-d55c7e2e6fb5'),
  -- CO Mall Plaza Buenavista (Barranquilla) <- CC Buenavista 2 | Alkosto Buenavista | Baños plaza de comidas Buenavista
  ('2d746e2b-f0b1-4eef-ac1e-ef3747faf533', '5b8d96f5-63c9-41b8-86e2-ba191bb73926'),
  ('2d746e2b-f0b1-4eef-ac1e-ef3747faf533', 'c4366da3-ddbb-4039-a072-95f5778cfc5f'),
  ('2d746e2b-f0b1-4eef-ac1e-ef3747faf533', 'dcecfaf5-5f3e-4a15-bd70-9983cfaa82bf'),
  -- CO Baños Éxito Niquia (Bello) <- Baños del Centro Comercial Estación Niquía
  ('8e247e5b-f3f0-4641-9549-7770ad462244', 'b5e9a336-844a-46d7-b1a7-744958d0c7ca'),
  -- CO Baños Diverplaza (Bogotá) <- Baños C.C. Diverplaza (zona 2 autos)
  ('73aa3eb7-40f5-4e38-80b9-f863346e2aee', 'ac8640bf-ab1a-4900-a505-43fcf9a8dfb7'),
  -- CO Baños Parque Cayetano Cañizares (Bogotá) <- Costado del Parque Cayetano Cañizares
  ('283391e4-307b-4c58-a57c-2b80f2b93998', '7cdcdb1f-ee5e-439e-9ad8-bda3629b154b'),
  -- CO Baños Parque Timiza (Bogotá) <- Parque Timiza Kennedy
  ('17eb7799-b5f7-479c-9be4-2a43a3c727fe', 'f26af8f9-74d5-444d-9ff5-748fbbca4a70'),
  -- CO C.C. Centro Mayor (Bogotá) <- Éxito Centro Mayor | Baños Puerta 1 CC Centro Mayor | Centro Mayor - Noches al lado de río
  ('536394cc-6186-4769-80ec-41583751b1e8', '11e63d9d-8d89-4d3f-8142-1ac34aef660b'),
  ('536394cc-6186-4769-80ec-41583751b1e8', 'c54e103a-935a-4200-b516-725cc794e414'),
  ('536394cc-6186-4769-80ec-41583751b1e8', 'c4cf1ea7-2068-42d6-8e21-a19cdae73a08'),
  -- CO C.C. Portal 80 (Bogotá) <- C.C. Portal 80 sótano 2
  ('4c3c1019-fa2a-4b36-9f98-bf51ffb85eba', 'e01b4f32-7b69-4cf1-bc2c-8db976ec5cf6'),
  -- CO Cancha La Castellana (Bogotá) <- Parque La Castellana
  ('52a5a0a1-0024-4f8c-b69a-a489a82beab7', '2f5a57a4-1825-4372-9cd4-9da02b9ff347'),
  -- CO Centro Comercial Andino (Bogotá) <- Baño segundo piso CC Andino
  ('c6fbeb6e-3e4d-4e43-9227-4336b0acfa08', '334b2f04-2def-4b80-8c24-ccbd78cd724a'),
  -- CO Centro Comercial Iserra 100 (Bogotá) <- Baños del parqueadero del Centro Comercial Iserra 100
  ('efe2ef5a-1399-49b6-9406-f1c920f4452f', '9a66e6a1-caf2-4fdb-b458-17431caca9ba'),
  -- CO Centro Comercial Plaza Imperial - Suba (Bogotá) <- Centro Comercial Plaza Imperial - Jumbo
  ('f7855de9-0283-4d0b-bbf7-4bb00f1ccc13', 'b12bfda2-f37e-4eaf-9a42-88cabbbc15dd'),
  -- CO Centro Comercial San Rafael (Bogotá) <- Parque al frente del CC San Rafael
  ('c3cb8cd1-c1d0-4487-af89-df98d32b0ee8', '47c4efbc-d35e-4074-bd43-bf3d8ec80b11'),
  -- CO Chapinero Alto (Bogotá) <- Parque Portugal Chapinero Alto
  ('58fb66e0-a7f5-4c46-aca5-78480bc3178b', '30ac2f54-fde6-4202-a170-eaa11df1d6f1'),
  -- CO Estadio UN (Bogotá) <- Estadio UNAL | UNAL - Baños del Estadio
  ('d8aca4b7-cddf-44b7-aa9b-36ec4115ff9f', '018a8aa9-aa75-46e5-852c-6c3fc7bb814c'),
  ('d8aca4b7-cddf-44b7-aa9b-36ec4115ff9f', '72a18a32-569b-4abf-8ff1-be910adf18b3'),
  -- CO Humedal Córdoba (Bogotá) <- Humedal en Córdoba | Humedal Córdoba 2.0
  ('ce4b862d-f294-40ab-acf1-420cdfff79ac', '38ec4a9b-bc53-4af8-a034-32ecd9309b61'),
  ('ce4b862d-f294-40ab-acf1-420cdfff79ac', '03b66f5b-20d8-428b-9522-af8f89c935c4'),
  -- CO Humedal Recodo (Bogotá) <- Humedal Recodo
  ('d437f85a-4978-4a7d-afbc-82c56492bda9', '2d8f15bc-9b2a-496d-a68b-1a389e82a693'),
  -- CO Humedal Tunjo (Bogotá) <- Humedal La libélula o el Tunjo
  ('03fae840-38f5-4adb-9da4-173be4035d96', '54cf5228-b830-458a-abe8-fb15db395e33'),
  -- CO Parque Gilma Jiménez (Bogotá) <- Parque Gilma Jiménez
  ('820388d9-8b37-4891-bde2-66a04b611b7a', 'f0628ac6-1b5f-49a2-a848-126b0e9e55b1'),
  -- CO Parque La Serena (Bogotá) <- Parque Aledaño a La Serena
  ('3965305e-5d9d-4cbd-8a20-8622d263dcd2', '5adf9dc8-2e50-424a-a6dc-51d94c8f78f6'),
  -- CO Parque Nacional (Bogotá) <- Parque Nacional (Cruising) | Parque Nacional 2
  ('f7e3612e-b417-4a97-b234-ded861b19062', 'd954781a-bfdb-4359-86dd-488888ccb28c'),
  ('f7e3612e-b417-4a97-b234-ded861b19062', 'a98ba84d-1d0e-4971-8414-b358964bb438'),
  -- CO Parque Simón Bolívar (Bogotá) <- La Isla - Parque Simón Bolívar | Ciclo paseo - Parque Simón Bolívar | Puente peatonal - Parque Simón Bolívar
  ('bdbfc9f8-c373-430f-b258-6f1352688db0', '3fade441-5fd1-46e7-a82f-7a1d294ea14e'),
  ('bdbfc9f8-c373-430f-b258-6f1352688db0', '978041cb-1425-4505-a3b7-155524978dd3'),
  ('bdbfc9f8-c373-430f-b258-6f1352688db0', '1a34c0e2-7ba1-4482-b9d6-1329ba902351'),
  -- CO Parque de Marsella (Bogotá) <- Parque Marsella/Río Fucha
  ('8b7c7f74-40a7-4db8-ad5a-d073c7ebcdbd', 'a462e875-7cc5-4615-9512-9018cd5364cb'),
  -- CO Parque el Mirador de los Nevados (Bogotá) <- Baños Parque Mirador de los Nevados
  ('6b5a82c9-6538-43e1-b744-f1d56430627b', '75b93d18-f160-4886-848f-24cc1dddf85d'),
  -- CO Parqueaderos CC. San Martín (Bogotá) <- Baños Centro Comercial San Martín | Centro comercial San Martin-Bogotá
  ('62c3379c-5e68-4d04-b8cf-e461b14f53e1', '524b965c-1bf7-4fbe-8168-e2d693ff0716'),
  ('62c3379c-5e68-4d04-b8cf-e461b14f53e1', '4ad0f984-ecc5-4513-bdaf-2d7fdc009df3'),
  -- CO Quinta paredes (Bogotá) <- Parque Quinta Paredes
  ('aea0c4d4-4f86-4e3f-929c-c995e763bd88', '666f795c-c1bd-4b53-adea-d133f033b0c1'),
  -- CO Titán Plaza (Bogotá) <- Centro Comercial Titan Plaza
  ('5df2987b-81ea-4e89-b53c-94e960de1269', '3b1a5fde-0a1a-4ded-b521-1fa9c3e03f5c'),
  -- CO Zona Franca (Bogotá) <- Parque Zona Franca
  ('c2640f6b-a563-49b3-8555-73681985bd5d', 'c8849636-8fdc-4aa4-a300-70f095150cb1'),
  -- CO Éxito 170 (Bogotá) <- Parque Éxito 170
  ('8246c2fa-d056-48e6-8a79-5e0e08d2ecd5', '52df7d87-5065-4f3b-b916-53102f9961d9'),
  -- CO Baños Unidades Tecnologicas de Santander edificio B (Bucaramanga) <- Baños Unidades Tecnologicas de Santander edificio C
  ('bdf8eb6a-6692-4eb1-96d1-39fe4e35114a', '23727cf1-967e-4ad7-a0ed-967f8ddd2843'),
  -- CO Estación de Metrolínea Provenza (Bucaramanga) <- Parque de la Estación de Metrolínea Provenza
  ('60bd6014-ee4e-4283-89fd-6119043f3ef6', '79c77289-045f-4ea0-a2b3-527e5b05659d'),
  -- CO Parque Caminódromo Fontana (Bucaramanga) <- Atrás del Caminódromo Fontana
  ('6f7a1e2d-973b-49aa-9872-50ef362f64a9', '0f64bbf7-abfa-4b47-8552-e5017f848f1a'),
  -- CO Baños Jumbo Jardín Plaza (Cali) <- Baños Centro Comercial Jardín Plaza
  ('178591e4-5309-4678-b021-01901f00ac65', '9f1ff3c9-d472-41f0-9e3d-0737e3f2e4a9'),
  -- CO Baños estación Paso del Comercio (Cali) <- Terminal Paso del Comercio MIO zona norte
  ('ecfaedf1-d12f-4bdd-b910-897b65f03b08', '4fb2aa51-b4cf-4b36-ba7a-ab2a2f1ed577'),
  -- CO Cyber Global Sur (Cali) <- Ciber Global Sur
  ('972af860-a000-45a1-b549-b75b6dd4e0f9', '11bdf009-184c-485a-a66a-a2cc2f37a3ed'),
  -- CO Lote Valle del Lili (Cali) <- Área verde Valle del Lili
  ('e2454edb-234d-4c0f-8cce-6562518ad4ca', '133278bd-47c0-491f-a304-136c2071e23b'),
  -- CO Parque Bochalema (Cali) <- Parque Jaramillo Mora Bochalema
  ('08094057-1935-4040-ab06-2cf290d59638', '7a574ec9-2773-487e-9543-a848a332cd36'),
  -- CO Parque Tequendama (Cali) <- Parque de Tequendama 1
  ('867c59ca-4841-48a2-a795-312a204e5fce', '903e812e-3944-4fff-bdb5-45d7faaad79e'),
  -- CO Universidad Santiago de Cali (Cali) <- Baños Polideportivo Universidad Santiago de Cali
  ('57075085-2d14-4cbb-afad-7de3f1b523e0', '67df5dbe-8a3b-45c3-a3c7-98e6936c06c0'),
  -- CO Aseos espacio mediterráneo (Cartagena) <- Parte de atrás de Espacio Mediterráneo
  ('c8cdca76-9b13-421e-aa2d-6c62572f205e', '11740af4-0314-4e82-b4c4-fbef5fafa459'),
  -- CO Parque Heredia (Cartagena) <- Parque Heredia | Centro comercial Parque Heredia
  ('42037167-581b-40ec-9c33-9af4200a7e88', 'ecdf1d3e-cde9-4d61-b0a5-67d206c89c88'),
  ('42037167-581b-40ec-9c33-9af4200a7e88', '3c48e1de-72f4-4b94-9a91-d6b7d8142ced'),
  -- CO Parque rotonda Mandarache (Cartagena) <- Parte de atrás de Mandarache
  ('cae983f9-b4f1-4d80-9fa9-7e1612af49e3', 'e5756793-5dab-4283-bbfd-e3ff2eaf67bd'),
  -- CO Aeropuerto (Florencia Caquetá) <- Vía Aeropuerto
  ('0f33f937-4656-4100-ab76-9a8764c051f9', '0fc062dc-41c5-489a-9456-f2c942040335'),
  -- CO Baños del Gran Plaza Ipiales (Ipiales) <- Baños CC Gran Plaza (Segundo piso)
  ('49366d33-a855-4bfb-aedb-2e0133cc02b3', 'c4241fe6-1cf9-4209-8670-00d4a674df2e'),
  -- CO Morro Sancancio (Manizales) <- Baños Sancancio
  ('c8471ef3-ce55-4e27-8138-a217dec1aef1', 'bfa0e1a5-8204-4183-8f67-5cfe6d22971a'),
  -- CO Baños Mayorca (Medellín) <- Baños del primer piso de Mayorca
  ('55a0b7e0-2105-42ad-a557-357574e4b0ca', '8aa1fbfe-5ca3-4d00-94a8-3c1dae5c20a3'),
  -- CO Baños Parque Juanes (Medellín) <- Parque Juanes de la Paz
  ('1a436593-70c7-4d8d-91ea-ee7da1d32fe0', 'c2053040-17ad-4f24-acbc-971570128716'),
  -- CO Baños Santa Fe (Medellín) <- Centro comercial Santa Fe
  ('007b91b3-e86c-41fe-8b72-af438fdcaa41', 'f9ca7481-e539-4701-8c0f-e1e96ead72f5'),
  -- CO Centro Comercial Los Molinos (Medellín) <- Éxito Centro Comercial Los Molinos
  ('3a0b3a4c-d1fd-4500-9b58-2d11ba6e2b08', '65d761a8-dadb-4531-b15d-258010b84432'),
  -- CO Cerro Nutibara - Pueblito Paisa (Medellín) <- Cerro Nutibara, Puente Petatonal de la 33
  ('c3fd5fff-1dc6-4866-ab4f-dccb8c7e7d0f', 'deb0b555-f63f-474c-8a79-2511ca5b59af'),
  -- CO Estación Madera (Medellín) <- Mangas de la Estación Madera
  ('aebcbb50-821f-4584-b20d-c337794b057e', '76a4bfa9-9026-4d56-ad2a-62b6d4ca862e'),
  -- CO Pasaje Loma del Indio (Medellín) <- Final de la Loma del Indio
  ('84a0a615-101a-4063-a30d-4823e8b875eb', '811c494b-31c8-40d2-a473-c323f6400493'),
  -- CO Premiun Plaza (Medellín) <- Premium Plaza en los baños de Jumbo
  ('2054f034-91a8-4766-9a30-f1b3af8cb29f', 'bbc50be6-dc62-4db6-a2b0-6576506a67f4'),
  -- CO Unicentro (Medellín) <- Éxito Unicentro
  ('3f8eb22c-ca23-4e0c-befa-4895bd401119', 'c2abcdc9-d61a-41c7-a311-555633f38ba8'),
  -- CO Viaducto (Pereira) <- Debajo del viaducto
  ('f1b75a1b-ae7f-410e-9da8-9284fe7c689c', '4d51fb3f-7615-4620-9aea-543e712346ce'),
  -- CO Aves María (Sabaneta) <- Baños Aves Maria 6to Piso
  ('2fac79a3-61e9-4806-831b-fc4f7d12bf15', 'f394529d-a7e6-4287-9a02-9efe2aedfacc'),
  -- CO Ciudad Verde (Soacha) <- Junto a Ciudad Verde
  ('bb3cc8f4-0355-4454-b1c4-90b3d5d71dac', '4aaeb544-4403-47ec-81e6-73efa9e61d80'),
  -- CO Centro Comercial Nuestro Atlantico (Soledad) <- Monte detrás del CC Nuestro Atlántico
  ('3b29038f-3011-42bb-a912-cd9dda48788c', '99d7420b-36a1-48ee-8756-13dfcd4f31c6'),
  -- CO Estadio Metropolitano (Soledad) <- Parque del Estadio Metropolitano
  ('c99f86aa-b77d-452f-a412-5535bd722437', '4bb4787f-5f14-4f6f-8bcb-3b8bae7be08e'),
  -- CO Orilla Río Tuluá (Tuluá) <- Orilla Río Tulua
  ('41bca390-8ae2-48bd-807d-98d49a669368', '11a6e837-401e-4a54-ab94-b26f078cd774'),
  -- CO BAÑOS BUENAVISTA (no city) <- Parque Buenavista
  ('62b04dd9-06b2-44e7-8362-4e569b322f9e', '120c0003-6027-41fc-aea6-006766db68a4'),
  -- CO Baño último piso Centro Comercial de la Cuesta (no city) <- Baño segundo piso Centro Comercial de la Cuesta
  ('fb9a8a67-cc35-44c8-a3e2-4704ea7f1190', 'cbfd2418-ee9d-440a-9ec2-dbce737be08b'),
  -- CO Baños Sabana Norte (no city) <- Sabana Norte Centro Comercial
  ('b66da947-6476-416b-ba23-99e72e996e28', '3140b26d-c28d-46fa-a8e3-2f25f0407daa'),
  -- CO Baños la estación (no city) <- Baños cine Colombia la Estación
  ('63fcbd01-0030-472c-93e6-a499236b98ab', 'e976716f-a74f-4c19-bef4-f43a1d863d80'),
  -- CO Centro Comercial Mercurio (no city) <- Jumbo CC Mercurio | Baños en Mercurio | Baños Cinecolombia Centro Comercial Mercurio
  ('d6fd602d-fd7e-41ad-8fb5-713370c0afe1', 'e6267bf8-6d06-4562-a0a4-f5888d765164'),
  ('d6fd602d-fd7e-41ad-8fb5-713370c0afe1', '7cdee94f-d3ea-4f07-b47d-eb98600169a6'),
  ('d6fd602d-fd7e-41ad-8fb5-713370c0afe1', '6b6bc998-335e-4645-86ee-682020d088b8'),
  -- CO Crespo (no city) <- Playa Crespo
  ('619ade37-9851-462a-8b02-36722fe82ab5', '78d0e407-8c4f-46fb-ac2e-0ba17cc19224'),
  -- CO Detrás de Centro Norte (no city) <- Centro Comercial Centro Norte
  ('6a750096-5d27-43e4-9b05-7078d76d7064', 'df3f7b4a-0ac2-4c6a-81ee-d899fc1ca8bd'),
  -- CO La 14 de Alfaguara (no city) <- Centro Comercial Alfaguara
  ('a92cd8ee-3d40-4f26-8aef-304b8fcc09e5', 'c414fe11-e06a-4627-bec0-af91487d2f11'),
  -- CO MULTICENTRO (no city) <- Baños caballeros C.C frente al Multicentro
  ('9fdc6a7d-7928-4ee1-92be-095bf02989de', '7b6b9a3d-94cd-4dcd-93d9-a3874c9e5794'),
  -- CO Parque Natural Piamonte (no city) <- Reserva Natural Piamonte
  ('69a2293e-2979-4139-8051-d7dc026c4c70', 'f822e376-e1fe-473a-b417-8034d3efb6ff'),
  -- CO Sillón Rojo Club (no city) <- Sillón Rojo Club
  ('8755bd1b-6e88-43ad-b3cd-213ae25d8b19', '6a613675-b690-40ad-a49e-906209d0e5ba'),
  -- CO Universidad de Cundinamarca (no city) <- CERCUN Universidad de Cundinamarca
  ('73b64f87-1fff-4a26-bacd-9b9a895abd17', '5a09086d-254e-43cd-a60c-6fc9d1ef4c9b'),
  -- CR Baño de hombres (Quesada) <- Baños de hombres
  ('5154c3d2-d962-499c-9870-682bdeedc690', 'fa7938e6-2adb-4116-9e3b-b25ffc1589d1'),
  -- CR Calas del Barronal (San José) <- Cala Grande del Barronal
  ('615ca464-9ea2-41e7-bac9-88217468c83e', 'cf311061-aae4-4eb0-8b20-1584fe4b976f'),
  -- CR Final de Genoveses (San José) <- Playa de los Genoveses
  ('010c882c-1390-4283-be9b-e486c61f07e9', '38df6e9c-e2f9-40f9-a30e-bd55d302aa20'),
  -- CR Metrocentro (no city) <- Mas X Menos Metrocentro
  ('ce8a1cdf-a2fd-4f2a-99b7-0e55a78c49ad', 'f9ad80b2-1fcd-4eb5-9be5-6e0bd66c1c31'),
  -- DO Mirador Sur (Santo Domingo) <- Mirador Sur (bajando las escaleras) | Mirador Sur (en la zona de hacer ejercicios)
  ('dbacda79-5a81-4104-bf8c-2aeddd8b5e3f', 'a0a3ec3b-05e5-4084-97da-7723b3bf4772'),
  ('dbacda79-5a81-4104-bf8c-2aeddd8b5e3f', '9ea1c16e-a680-4080-a8de-d99b1207730e'),
  -- EC Sauna Rodas (Baños) <- Sauna Rodas
  ('2c967298-3936-4532-b0fb-f8e92f466731', '1fca6125-4597-459e-aaa2-868a114c0679'),
  -- EC Parque de la Madre (Cuenca) <- Parqueadero subterráneo del Parque de la Madre
  ('2a03dbb9-8ade-4af8-ba96-6abd1eae3206', 'fff8db8b-669a-460f-9ec8-b86cfb50407f'),
  -- EC Baños de la Rotonda Malecón 2000 (Guayaquil) <- Baño en Jardines del Malecón 2000 | Baños mercado artesanal Malecón 2000 | Escalones Malecón 2000 al lado de los baños
  ('b50b0ee6-28ab-47fa-a153-c710a952c97a', '1b556c21-badd-44b1-8dbc-c5ffdeb5fe28'),
  ('b50b0ee6-28ab-47fa-a153-c710a952c97a', '6e3e7b2e-0e82-4c83-bea4-f368e78ba4b3'),
  ('b50b0ee6-28ab-47fa-a153-c710a952c97a', '52da108c-f083-4273-9ee9-6c7831cbe0dc'),
  -- EC Senderos Parque Samanes (Guayaquil) <- Baños del Parque Samanes | Área protegida Parque Samanes
  ('04c81c98-95ba-486f-831e-25f676d32297', '482d78dc-3074-4b22-8913-948df009fd95'),
  ('04c81c98-95ba-486f-831e-25f676d32297', 'ce5d29eb-2d31-4221-9466-69bb64f8d3cd'),
  -- EC Terminal Rio Daule (baños de la metrovia) (Guayaquil) <- Área de deportes enfrente de la Terminal Río Daule
  ('7f710e4e-59b5-4d32-8ac3-f8c170f23fc4', 'f888ef24-8f6c-4d15-b4e9-e3b128353733'),
  -- EC La Machala (Quito) <- Parque botado intercambiador Machala
  ('9dc36a06-3531-4211-8a3c-0e460243ff90', '8bd6fc1c-ddbc-4a64-86d2-a03e53d08dce'),
  -- EC Ofelia (Quito) <- Estación Metro la Ofelia
  ('77107f06-5aa8-43f1-84f4-92506389cb81', '8dd2e82a-a308-4b1d-ac76-794d85d6a6aa'),
  -- EC Parque El Ejido (cruising) (Quito) <- Parque el Ejido
  ('95986dcd-c6f0-4085-9b98-1bff0b555a6e', '5472457c-495b-4e56-ae7c-8363a5ad2177'),
  -- EC Parque La Carolina (cruising) (Quito) <- Parque La Carolina
  ('0512e7dc-766e-4beb-887b-87b849afdf18', '1bfda2e0-8886-4515-8f80-93548033a526'),
  -- EC San Luis Shopping - Baños comedor de arriba (Quito) <- San Luis Shopping - Baños del estacionamiento
  ('e7dc271a-aff7-40cd-bb3a-5cccec3dfe2e', 'fec3cc09-6171-40c9-92b5-cd2c882b025e'),
  -- EC Terminal Quitumbe (Quito) <- Parque al frente del Terminal Quitumbe
  ('1afbbae1-8d7a-4efd-aade-e64ffa706844', 'b2f13a86-dadc-4fa3-b338-499442c5941e'),
  -- MX Catedral (Chihuahua) <- Plaza Catedral
  ('9502c25f-3103-43f4-918b-91542dc25025', 'e5c781f2-bee1-40ed-942e-80841be0f136'),
  -- MX Baños Itson (Ciudad Obregón) <- Baños Itson Centro
  ('56959c1c-fdd5-4463-9821-f107344f0405', '420a83a4-de73-451e-bde2-04b66fd41bab'),
  -- MX Zentralia (Coacalco de Berriozábal) <- Baños del primero y segundo piso Zentralia | Baños Zentralia 1er piso frente a las oficinas del gobierno
  ('f88794f6-2977-47be-9343-88375f0c4f53', '8af963a8-5f92-4ef7-8462-e85a1461c88b'),
  ('f88794f6-2977-47be-9343-88375f0c4f53', '877e1790-61f6-4405-ba06-abb5dadc6723'),
  -- MX Barranca (Cuernavaca) <- Barranca del Calvario
  ('9e13397a-3293-46d8-b2e0-352008ffb9b3', '6653cef9-9873-46d1-9b5c-f282f4c344c6'),
  -- MX Baños en Plaza Galerías (Guadalajara) <- Baños Liverpool Galerías
  ('fd47b4be-942e-49f3-b297-592b992e4978', 'e2879e62-570c-4a60-9c97-64c98ef9d300'),
  -- MX Campo de Ley Quiroga (Hermosillo) <- Baldío del Ley Quiroga
  ('9d64423b-8881-45aa-a3d0-7830b20ced76', '974e866f-8969-459b-8e2f-a544831611e8'),
  -- MX Baño público del Mercado Municipal (Irapuato) <- Baños público y regaderas del Mercado
  ('babdd2aa-b321-4e80-916c-56e9dc4af384', 'faf3728d-bc55-42fd-a5ad-8865ce5184ba'),
  -- MX CC Espacio León (León) <- Río Bernesga- Nudismo León | Chopera río Bernesga, CC Espacio León
  ('a16edf57-00a0-4a02-9ccc-70bce8a940cc', '5ba555b9-a510-4511-96e1-539207f43314'),
  ('a16edf57-00a0-4a02-9ccc-70bce8a940cc', '5a962a39-5a6d-4ee2-877e-d031c51ad82f'),
  -- MX Plaza San Pedro (Mexicali) <- Baños Plaza San Pedro
  ('5592f6ec-7300-4e99-9f1f-0671ec38d079', '59c50426-c117-4154-8dc0-272d7dd9e20b'),
  -- MX Baños de Plaza Central (Mexico City) <- Baños 1er piso Plaza Central
  ('57e1fcad-86cb-4e1c-b261-b7db4c42a665', 'cec7dd18-a7ce-489b-a1de-5b278ec64cc0'),
  -- MX WC Metro Pantitlan (Mexico City) <- Cancha de tenis y parque Metro Pantitlán
  ('5c46b652-bb7b-4c71-9eb1-627373061982', 'ee590077-4926-467a-b923-4035236cb9b0'),
  -- MX Baños Liverpool Galerías Monterrey (Monterrey) <- Baños Sanborns Plaza Galerías Monterrey
  ('0920e6ab-2eee-4c3b-8c99-92ef1644b5f5', 'c8715508-194c-44c6-8442-6251388369d4'),
  -- MX Baños Soriana La Puerta (Monterrey) <- Valdio Soriana La Puerta
  ('de7a3f89-2906-4085-ab00-c7c2bdc47c29', 'b72fae01-8c74-4f35-963d-adaf73eb2841'),
  -- MX Centro Cuahutemoc (Monterrey) <- Centro Cuauhtemoc
  ('93bc36b4-8a8d-4864-aa60-2f98d00b1221', '58ed942a-0a30-4e7e-9203-3d00acd640c9'),
  -- MX Parque Fundidora (Monterrey) <- Baños acceso 8 | Oscuro fundidora | Baños Acceso 5 Parque Fundidora
  ('2c42119f-52f9-463c-a392-906d43dda563', '33207f08-e630-43ac-bcac-8c2f9108873d'),
  ('2c42119f-52f9-463c-a392-906d43dda563', 'f1aeafca-2752-463e-aad5-963176c286db'),
  ('2c42119f-52f9-463c-a392-906d43dda563', 'f0f081cb-4ee6-4609-8e7a-2a20c833b686'),
  -- MX Plazas Outlet (Monterrey) <- Atrás Plazas Outlet
  ('8dcd1657-595e-4dcd-b8ec-0907d7636e40', '2d830e37-a421-445e-a87e-05f098b5a9ff'),
  -- MX Tecnológico (Monterrey) <- Zona Tecnológico de Monterrey
  ('8cba3405-3262-49a2-9d6e-3993af8ec6f7', '2da4fa3d-60e5-4dd6-9c31-77aa3b561065'),
  -- MX Baños Wall Mart La Huerta (Morelia) <- Baños de outlet La Huerta
  ('e4a451d4-66d7-4c61-8c6d-80da382d76b5', '6af47af5-07ad-41c8-ba2c-204ed4053fd4'),
  -- MX Baños del mercado de San Juan (Morelia) <- Baños de la plaza comercial San Juan
  ('74fea139-c723-428d-9b31-b1a49cc0a978', 'bc5b480f-c270-4a67-8104-9ec84ef6058c'),
  -- MX Bosque Cuauhtemoc (Morelia) <- Baños del Bosque Cuahutémoc
  ('f5ad267c-517f-45a7-9dde-684751297a9c', '0b4abdb9-16e6-4b5a-a4c3-634ce1dba7a8'),
  -- MX Baños Sanborns de Gran Plaza Shopping Mall (Mérida) <- Baños Pull And Bear de Gran Plaza Shopping Mall | Baños Comercial Mexicana de Gran Plaza Shopping Mall
  ('339cc026-c2fd-4d41-a7a5-ce4cff0a0180', 'b8d2666c-70b9-4f4f-b038-1a9f2a10db87'),
  ('339cc026-c2fd-4d41-a7a5-ce4cff0a0180', 'c8a271e7-c9be-4557-96aa-60a8065ee6ee'),
  -- MX Baños Sears segundo piso de Plaza Las Américas (Mérida) <- Baños del área de comedor de Plaza Las Américas
  ('8ed4d6ba-14c1-413c-826b-cab0d055256c', '191b147d-5c62-4cea-be6d-f620adca90e0'),
  -- MX Parque línea (Mérida) <- Parque Lineal
  ('7d115620-40dc-41fc-8d76-424d76e7d2b6', 'bdc7b288-a29c-497b-8c13-9bd0857b4977'),
  -- MX Plaza Dorada (Mérida) <- Campo beis Plaza Dorada
  ('24263acf-896e-405b-97f0-0e812cb06d48', '63f71c99-d1f0-457a-8eef-3ddd87c4964b'),
  -- MX Cacha Deportiva (Paraíso) <- Baños de La Deportiva
  ('055d6aed-63c2-4e9b-a0f8-4162c934b6d6', '861b08c6-0808-4097-9fd4-72d8bd586305'),
  -- MX Puerta Navarra (Patria Nueva) <- Baldío atrás de Puerta Navarra | Canchas de tenis Puerta Navarra
  ('13af7cd3-b7d4-4c73-905c-641a99bfa03c', '4bbb23fa-6ea8-4017-a734-a86254f2d5ba'),
  ('13af7cd3-b7d4-4c73-905c-641a99bfa03c', '5c44c0f4-387d-49ed-9b47-0ede09433cb9'),
  -- MX Triángulo de Las Ánimas (Puebla) <- Baños Sambors - Triangulo las Animas
  ('06d1e2fb-4404-4677-905a-fba7ef902a53', '2510a92b-7120-4eca-98ca-e9b7db74ab7e'),
  -- MX El Zurguén (Salamanca) <- Caminos Parador Zurguen | Carril Vistahermosa/El Zurguén
  ('d8024326-e26c-492e-949c-6eb4ab461ed5', '8ca79e18-75da-4c59-8f09-243a23fc5b56'),
  ('d8024326-e26c-492e-949c-6eb4ab461ed5', '3d40939c-4612-4ad1-b18e-bafe1efb2019'),
  -- MX Jardines del Sol (San José del Valle) <- Pasando Jardines del Sol
  ('bd3d6bde-fa5a-4ba9-8b4c-835024271127', 'ebbf0152-dcb9-4411-9b81-4833fb9de307'),
  -- MX Baldío Bernardo Quintana (Santiago de Querétaro) <- Pasaje Bernardo Quintana
  ('afe5bcb3-9b22-47b7-856a-a11b93a8a401', '81c38506-57b8-48e1-8a56-c9ee66602469'),
  -- MX Candiles (Santiago de Querétaro) <- Baños Plaza Candiles
  ('e5b0a89b-e71d-4c0f-8d1d-5b4064bf18cd', '67726370-f3b9-4578-a2e0-becf4577beec'),
  -- MX La Victoria (Santiago de Querétaro) <- Baños Plaza Puerta la Victoria | Estacionamiento -3 Puerta La Victoria | Baño Familiar Piso 1 Puerta La Victoria
  ('522e82c4-350e-4b45-9656-84865485fef3', '44a88899-0795-40ba-bc8c-72b8737b4120'),
  ('522e82c4-350e-4b45-9656-84865485fef3', '5a251662-2fb7-4c34-9b89-48781fd31be6'),
  ('522e82c4-350e-4b45-9656-84865485fef3', '6ae053c2-7e1c-4348-9ce3-73ead3b50c0d'),
  -- MX Parque Real del Marqués (Santiago de Querétaro) <- Fuente Real del Marqués
  ('0a09256e-18a2-4ea3-bba7-280354e38d67', 'bf8e5274-035b-46b6-915e-ab79bb138ecb'),
  -- MX Paseo Querétaro (Santiago de Querétaro) <- Paseo Querétaro
  ('fb53d5f3-36f8-419e-a301-5e3632e9cb48', 'b3417563-44b1-4594-9190-64d4d7c71510'),
  -- MX Pradera (Santiago de Querétaro) <- Atrás de la pradera
  ('47049f42-7a06-4772-9897-e02df9c98270', '86260a8e-6050-46fe-a6da-7ba1254f54ee'),
  -- MX Vamos gasolinera Mobil (Santiago de Querétaro) <- Baños Gasolinera Mobil Alameda
  ('7d9a5be4-3dce-4e12-8b97-63edce44aeb0', 'c5fde0d7-9e00-41a1-b47a-7b45c1265f21'),
  -- MX Plaza Carrousel (Tijuana) <- Soriana Plaza Carrousel
  ('9bbd9f12-5d94-45e4-87fe-47374947b788', '745c8013-1878-4d3b-94e8-08adaed1fb86'),
  -- MX Plaza Monarca (Tijuana) <- Cinépolis Plaza Monarca
  ('e43fa53b-0bd6-476b-bb5a-85c12dd96a6c', 'cd0e4bea-d2c4-41d5-8546-fc460af7260b'),
  -- MX Plaza Oasis (Tijuana) <- Baños Plaza Oasis | Cinemex Plaza Oasis
  ('245c06e5-7495-4166-afa4-043b7ba19824', '6ef01adc-7b4d-4fee-8e21-d37af61b67b7'),
  ('245c06e5-7495-4166-afa4-043b7ba19824', '7147b7b5-3193-4128-b5cc-af4dbcdd8b1f'),
  -- MX Puente que va hacia Palacio (Tijuana) <- Puente de Plaza Rio - Palacio
  ('2e324fba-21b6-4d58-9344-5363a0db21cb', 'ee73c81f-a72f-434c-a8d1-98fe9d26234f'),
  -- MX FES Iztacala (Tlalnepantla) <- FES Ixtacala edificio L
  ('45d2ff2a-a78d-4eff-80b9-8e9f7ad3b4d9', '9b91930b-dc66-4746-b72c-b2843b097c5e'),
  -- MX Galerías (Torreón) <- Galerías Laguna
  ('60317f0a-188f-4384-a2b4-1f2c3696a3b9', '42c67026-2013-49a2-a7d4-5a22ae85019b'),
  -- MX Parque Nacional (Uruapan) <- Afuera del Parque Nacional
  ('2b56c3eb-27aa-4862-8c70-65d4bb7e83d1', 'b9b47292-e368-416e-9f96-f12b1676644e'),
  -- MX Bugambilias (Zapopan) <- Bumgambilias - Andador
  ('f53af4d5-d0d6-400e-98c7-70658103c919', 'e05f3323-a21c-4371-aa35-8c64e3447f9a'),
  -- MX Plaza del Sol (Zapopan) <- Suburbia Plaza del Sol
  ('1fa12d63-5ed6-4de5-8451-7ace735fd8da', '2bf50d8a-d480-4937-a333-9e5e42eb264d'),
  -- MX Villa Fontana (Zapopan) <- Baldío al lado de la primaria de Villafontana
  ('687de0f8-9069-4e2a-a38f-0ea4d804f827', 'fb0c94e6-a16c-49dc-a1f1-3eab884cc902'),
  -- MX Baños San Cristobal (no city) <- Baños mercado San Cristóbal
  ('d1515598-6746-4e70-bebe-84589d04b5b6', '19ab4dbb-e7ff-4e1f-ae8d-89d7ff54916b'),
  -- MX Cablebus Indios Verdes (no city) <- Monumento a Los Indios Verdes | Baños Estación de Metro Indios Verdes
  ('9dfb0442-5b12-4de7-a564-28020f6203cc', '09d72a5e-3ed0-434c-a7d7-ff2a68c919cf'),
  ('9dfb0442-5b12-4de7-a564-28020f6203cc', '0c923a0b-9121-4b87-8798-405b26cd8ef1'),
  -- MX Camellón Eduardo Molina (no city) <- Parque de Eduardo Molina
  ('d7be1fd6-91fc-412f-8922-65e3fd832366', '761cd202-bdf7-4c6e-8969-5e7a1a5e108d'),
  -- MX Campo (no city) <- Campos del Quiroga
  ('d5ac7bfa-a187-4c7d-82cf-f6c29af9d6d2', '98119f55-f116-41c7-a3d1-de70782b0b28'),
  -- MX Central de Abastos (no city) <- Central de Abastos Baños Letra A
  ('966d4897-988c-4d4e-b94a-96c56ee5d666', '65a6da17-ab0c-42a5-8a95-5c5ca4da126b'),
  -- MX Cruz de chole (no city) <- La cruz de chole
  ('e794b138-e73d-4ff9-8d2b-4d1f58a48657', 'bafea561-1b84-4e0a-b928-287f675ec8eb'),
  -- MX La Milla (no city) <- Cancha atrás Milla
  ('65ec7e7c-9d23-420c-a077-77730e50f4d1', 'a099bcd5-1894-41a6-83e4-8d2ecaf6a769'),
  -- MX Ley del Rio (no city) <- Campos detrás del Ley del Río
  ('84be6c38-b24e-46ee-b8ac-44937baa163a', 'e72202f4-5bc5-409f-8bb1-b18697675677'),
  -- MX Malecón (no city) <- Casas del Malecón abandonadas
  ('7f74bf1c-3d70-46ad-8786-55deaf0d22b2', '25849858-1568-407d-bfd7-684294f814f8'),
  -- MX Metro Olivos (no city) <- Gasolinera entre Metro Olivos y Nopalera
  ('4e1a99fb-dec3-40c3-9fe9-95b777ba4de0', 'ea9b571a-7443-43b4-88c3-0f8e7f270c0b'),
  -- MX Metro Refinería (no city) <- Parque 18 de Marzo por Metro Refinería
  ('04213cde-cfa6-48fe-9197-7ce067dbb9ce', '627bbacc-a688-4ed7-b00d-2977d83c1d94'),
  -- MX Observatorio (no city) <- Baños y Regaderas del GYM, Observatorio 424
  ('4a5b2a88-51e6-4b88-8de3-88a5700df178', '2d816a5e-70aa-4eef-9adc-8008b05d21b3'),
  -- MX Parque Bicentenario (no city) <- Parque Bicentenario
  ('b7377592-456e-4e87-806c-1becd88abb29', '8aa1bee5-a9c3-4de1-bf0d-2db575048243'),
  -- MX Parque Ecológico (no city) <- Baños Parque Ecológico
  ('ef4bffe6-8206-4d00-ae21-a8685dcef2b2', '6857d112-1719-40c0-a838-fcd840fc5f9a'),
  -- MX Parque Naucalli (no city) <- Baños Parque Naucalli
  ('5f263c25-ff11-48ee-908b-9ec8e4c8858b', '61bf3af6-203c-43c2-ae85-90230f14e18c'),
  -- MX Parque Recreativo Cultural Siglo XXI (no city) <- Planetario Parque Recreativo Siglo XIX
  ('72adbc64-a19d-4531-987b-28a0de8f3f5a', '59e49927-3f8d-4b6f-9194-e4dfc5dcb37b'),
  -- MX Parque de cruising (no city) <- Parque para cruising 2
  ('844811f0-d0d1-486d-aad4-ce29bed48f78', 'fb5f4d21-967f-43f6-88af-2f37794bc75f'),
  -- MX Patio Santa Fe (no city) <- Baños de Patio Santa Fe
  ('c733462e-4df5-4cf8-beec-b11a6e44da50', '09cb68b0-519e-4e3c-b3e9-92d437fd54f2'),
  -- MX Plaza Centro Sur (no city) <- Puente Centro Sur | Baño de la gas Centro Sur
  ('f65f2a9f-9237-407a-adbf-843c9ee7438c', '0ad11896-01c0-48f8-9154-6f4acd655a5f'),
  ('f65f2a9f-9237-407a-adbf-843c9ee7438c', 'f655f1ba-eecb-4831-b7a9-af965cf01866'),
  -- MX Plaza Sendero (no city) <- Puente de Plaza Sendero
  ('fdf39725-76f2-4871-b730-30623c118874', 'd4ed4365-c7a1-406c-9ebf-890673071cc9'),
  -- MX Puente Plaza Aragón (no city) <- Baños de la Plaza Aragón
  ('908aeac7-0104-434b-a7fd-525da4b1d228', 'ca0ebeec-cd6d-4b8d-aa36-3f4d87b6c839'),
  -- MX Sanborns Camarones (no city) <- Baños Sanborns Glorieta de Camarones
  ('0a381687-c651-4dd8-b053-66ba73c8a16d', '8b641b5b-c014-4b53-8797-25574d51c788'),
  -- MX Unidad Habitacional Lindavista Vallejo (no city) <- Unidad Habitacional Lindavista Vallejo 2
  ('7e9e587c-1508-427c-bf06-e319423bd903', '2874d877-a213-4fcd-9849-6afd18771fe1'),
  -- PA Universidad de Panamá (no city) <- Universidad de Panamá FAECO
  ('9e7a4fad-a9f7-447f-a87a-1a38a09dce80', '8429a315-0f71-488a-b104-a2552ccc7b0e'),
  -- PA Vía Argentina (no city) <- Parque Andrés Bello, Via Argentina
  ('b2181fdb-ae52-40a5-9831-339997555e4b', 'adebc1a0-5130-4482-8e97-c38e1c0118a5'),
  -- PE Baños de Sodimac (Ate) <- Baño Sodimac Homecenter Santa Anita
  ('4b38ecf9-c553-43f7-8af1-90e64536efbf', '6ebd8d8d-0a20-4fc2-bdcf-9246faeb5a29'),
  -- PE Campo de Marte (Lima) <- Baños de Campo de Marte
  ('4f3fd2db-70a6-40ac-ac74-67df7afb06a4', 'd84251ce-107b-4506-bb26-23cabfcb3182'),
  -- PE Plaza San Martín (Cruising) (Lima) <- Plaza San Martín
  ('0e32d6ec-5b1b-41bd-ad97-2689425bdddd', 'fcec7eca-5536-4bd2-be80-3c3b48efa708'),
  -- PE Real Plaza Salaverry (Lima) <- Oechsle - Real Plaza Salaverry | Ripley, 3er piso de Real Plaza Salaverry | Escaleras de emergencia Real Plaza Salaverry
  ('1d795a87-07d5-4870-8fef-e85ce9d26f0f', 'ed9da917-a270-4e56-b954-8905d75bbff8'),
  ('1d795a87-07d5-4870-8fef-e85ce9d26f0f', 'c376608a-4d80-4c66-bd49-fc943756b14d'),
  ('1d795a87-07d5-4870-8fef-e85ce9d26f0f', 'ca7a5638-285a-4325-8851-587fc2c10ce8'),
  -- PE Baños de Tottus del Jockey Plaza (Santiago de Surco) <- Baños de Sodimac del Jockey Plaza | Baños de trabajadores del Jockey Plaza | Baños 2do piso de Tottus del Jockey Plaza | Baños 2do piso de Oechsle del Jockey Plaza | Baños en la zona de bancos del Jockey Plaza
  ('796def2f-522f-4980-98d7-4dfd753ecd02', '8cd228f4-35a4-4e78-ac1e-41df80df78d7'),
  ('796def2f-522f-4980-98d7-4dfd753ecd02', 'ed044512-1c6b-4b97-9893-9589c8beb7f5'),
  ('796def2f-522f-4980-98d7-4dfd753ecd02', '8be6f0cd-3140-444e-80bd-55fc8048ae96'),
  ('796def2f-522f-4980-98d7-4dfd753ecd02', '7bbdf57a-5044-4e37-9e58-6a397a03f4e9'),
  ('796def2f-522f-4980-98d7-4dfd753ecd02', '02d4ad6e-828d-41a7-90eb-b70e02e9f84c'),
  -- PE Baños Unicachi (no city) <- Baño Unicachi 2do piso
  ('f523049b-8cf8-47f7-a64a-d549dfcf0d75', 'd8b1c3eb-1551-423e-93f4-c20e50e28157'),
  -- PE Makro de Plaza Norte (no city) <- Maestro Baño Plaza Norte | Baño tercer piso Plaza Norte | Baño Saga Falabella Plaza Norte
  ('8dba68ce-8dcf-481f-98ba-1e28179cd3f3', '17b07936-227d-4756-aeda-16d7aad5ae3d'),
  ('8dba68ce-8dcf-481f-98ba-1e28179cd3f3', '24e4323a-6eef-4351-bbf0-fd17439d1da0'),
  ('8dba68ce-8dcf-481f-98ba-1e28179cd3f3', '772c2b9a-e3e3-4124-9177-ecd72d85cde3'),
  -- PR Parque Central (San Juan) <- Duchas de Parque Central y Natatorio
  ('37946410-0bc5-4e74-8df3-f28e68159187', '7eeeb073-40f8-4a15-b9ad-120b9a3fe5d1'),
  -- PR Coloso (no city) <- Recta de Coloso
  ('2b3380ac-ad8f-47b1-853d-17e4d9c3fb5a', '7bac8622-af92-4e63-a249-6a7d1cb6cd2d'),
  -- PR Pista Pública - Frente UPR Cayey (no city) <- Pista área de escuela frente UPR
  ('321f180b-a10f-49a7-8238-6a986b6a5a52', '23c909e9-1177-48b1-a91e-15db5d4c77ad'),
  -- PY Parque Guazu (no city) <- Parque ÑuGuasu | Parque Guasu-Matorral
  ('9065ed20-cf16-40ce-bfc3-b9472eddd0d5', '5191a377-5be8-4f98-8abd-20eb845a13d6'),
  ('9065ed20-cf16-40ce-bfc3-b9472eddd0d5', 'ad5c4f3e-f027-49ca-a6cd-14fe61807754'),
  -- UY Parque Batlle (Montevideo) <- Isef Parque Batlle
  ('2e1709d0-fe3f-4ebd-a7af-60c009620d38', 'f129234e-f43a-45d2-9ee8-f39e05236bb2'),
  -- VE Baño de Plaza Mayor (Lechería) <- Centro Comercial Plaza Mayor
  ('55855a7c-ffab-4599-8040-24425c354ea8', 'be6d7f0f-eab0-4b64-bfb6-86bd6ef19493'),
  -- VE Universidad Rafael Urdaneta (Maracaibo) <- Rectorado Universidad Rafael Urdaneta (URU)
  ('e940837b-8d3f-45ce-a4c7-6e56e4afa5ac', 'ecac857a-703c-4d5c-9e40-1ee62c83bcba'),
  -- VE Vereda II, primer puente (Maracaibo) <- Vereda II, segundo puente
  ('e98b2673-6f75-4797-b323-7b67a7a1054a', 'bd7897fa-cc73-4b31-b205-a243bfd0e302');

-- 1. Keeper names (guarded on the current name).
update public.venues set name = 'Malecón 2000' where id = 'b50b0ee6-28ab-47fa-a153-c710a952c97a' and name = 'Baños de la Rotonda Malecón 2000';
update public.venues set name = 'Jockey Plaza' where id = '796def2f-522f-4980-98d7-4dfd753ecd02' and name = 'Baños de Tottus del Jockey Plaza';

-- 2. Enrich keepers before the merge (fill-if-empty only; planet-randy's
--    translate.google.com wrappers are never copied).
update public.venues k
   set website = coalesce(nullif(btrim(k.website), ''), d.website),
       phone   = coalesce(nullif(btrim(k.phone), ''), d.phone),
       address = coalesce(nullif(btrim(k.address), ''), d.address)
  from (select distinct on (p.keep_id) p.keep_id, d.website, d.phone, d.address
          from _la_pairs p join public.venues d on d.id = p.drop_id
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
  for r in select * from _la_pairs loop
    k := pg_temp.terminal(r.keep_id);
    d := pg_temp.terminal(r.drop_id);
    if k = d then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform public._venue_merge_core(k, d, null);
    v_merged := v_merged + 1;
  end loop;
  raise notice 'LATAM cruising dedup: merged %, already together %', v_merged, v_skipped;
end
$merge$;

-- 4. Close open review rows for any two members of the same cluster.
update public.dedup_review_queue q
   set status = 'approved',
       reviewed_at = now(),
       reviewer_note = 'manual LATAM cruising dedup 99991791637198'
 where q.status = 'open'
   and q.entity_type = 'venue'
   and exists (select 1 from (select keep_id, keep_id m from _la_pairs union select keep_id, drop_id from _la_pairs) a
                 join (select keep_id, keep_id m from _la_pairs union select keep_id, drop_id from _la_pairs) b
                   on a.keep_id = b.keep_id
                where a.m = q.keep_id and b.m = q.drop_id);

-- 5. Postconditions: end state, not this file's own writes.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from _la_pairs p
   where pg_temp.terminal(p.keep_id) is distinct from pg_temp.terminal(p.drop_id);
  if v_bad <> 0 then raise exception 'P1 failed: % pairs do not resolve to one venue', v_bad; end if;

  select count(*) into v_bad from (select distinct pg_temp.terminal(keep_id) t from _la_pairs) s
    join public.venues v on v.id = s.t
   where v.duplicate_of_id is not null;
  if v_bad <> 0 then raise exception 'P2 failed: % survivors are not live', v_bad; end if;

  select count(*) into v_bad from _la_pairs p
    join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id is not null
     and not exists (select 1 from public.venue_merge_audit a
                      where a.drop_id = p.drop_id and a.undone_at is null);
  if v_bad <> 0 then raise exception 'P3 failed: % merged drops have no live audit row', v_bad; end if;

  -- P4: two different Mexico City metro stations must stay separate.
  select count(*) into v_bad from public.venues
   where id in ('40ec67d9-accc-4c00-8957-8f09054e17a0', '6b932596-fa1d-42ab-a459-d422bae17828')
     and duplicate_of_id is null;
  if v_bad <> 2 then raise exception 'P4 failed: Metro Balbuena / Metro Moctezuma must stay separate (% live)', v_bad; end if;
end
$verify$;
