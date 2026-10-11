-- Cruising-venue dedup for Brazil (2026-10-10).
--
-- Third pass after Germany (99991791632592) and the multi-source countries
-- (99991791634999). Brazil holds ~11.8k cruising rows and almost all come
-- from one source (gays-cruising), so duplicates are repeat submissions of
-- the same spot ("Praia do Pinho" twice, "Ponto 1..4 Campolim", "Parque
-- Barigui (Gay Cruising Area)" = "Parque Barigui").
--
-- Method: every pair of live category='cruising' venues in BR within 1.5 km
-- whose names agree after a Portuguese/Spanish normalisation (praia, parque,
-- praça, lagoa/represa, estacionamento, banheiro, shopping, mata/bosque,
-- rodoviária/terminal/estação; accents and trailing numbers stripped):
-- 1,028 candidate pairs, all read by hand. Most are DIFFERENT places that
-- merely share a generic word ("Banheiro Assaí" vs "Banheiro Bretas",
-- campus toilets in different buildings, different supermarket branches,
-- different metro stations) and are NOT touched. Numbered or named sub-spots
-- of one place (trails of one reservoir, numbered points in one park) are
-- merged into one entry, per the site owner. São José dos Campos' old and new
-- bus stations are kept apart and asserted below.
--
-- 330 drops in 281 clusters. Keeper = most events/sources, then gayout,
-- then the most generic (shortest) name. _venue_merge_core copies no fields,
-- so keepers are enriched fill-if-empty first; every merge is schema:1 and
-- reversible with unmerge_venues().
--
-- Soft on preconditions: both sides resolve to their live terminal, so a pair
-- another session already merged (either direction) is a no-op. Hard on
-- postconditions: end state only.

set local statement_timeout = '300s';

create temp table _br_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _br_pairs values
  -- Welcome Shopping Center (Americana) <- Banheiro do Welcome Center
  ('b81dc9b9-a113-4874-8d33-f8d51fb43dc3', '133c3008-1d80-4552-bba6-047be6678001'),
  -- Banheiro Líder Castanheira (Ananindeua) <- Banheiro do subsolo Shopping Castanheira
  ('999a3b7f-b88d-44e8-9d6a-a5067ac91502', '1d66353f-b8f5-41e6-af3f-b92dd1086af8'),
  -- Banheiro da Praça da Matriz de Marituba (Ananindeua) <- Banheiro Público de Marituba - Próximo a Praça da Matriz
  ('b9cee63b-3881-4956-bf47-94d664895dab', 'f69c2291-29d2-4411-80da-4b2a4eab18db'),
  -- Parque Cimba (Araguaína) <- Estacionamento externo parque Cimba
  ('82c9bf36-af28-4dac-8197-712693e581e0', 'f6616d38-815c-446b-b0ad-bc92a32a9494'),
  -- Praia do Pinho (Balneário Camboriú) <- Praia do Pinho
  ('3d66ebf0-abb6-4440-a7d2-c41e07382c5d', '281fbdef-2812-48d9-a2f3-edf9f4a1820e'),
  -- Estação Jardim Belval (Barueri) <- Rua do lado da estação Belval
  ('3e16bbfe-7f43-4e75-aab6-d4f8b1d392bf', '1bb6bdea-9bc6-449d-bd58-2ebcd6ac88f6'),
  -- Sesc Bauru (Bauru) <- SESC Bauru
  ('0ba168cc-4445-4f7e-8d3d-683882aeac5f', 'f5d09591-5fe5-4058-aacc-6606d622d7bf'),
  -- Banheiro Aeroporto (Bayeux) <- Trilha do aeroporto | Trilha do Sítio no Aeroporto
  ('2b6d0936-c468-4372-a7a4-fcf45d693ff5', 'e4fa9a29-6119-456b-a3ea-00b7729453a7'),
  ('2b6d0936-c468-4372-a7a4-fcf45d693ff5', 'd19bca06-bc59-4486-b067-c4164bf7a316'),
  -- Minas Shopping (Belo Horizonte) <- Extra Minas Shopping
  ('46cc6db6-7721-437d-a9e4-0db020e18c06', '26be0e26-4b71-4ba0-9cfd-53ed872f5fd3'),
  -- Pampulha (Belo Horizonte) <- Orla Pampulha | Trilha na Pampulha | Escadaria Pampulha
  ('27175c25-3013-4d03-8cdd-401ed836770f', '8de6d663-da5d-47db-a543-a07be2973efc'),
  ('27175c25-3013-4d03-8cdd-401ed836770f', 'c78d11ac-e57c-4e2b-a6c5-d9fa6c063c7f'),
  ('27175c25-3013-4d03-8cdd-401ed836770f', '62cd4e18-0791-4c14-9806-e4ae147314e5'),
  -- Parque Municipal (Cruising Area) (Belo Horizonte) <- Trilha Parque Municipal | Parque Municipal Américo Renê Giannetti
  ('2a32af74-638e-410e-9d62-8c1e9892106e', '005cd310-14dc-4695-88e1-38afb3f88184'),
  ('2a32af74-638e-410e-9d62-8c1e9892106e', 'ff52b68a-b479-402a-8fc7-ade962976c07'),
  -- Banheirro supermercado Du bairro (Belém) <- Pracinha atrás do Supermercado Du Bairro
  ('5a13afc2-8235-4afd-8a17-724bb235d18e', '217673df-977a-44d3-a917-8741ec488cad'),
  -- Brt Mangueirão (Belém) <- Estacionamento do Mangueirão
  ('08b0d454-be22-4789-badb-5b4ab16221f5', 'e5bec125-3753-4eb2-8359-dcaeaf233065'),
  -- Boraceia (Bertioga) <- Praia Boraceia 1
  ('1090863b-0d00-465c-87a0-9b2907285b45', '6cae56b0-3210-44fd-b6c0-a34c1489228f'),
  -- Trilha de Zimbros (Bombinhas) <- Costeira de Zimbros
  ('b7b3a16d-4c21-4260-a8db-afa3c52eaea2', '3ba2ec19-bf66-4fda-a51d-ed4729dcbcde'),
  -- Estação ferroviária (Botucatu) <- Antiga estação ferroviária
  ('b3444fda-e25e-48eb-bb82-db2aadcfc4e4', 'bbef1317-7b3f-42a3-968b-0ab7c369bb7f'),
  -- Banheiro do Venâncio Shopping 1º Andar (Brasília) <- Banheiro Decatlhon sub solo Shopping Venâncio
  ('d0b26444-0910-41af-86ec-6652256b570f', '9896a532-faa6-4507-bb78-2110e43c0be1'),
  -- DF Plaza Shopping (Brasília) <- DF Plaza Banheiro
  ('a5870300-4cd1-4c9f-91ce-64f5d82c25dc', '6ad42fe0-6a55-4f77-bb59-7ca387d5f6a9'),
  -- Fashion Mall (Brasília) <- Estacionamento Fashion Mall
  ('450430a3-a3ce-4397-9bd2-94774d80ee73', '0d9e6357-c843-4fdb-95d8-69377d4eb924'),
  -- Liberty Mall (Brasília) <- Banheiro Liberty Mall
  ('32d71f0e-2ade-409d-8d6b-2f854d1f7d44', '5881e381-1e3e-4113-8de3-ebef28ea32d6'),
  -- Park Style 1º Piso (Brasília) <- Shopping Park Style
  ('2bcecd62-8fa1-4b76-8ce5-52f70f05162f', 'db0f123e-f43e-4a9c-8c00-b7bb35f85d93'),
  -- Parque Águas Claras (Brasília) <- Parque de Aguas Claras
  ('27b8b015-2070-40cb-bad6-acc9e74f36c3', '7d31b508-0b46-4c6c-be7a-83b831665acf'),
  -- Riacho Mall (Brasília) <- Riacho Mall Riacho Fundo 1
  ('2890c971-4f25-4b7f-be0a-cc8b62878afb', '4e6398f1-a531-4ce8-b773-c52324cb0aef'),
  -- Torre Digital (Brasília) <- Trilhas de carro Torre Digital
  ('93034350-10b5-48de-80af-84b976065347', '5103aafe-876d-44c2-b9a1-70bc4262f20e'),
  -- Água Mineral (Brasília) <- Trilha da Capivara - Água Mineral/Parque Nacional
  ('d5a999e0-9f2b-40b5-a31f-9f107354a6ba', 'f97af3cf-b062-4509-8f96-a91fe0735932'),
  -- Aeroporto Internacional Viracopos (Campinas) <- Aeroporto Internacional de Campinas
  ('9a6121f2-a08f-4fba-b39c-911f0d70edd7', '2a57fc75-cf34-48ed-b997-e63c6ae21b8c'),
  -- Mata Santa Isabel 2 (Campinas) <- Mata da Vila Santa Isabel
  ('55c96161-e687-4dc6-96dc-90c6132545cd', '2af17e09-65b3-4afc-ba28-aa21c43a3314'),
  -- Parque dos Guarantãs (Campinas) <- Bosque dos Guarantãs
  ('e2dc0de9-22a0-4f71-95a6-3f72705b958d', 'c8318e31-780d-46ed-b564-93e84f5f7787'),
  -- Taquaral (Campinas) <- Lagoa do Taquaral | Vestiário piscina Lagoa Taquaral | Estacionamentos da Lagoa do Taquaral
  ('ee168116-5926-4755-825c-1c60cc8684cd', '6a89e51c-7c90-4eec-9e5d-95cf83ee84b2'),
  ('ee168116-5926-4755-825c-1c60cc8684cd', 'a50c895a-2bef-45a9-8f3e-074b48f6fbd2'),
  ('ee168116-5926-4755-825c-1c60cc8684cd', '23b55437-340e-4f86-bf0a-7e137968cf61'),
  -- Rua Deserta (Catanduva) <- Rua Deserta
  ('2fe666a3-9807-4616-8f66-545b32d03e40', 'fc1527b5-762a-44f3-9def-9a57df175039'),
  -- Banheiro Galeria (Caxias do Sul) <- Banheiro Galeria Embaixo do Restaurante
  ('510955f4-b2bb-42e4-b6a3-99540092bf4c', '7d9103ae-2ce2-464e-9f80-14f82de4f841'),
  -- Cristo (Conselheiro Lafaiete) <- Praça do Cristo
  ('2527974e-5793-4cc1-85e5-c6fd778ac0e4', '12080631-e2a1-44a6-ae49-15197561945b'),
  -- Trilha Shopping Contagem (Contagem) <- Banheiros Shopping Contagem
  ('20304fe8-9ee5-4e1b-9aee-e6baecc49f6c', 'a864e765-2ab1-4248-8b55-14e4a784005a'),
  -- Poupatempo (Cotia) <- Poupatempo Cotia
  ('1f843cf9-2b4e-4dcd-99dc-d7d419f0ae89', '2ee9c04d-89f9-460e-b54b-ea76eb162964'),
  -- Terminal Cotia (Cotia) <- Estacionamento Terminal Cotia
  ('313a0c66-0f5b-48b4-80c8-267655965428', 'fac1ee4b-1960-4a3e-b860-ad7b3b675655'),
  -- Banheiros Brancos Shopping Barigui (Curitiba) <- Banheiros Acessíveis último andar Park Shopping Barigui
  ('69324862-e989-4a98-b554-26cbee570ebf', 'd5be8fee-e14c-4d8e-8ab1-5cc2e28dd4c5'),
  -- Bosque João Paulo II (Gay Cruising Area) (Curitiba) <- Bosque do Papa João Paulo II
  ('3250192d-d68d-46c2-9210-b89f98154a62', '06ce5bae-c40b-4b61-8b58-9693d3f6647d'),
  -- Bosque do Trabalhador (Curitiba) <- Bosque do Trabalhador (atrás)
  ('69d20677-4cec-4f4d-b799-9b46028a7b67', '939ecb6e-bdd2-48a6-912c-d75d55f4b8db'),
  -- Campo de Santana (Curitiba) <- Mato de divisa Tatuquara/Campo de santana
  ('d6bcc49f-a1ce-406d-ba5b-f6ed69c42e0f', 'f9b765dc-3845-419c-9c8f-2c256bd69485'),
  -- Park Shopping Boulevard (Curitiba) <- Boulevard Shopping Xaxim
  ('e7226f7b-b5de-4a6b-a6fb-9dd2a7e06c67', 'd5f271e1-ed5f-4bdb-8744-2d3a2466b723'),
  -- Parque Barigui (Gay Cruising Area) (Curitiba) <- Parque Barigui
  ('a31df8c0-0ff4-4d90-821d-2d0a04fedab3', 'b05121c6-40e4-4bbf-b107-7fc118f7f452'),
  -- Parque Yberê (Curitiba) <- Parque Yberê de Matos
  ('b2ac77ce-285d-4218-83a4-a600bc504765', '7d1f3ade-19b0-4478-ac76-69110eb49601'),
  -- Terminal Pinheirinho (Curitiba) <- Estação Pinheirinho
  ('5b392ca8-45ba-48b7-8ec1-3bf2ec989710', '3264aca6-4fd8-418e-91b2-e2dc02639c35'),
  -- UFPR - Centro Politecnico (Curitiba) <- Estacionamento Politécnico
  ('b432fa45-053f-4c15-a266-1e25a3361a5a', '5fdbcd50-f560-4783-960b-5f88462fd814'),
  -- Escola tarcito Zancheta (Ferraz de Vasconcelos) <- Escola Tacito Zanchetta
  ('5a1b46cb-6f36-4b85-8a28-3fe51126b0b5', '09121ac6-c9cb-4dc0-b555-27f09c0fa0fd'),
  -- Estacionamento do mercado da Praça Gianetti (Ferraz de Vasconcelos) <- Mercado Da Praça - Gianetti Estacionamento Sub
  ('f1514e6f-5334-4895-8dd7-15d846df45c4', '04f63f56-7f8f-45a5-a8b4-74b7e7f38116'),
  -- Canto da Praia dos Ingleses (Florianópolis) <- Ponta Esquerda da Praia Ingleses
  ('3e85b60e-c998-4175-9c35-3190da5acc8d', 'a4e34dbd-b792-4dda-888c-09a22df220de'),
  -- Coqueiros (Florianópolis) <- Coqueiros na Gruta da Santa
  ('709f04f7-e277-4e8e-b984-a81bfaa47a97', '75b29778-e2f0-41f4-8f91-436d52d0dbd6'),
  -- Imperatriz WC (Florianópolis) <- Imperatriz Canasvieiras
  ('35148dad-8f71-4334-936e-b7cbb84aa8b9', 'e218c21c-1fc5-4581-9318-e2ec4c2d1da2'),
  -- Jardim Atlantico (Florianópolis) <- Banheiro Angeloni Jardim Atlântico
  ('0dc959d7-77f9-45f8-9d9e-ea86598c9af8', 'dd4361ef-63ba-438e-93a8-d895288a8818'),
  -- MAC Shopping (Florianópolis) <- Mac Shopping Estreito
  ('79f8a74c-bdda-477a-852a-4bf02375bac5', 'd5b60f75-4692-41b0-953f-477c54b2f932'),
  -- Ponta das Canas (Florianópolis) <- Entrada do Matinho - Ponta das Canas
  ('660f80c1-b177-4a7c-b5f2-98b3f2d71afc', 'e77cc61b-47c3-41ff-9f13-e025190359dd'),
  -- Banheiro Iguatemi (Fortaleza) <- Banheiro Extra Iguatemi
  ('fe53cd8c-b370-44a6-9e96-57cbe0ad5fc9', '63063899-2a8c-4ed6-8b21-5a485877f4b1'),
  -- North Shopping (Fortaleza) <- Escada North Shopping
  ('51a7efcd-42ea-4428-afde-c2c7ccd56c88', '73d8b301-2e79-40a2-ad1d-c6b5c38caae1'),
  -- Sabiaguaba (Fortaleza) <- Casa abandonada da Sabiaguaba
  ('59e3349d-032c-422a-9ee5-07ba252b0fc1', '63f99bff-09ac-47b7-a014-c4a6d693d265'),
  -- Shopping Camelo (Fortaleza) <- Shopping Camelo 2
  ('55ccd902-d4d0-4561-a42f-64ac574306c2', '493eb1a7-726c-4b70-8e9c-2fa272a03d88'),
  -- Shopping Parangaba (Fortaleza) <- Atrás do Shopping Parangaba
  ('9b1198b6-47d7-439c-9d81-951e0499d627', '02c2c788-72d5-4084-8c03-4a3e819bf467'),
  -- Terminal do Ant. Bezerra (Fortaleza) <- Terminal Rodoviario Ant Bezerra
  ('70df8aeb-e200-4e5f-a29e-2de3a2f37552', '0f01f2bc-a7a6-4b57-abf0-0d74d4ffb6c4'),
  -- Banheiro L1 Catuaí (Foz do Iguaçu) <- Banheiro L2 Catuai
  ('e59d209e-f452-4453-89db-d6dc376d7c8c', '00c92c19-3ccb-40a7-bae2-73fb15526071'),
  -- Parque do Trabalhador (Franca) <- Trilhas do Parque dos Trabalhadores
  ('59cb13af-e87f-4c2c-bed5-cdc9123053f3', 'f4095e71-b429-49a1-8ef0-0964c034969f'),
  -- Parque dos Lagos (Frutal) <- Banheiro Parque dos Lagos
  ('afea0fcb-269a-4cfb-ae8f-0993f1097bcf', '40f1e000-d05e-4980-97d5-a0dfbc5c887b'),
  -- Botânico (Goiânia) <- Jardim Botânico | Rua perto do Botânico
  ('59551bd8-8450-4f5e-87b1-637bbc242102', '7fb0cbd4-bd4d-4f00-9367-6708c62408aa'),
  ('59551bd8-8450-4f5e-87b1-637bbc242102', 'eee36c20-b688-4ab9-a380-d064394f88ec'),
  -- Parque Macambira (Goiânia) <- Trilha Parque Macambira
  ('98e373c1-3229-4369-93e4-efc1e92190a0', '2c5d194c-13ca-48f8-802b-7d55b2fb97c4'),
  -- Parque do Botafogo (Goiânia) <- Parque Botafogo Vila Nova
  ('253bb4ef-175a-49eb-a8ba-26b071bc4709', '1c2b08d5-1480-44d7-b0c3-3e59f29e546f'),
  -- Portal Shopping (Goiânia) <- Escada emergência Portal Shopping
  ('5546abb1-08ac-4a10-9d7e-c6b32d27b1f7', '765aa901-bfcb-4c8f-8ca0-0045d69d7d97'),
  -- Shopping Cidade Jardim (Goiânia) <- Banheiro da Praça de Alimentação Shopping Cidade Jardim
  ('53525158-a79f-4033-89e5-4ad4ac942503', '2ac4ee2a-4adf-4062-8c89-4d205aad0c55'),
  -- Terminal Praça da Biblia (Goiânia) <- Próximo a Praça da Bíblia
  ('102a022b-109b-497b-ba22-8c03df6e0d22', '403be1f8-b9d2-41e8-9b21-1c6c212f3ddf'),
  -- No Carro (Guarapuava) <- Pegação no carro
  ('427de2d9-ca86-426f-bb0d-12cb814a6af1', 'aa8f1033-67c4-40e0-aa49-fa04b5ef9e8d'),
  -- Canto Esquerdo Guaiuba (Guarujá) <- Canto do Guaiúba lado Pedra | Canto doreito da Praia do Guaiúba
  ('f03dbd61-03cf-4b11-9732-787d65970677', 'c93eef59-16f2-40bb-a8f6-2a13381dca84'),
  ('f03dbd61-03cf-4b11-9732-787d65970677', '891cbbbd-bb5c-4bc0-a019-08cc243c1e3a'),
  -- Lá Plage (Guarujá) <- Banheiro La Plage
  ('6b709dd8-4fbf-4825-be5e-3c052c7ab6cf', '3a1ca025-b13d-40d1-abd6-9982a22e92a2'),
  -- Banheiro Sakamoto (Guarulhos) <- Banheiro Sakamoto Dutra sentido SP
  ('d87a56f0-c726-4b78-9a59-bfcfafe4f745', '1366fe6a-4d1e-4444-a77c-2ba12e90c747'),
  -- Bosque Maia (Guarulhos) <- Bosque Maia (Parte Superior) | Estrada de terra Bosque Maia
  ('5818ee68-755f-4707-bfce-0b45809057c5', 'cf074015-ac74-47be-bab0-421b405cc2ce'),
  ('5818ee68-755f-4707-bfce-0b45809057c5', '8c3e8f20-de9e-4e68-a4ee-cd6231f53bee'),
  -- Rodoanel Ponte (Guarulhos) <- Rodoanel Ponte Mato das Cobras
  ('3d362d39-5928-481f-a057-0b847c1bcfd3', '7f94a028-0c7f-4d6b-9e0c-9c3a91e20160'),
  -- Shopping Internacional (Guarulhos) <- Atrás do Shopping Internacional
  ('32c6a9de-ba47-461d-a889-dc717000bf83', '646c2ab1-e1c6-4f1f-b5ff-a2dd6630b7f3'),
  -- Shopping Maia (Guarulhos) <- Banheiro Cinema Shopping Maia
  ('300a291b-cf2c-4e93-a5c0-71a63eeafe00', '189024f3-e8ba-4ebe-b74e-ba246daedb0a'),
  -- Terminal Cecap (Guarulhos) <- Rodoviaria Cecap Guarulhos
  ('25b26c7b-8ae4-44c0-bc73-aa46bb229521', '040c1ffa-7870-41fb-a850-600bc1d3d542'),
  -- Trilha Fioravante (Guarulhos) <- Rua estacionamento) trilha Fioravante
  ('50721ed6-cdb2-483d-a50d-380698edb928', '79679e92-40c0-4251-a154-bcc85452f45d'),
  -- Mercado Municipal de Piedade (Ibiúna) <- Banheiros publicos Mercado Municipal
  ('97bbc580-7a4f-411b-b955-e0336b56b742', '0ce6738e-3564-4586-bcf5-123c45d57aed'),
  -- Trilha do farol (Imbituba) <- Trilha Farol praia do Canto
  ('b351ed13-b7bd-44bc-94b0-761e5d0f95b0', '6a3138a9-0ae5-4dd2-9e35-3ed5e582b8c6'),
  -- Parque Ecológico (Indaiatuba) <- Sumerbol Parque Ecológico | Patio Ekko Parque - Parque Ecológico
  ('57edb021-926d-4217-a9f5-5802b603b0a1', '6bec865c-ab00-46b4-91ec-fe2186645365'),
  ('57edb021-926d-4217-a9f5-5802b603b0a1', 'f5a86844-8b54-4c31-9b10-e022ad35dd36'),
  -- Banheiro Brava Mall (Itajaí) <- Banheiros Shopping Brava Mall
  ('6f9419d1-4573-49c2-974e-29c00f694b26', '0681286e-3381-47b8-9052-888ac749ebbe'),
  -- Praia da Atalaia (Itajaí) <- Praia do Atalaia
  ('bc33b58f-e439-43f2-aa6e-47a57f278446', 'bb94b9fd-3650-4333-9592-bef6b1d6caf0'),
  -- Univali (Itajaí) <- Banheiros F2 Univali
  ('9fb09196-cbc4-48b6-8f4b-b3e30e1c4e66', 'c38f6c80-807d-4cae-a337-ec5175fa5c68'),
  -- Parque da cidade (Itajubá) <- Banheiro Parque da Cidade
  ('ef2d6689-c921-48ed-ac5c-e2a2642b6a94', 'c30b9267-6199-4d0d-ba28-d60be8e8cb99'),
  -- Suarão (Itanhaém) <- Jardim Suarão | Final da Praia do Suarão
  ('2cb71984-9f1f-472c-acea-416e00dd05d7', '983a16bf-e77a-46bc-8a9f-91ca5710dee4'),
  ('2cb71984-9f1f-472c-acea-416e00dd05d7', 'ed605540-fb8f-44fd-bada-1f21136bc5b0'),
  -- União Supermercado (Itu) <- Banheiro Supermercado União
  ('dd6ece90-c51f-4ecf-9bc5-3e9b56ae08bc', '647413e5-35d1-4728-91fa-1373cf512dda'),
  -- Banheiro Público da Lagoa (João Pessoa) <- Banheiro próximo ao Cassino da Lagoa
  ('29cb6103-73d5-44ce-ac80-18633a7d7850', 'b8aeee85-0af4-4712-a209-dbc60f84b87c'),
  -- Banheiros do Espaço Cultural (João Pessoa) <- Estacionamento do Espaço Cultural
  ('ede03f92-c456-482d-9f86-bfdd468bd52e', '37814583-4af6-4b25-9387-bd860e323046'),
  -- Gauchinha (João Pessoa) <- Posto Gauchinha
  ('6bfb05c9-4d16-4681-ac69-ca849d1caed8', 'cc8d856e-029a-4867-a7b3-b4d8d8a34cf2'),
  -- Parque das Timbaubas (Juazeiro do Norte) <- Próximo ao teatro do Parque das Timbaubas
  ('e54b6f6e-f7d1-4455-973f-0294367ff064', '5b1ddd94-c687-44d7-818a-5ee390980c4b'),
  -- Covabra (Jundiaí) <- Rua atrás do Covabra
  ('b8748abb-5e13-421b-9b10-a51b68011221', '83f38ae7-c174-4f8b-93df-17b793be5057'),
  -- Jundiaí Shopping (Jundiaí) <- Terreno ao lado do Jundiaí Shopping
  ('9984eb66-9666-4b6b-b54f-ad371c775791', 'fd89d154-be48-4f0c-8ea4-395b1cefd265'),
  -- Parque Engordadouro (Jundiaí) <- Parque Engordadouro (Trilha) | Parque Engordadouro (local Norte) | Rua escura do Lado do Parque Engordadouro
  ('ccdfb944-9fdb-42ba-bffc-cd714922c583', '6578e140-8588-4694-be97-6f2a18753c1f'),
  ('ccdfb944-9fdb-42ba-bffc-cd714922c583', '8b9d5506-94ba-4948-bc62-6649df8fe204'),
  ('ccdfb944-9fdb-42ba-bffc-cd714922c583', 'a22cbccb-0979-49cb-902f-e087f1ded5aa'),
  -- Reserva do Japy (Jundiaí) <- Pasto Condomínio Reserva do Japy
  ('4ccf7950-d334-4c44-866e-db1efa735b58', '1273fc98-5a25-4dda-8d19-19f9dd0d1edd'),
  -- Vale Azul (Jundiaí) <- Lago Vale Azul
  ('f96accb0-687a-4e92-a59c-a422cacbdf22', '7ce0f3dd-97f6-4382-a884-9530a402d8a4'),
  -- Praça Central Toledo de Barros (Limeira) <- Em frente a Praca Toledo Barros
  ('28c2e8d7-6c00-4920-87a2-9384a6b39740', '8e5d8f84-bcf7-4efe-bea0-58482113427c'),
  -- Golfinho (Londrina) <- Golfinho novo
  ('fc329c39-7637-4b5c-b27e-ee541dd2090f', 'b62272b8-8dd4-4879-9df1-a3fdbeaa553f'),
  -- Jardim Botânico (Londrina) <- Mata próximo a entrada do jardim botânico
  ('f28bcbc3-bcc9-40ec-b25f-7188d292816c', 'b1c705b4-cca7-429f-b0b0-5eb67d9e058b'),
  -- Parque Mondesir (Lorena) <- Em frente a lagoa do Parque Mondesir
  ('d07080fc-6546-4679-8d3c-79b2dd9efece', '45302bb8-95cd-4b67-98ec-a2be59e4b4a7'),
  -- Banheiro Carajás (Maceió) <- Banheiro Praça Alimentação Carajás
  ('8cd766fc-677c-414e-aee5-25ef54424ff4', 'eba0cbe2-b264-48fc-b08c-7608781c0209'),
  -- Safari (Maceió) <- Novo Safari
  ('f6d298a4-1773-425d-9f59-81a116590d6a', '37f7a86d-b944-4a81-a03b-cf7a237b9203'),
  -- Área Verde - Novo Aleixo (Manaus) <- Área Verde Novo Aleixo Cj Aguas Claras
  ('1f176820-c0f9-4ba8-8077-25b33f5935c7', 'ab28ada8-bec1-4168-bb03-6cd176a52506'),
  -- Banheiro Cidade Canção (Maringá) <- Banheiro do Cidade Canção da Tamandaré. | Banheiro Cidade Canção Praça Rocha Pombo
  ('de6321ea-58eb-4ee3-b265-fa64d961668e', '38da1f93-e628-4002-a4fa-e5c95aea3153'),
  ('de6321ea-58eb-4ee3-b265-fa64d961668e', '4b8dc715-ff87-4ef9-8798-f3b9bda940f8'),
  -- Unicesumar Bloco 7 (Maringá) <- Banheiro UniCesumar
  ('ea6788b5-61ae-4fa0-81bd-37a23cefe776', '77e61693-f511-4a77-b853-feaba5d10e05'),
  -- Esmeralda (Marília) <- Pista de corrida Esmeralda
  ('972d936f-07c2-4821-b4e3-c793e53dcb12', '980543ff-407d-4aac-b4c8-4fbcad3fa451'),
  -- Rodoviária (Marília) <- Rua atrás da Rodoviária
  ('e49eaad6-72fe-4e06-84a1-aee475edda1d', 'ded0b51e-6080-42b7-b268-f4cd43d991fb'),
  -- Parque  São Vicente (Mauá) <- Biquinha Parque São Vicente
  ('5b9759f9-a5ca-44ec-8b8f-e0edf875435a', 'b457536d-c85b-44cb-ba5b-02984d0ad632'),
  -- Shopping Mauá (Mauá) <- Mauá Plaza Shopping
  ('dafd0494-2d5d-42a7-a318-8567bdbb42c3', '62d90a0e-cea8-4db3-97dc-249a1331b963'),
  -- Estação de trem Jundiapeba (Mogi das Cruzes) <- Estacionamento na frente estação Jundiapeba
  ('a85daabb-3455-4359-938f-ed8e63f61336', 'dde9ce9b-759c-467d-8bbd-6a4f93f14076'),
  -- Estrada para o Campo de Golfe Clube (Mogi das Cruzes) <- Estrada para o Campo de Golfe Clube Med Like Paradise
  ('e99baa55-3637-4398-a106-4ad8f9d76965', 'b56607f1-e3f2-4119-a8ed-11d569008f7f'),
  -- Parque Centenário (Montenegro) <- Banheiros Centenário
  ('c5fbe0f3-42ab-45c7-80eb-251194215d55', 'b992e39a-4d09-45dc-84ab-75c60ca5f0ed'),
  -- Partage Shopping (Mossoró) <- Banheiro do Cinema no Partage Shopping
  ('06dae4a2-db05-4210-8bae-8dd3a17b9bdd', '1292e096-f305-44a1-8292-5a13ebece249'),
  -- Banheiros masculinos do Setor I (Natal) <- Banheiros masculinos do Setor II
  ('1349d281-e545-4451-b578-8501fef143b4', 'f6894d04-5daf-4d6e-ac6c-48d63f99eac5'),
  -- Cine França 2 (Natal) <- Cine França I
  ('e02addb8-e763-48b9-9e71-294bedeedd4c', '9ee532e6-6902-4445-9c04-9df81af5427e'),
  -- Hot Round (Natal) <- Hot Round - Lan House
  ('57413c5d-538c-4b5c-894b-3e37ad9de6ff', '35fd5999-c222-4988-974f-f21f36df3073'),
  -- Parque Das Dunas (Natal) <- Morro no Parque das Dunas
  ('e6eb3d05-ed99-4dc5-99c6-c8eadb110624', 'df714348-f17a-4f70-8253-a574697d8d02'),
  -- Parque da Cidade na trilha (Natal) <- Banheiro do Parque da Cidade
  ('9a26f2ed-efff-411e-baca-37a765ed280a', '41dbf7dd-7875-4f49-9a78-075c3c242507'),
  -- Canto da Boa Viagem (Niterói) <- Praia de Boa Viagem
  ('f34d4574-3a47-4350-bbf8-de60d1a24a87', '0a0d00a3-f70c-42e7-a689-d571a85de00c'),
  -- Praia do Barreto (Niterói) <- Praia do Barreto, São Gonçalo
  ('846669b2-37f9-4e32-9109-6eb858e8675a', '575d86d4-03a0-4088-8f2b-9cca548619b8'),
  -- Dutra (Nova Iguaçu) <- Rua ao lado da Dutra
  ('19db9e21-e1d7-41f5-b923-01b31a560ecf', '0e1467a3-28f9-4d05-932a-382ca4dfdedb'),
  -- Via Light (Nova Iguaçu) <- Do lado da via light
  ('aa969b5a-1bee-4c0f-b787-7b21430a8ab8', '38145264-02c4-44aa-a82e-01921547db0f'),
  -- Rodoviária (Nova Odessa) <- Rodoviária Nova Odessa | Rodoviária de Nova Odessa
  ('96054a86-f709-4d81-a55d-ee6a0aebb5f2', '8414cfc9-eb96-4678-a25e-9138cd80515e'),
  ('96054a86-f709-4d81-a55d-ee6a0aebb5f2', 'a523497a-5db8-40a4-9400-088d998ef0f2'),
  -- Inova São Francisco (Osasco) <- Innova São Francisco
  ('e73b9dd8-58c0-4dd5-be03-54b47786803f', '09ef155e-f8f5-40e3-b55b-6cede696d380'),
  -- Passarela (Osasco) <- Passarela Bonfim
  ('b8742776-d1d8-4d72-853b-26dbc29e4384', '27229649-d6ae-4db2-859e-65d0501ad9a4'),
  -- Shopping Pátio Osasco (Osasco) <- Pátio Osasco Open Mall
  ('cd1b994f-e778-4abd-9515-e7a4d7fa7ced', '86026809-b851-463c-b0dc-6fa9f231bd71'),
  -- Avenida Ponte do Imaruim (Palhoça) <- Komprao da ponte do Imaruim
  ('b536a9b0-6e8d-477d-aa2f-124768329fdd', '03444975-957d-48b1-a0c6-c967b6511c18'),
  -- Pedra Branca (Palhoça) <- Pedra Branca próximo à Unisul | Banheiro do passeio Pedra Branca
  ('faeafe32-94ab-406d-893d-f7d150860fa5', '621f6b59-45cb-4a2b-a0d5-9e21382bc337'),
  ('faeafe32-94ab-406d-893d-f7d150860fa5', '46980f0b-88ac-4fdb-b56b-cb314a987691'),
  -- Rodoviária (Paranaguá) <- Rodoviária de Paranaguá
  ('a380800a-8f77-4537-86dc-2e335a359347', 'a4674270-f173-4e76-af29-9702ea822594'),
  -- Casa abandonada (Paranavaí) <- Casa 465 - Abandonada
  ('91e02a97-a55b-419b-977b-8daf06d83249', 'c5d32ad4-524e-4393-912e-f79f1bbf1d60'),
  -- Banheiro da Rodoviaria Nova (Passos) <- Banheiro Masculino da Rodoviária
  ('644db6d2-5527-4802-8d91-5e7221fbb165', 'a1a851ef-935e-4225-a80e-16b78150da0e'),
  -- Praça da Matriz (Passos) <- Banheiro Praça da Matriz
  ('f784e0f3-b4c6-4b32-bc31-18290c8097c7', '88224eda-52b9-4f62-b358-88c648190336'),
  -- Final do Luar do Campestre (Patos) <- Atrás do lajeiro no Luar do Campestre
  ('60885ee4-d935-4164-b13a-ac54adca78a4', 'd2932641-70c0-4205-82a1-15f18a7bf8a8'),
  -- Patos Shopping (Patos) <- Banheiro do Patos Shopping
  ('b8e40558-fe24-4a92-84e1-08e095850781', '49403278-12c3-459b-8bcb-d72360b7e247'),
  -- UNIMEP (Piracicaba) <- Mata Unimep
  ('20d30ac7-be47-44b9-9115-e6bfd0492cb1', '6d5400c3-ab58-42fd-ad0d-75390c3fa666'),
  -- Banheiros UEPG (Ponta Grossa) <- Banheiro de materiais da UEPG
  ('e6716b06-2aa0-452f-9558-986c683da55a', 'de6eabfe-2337-4bb3-b612-6b331c3189f6'),
  -- Centro de Eventos (parte de trás) (Ponta Grossa) <- Centro de Eventos de Ponta Grossa
  ('e54df16e-a091-4f1f-a45f-1bda58daa154', 'c50c3af9-6858-46ff-9bd7-4a391e0b3429'),
  -- Lago de Olarias (Ponta Grossa) <- Trilha na parte de cima Lago de Olarias
  ('48649948-f545-4438-aee1-50aadf34be4b', 'e7ba0379-d571-4667-97dd-3ddced36a089'),
  -- Tozeto Nova Russia (Ponta Grossa) <- Banheiro Tozetto - Nova Rússia
  ('42f4597d-8078-4d91-bbb8-feec5dbaa12f', 'a8dc9751-6a30-44f7-86ac-d9fcbc19e432'),
  -- Aeroporto (Porto Alegre) <- Boulevard aeroporto | Aeroporto Salgado Filho
  ('b5afa6d5-9e95-4fe8-a480-542c88afc3f6', 'daaf0c3f-576e-4a61-b6a0-207237eeb175'),
  ('b5afa6d5-9e95-4fe8-a480-542c88afc3f6', 'bfcfd303-1207-49b8-b766-6881c747ce0c'),
  -- Anfiteatro (Porto Alegre) <- Anfiteatro Por do Sol
  ('4e54ec37-6fb2-403a-971b-5b969e22c72e', '6ebc5f12-05a5-43ef-a9f8-2db2b5be7950'),
  -- Barra Shopping (Porto Alegre) <- Banheiro Barra Shopping Sul
  ('fc9f42db-0fa4-4701-8d42-ed3bae9e62d4', '5d73f623-a9c1-4386-90eb-11b1de592dc1'),
  -- Pepsi on Stage (Porto Alegre) <- Atras do Pepsi on Stage
  ('5300eb48-c97e-4d2f-95aa-095430b79352', '1fc2ca8c-77e2-44f3-b71a-302f452f5fde'),
  -- Panobianco Aviação (Praia Grande) <- Nos bancos da Aviação
  ('41fde139-0801-4e3d-8d31-9d8201e49280', 'c6dfebd1-92dd-450f-b695-eeb1fdcb075f'),
  -- Praia da Aviação (Praia Grande) <- Na Areia da Aviação
  ('5fd0542b-ea7b-4ebd-a042-aebfcce6fb3a', 'd04ca6b4-2d49-4cd8-8b85-6cdcb9711d6c'),
  -- Sodimac (Praia Grande) <- Sodimac Dicico
  ('9cdd9f85-bd27-4b9e-84e5-0157a4fc53f2', 'd6aa58c3-3470-4067-8f78-b25c55ebfdcc'),
  -- Vestcasa (Praia Grande) <- Rua atrás da Vestcasa
  ('40251a71-8d00-47e2-bd80-b0ba27e6d235', 'd05bf9de-6b6a-4fde-98ff-7365960f3ce5'),
  -- Banheiro do Mercado de Afogados (Recife) <- Banheiro da Feira de Afogados 1 | Banheiro do Mercado de Afogados 2
  ('0a72726d-2d6a-4dfc-8a49-8dabde0e5e2d', '8427c594-bb9a-4fc0-ae2e-8a411b6408c1'),
  ('0a72726d-2d6a-4dfc-8a49-8dabde0e5e2d', '2b648cd4-fb48-4fbd-88ab-6e6971683a45'),
  -- Banheiros dos Shopping Boa Vista (Recife) <- Estacionamento do Shopping Boa Vista
  ('efbcba77-1aae-4397-ab77-9fa67fc0f8be', 'dd69533e-da12-4d8e-a4aa-d821180ed149'),
  -- Esquina do Postinho de Saúde (Ribeirão Preto) <- Esquina do Postinho de Saúde Simioni
  ('a5145825-cc41-4327-8fc2-1faa4ee92806', '261ee1cd-d4c9-4d3b-aea0-23ab1108ddfb'),
  -- Sauna Liberty (Rio Claro) <- Liberty Sauna Rio Claro
  ('075d54ba-ba69-474c-af39-5fc46516e356', 'dcf69d76-3daf-4fd1-820f-174d2c820eab'),
  -- Interlagos (Rio Verde) <- Rua do Interlagos
  ('2d553798-5586-49c4-9946-22e26a1cd588', '4e24f696-967c-48bf-8f52-40a51727484b'),
  -- Pista de Caminhada (Rio Verde) <- Pista Caminhada Espelho
  ('8eb217da-ca75-44a8-bb41-e2aeefb3b6ab', 'de1c145b-2d6d-4bf0-ba87-d4c554dada9c'),
  -- Aterro do Flamengo (cruising) (Rio de Janeiro) <- Aterro do Flamengo, Arvores
  ('8f668489-e75f-4e10-b716-c390d185653a', '20239ad6-17bf-4979-adee-2cb7b0b83154'),
  -- Fundão (Rio de Janeiro) <- Banheiro BRT Fundão | Fundão próximo ao canteiro de obras do BRT
  ('04d2c7bd-d1af-4f77-b35e-63e9150edcef', '9cb1bff2-cb07-42f5-a64f-577d575bb3d6'),
  ('04d2c7bd-d1af-4f77-b35e-63e9150edcef', '97b1876a-f685-488a-babe-4d9ba0fea9e4'),
  -- K7 Cabines Centro - sex shop - Cruising zone - pegação gay (Rio de Janeiro) <- K7 Sex Shop & Cabines
  ('45eae27b-d8f3-4e7b-98f9-d290d87b3fdb', 'ea254212-ff76-4de8-b272-004e513a36bf'),
  -- Seven Cruising Bar Seven Bar de Cabines Rio de Janeiro (Rio de Janeiro) <- Seven Cruising Bar
  ('02945046-d42f-44b3-a1a1-5845289a9cf5', '8b265bf0-64ef-4a69-b7a7-0235e0a41ffa'),
  -- Farol de Itapuã / Praia de Catussaba (Cruising) (Salvador) <- Farol de Itapuã (Frente ao Diamond)
  ('d85d093a-c51a-40e5-bbe8-77384d933700', '17b2218b-c4e0-4efd-b424-b9bf3afbd377'),
  -- Morro do Cristo / Farol da Barra (Cruising) (Salvador) <- Morro do Cristo
  ('feb75876-c000-436e-911b-5f7c7d091658', 'e0441c0e-26ea-4265-9141-6b4b58f89d4e'),
  -- Colinas (Santana de Parnaíba) <- Colinas do Anhanguera
  ('2dd0aea1-5136-4424-b5a5-c326b6499e09', '3b62f29e-bb43-40f0-a978-aa755a36c314'),
  -- A Sauna (Clube corintinha) (Santo André) <- Sauna do Clube do Corinthians
  ('03194c40-71c4-4e54-a00e-84168fcf8ee3', '79de57e9-d549-4d43-a416-bcd646f285f6'),
  -- Coop Queiróz dos Santos (Santo André) <- Banheiro da Coop Queiroz
  ('c6461e20-7284-4cd8-995a-acc170fb2f9b', '776a7878-4f9e-4b74-bf44-00e19f67f766'),
  -- Paranapiacaba (Santo André) <- Banheiro Paranapiacaba
  ('42d95817-25c8-46b8-814f-c0117c566805', '440bd0f5-5680-465d-9b47-0fe3720021c9'),
  -- Roldao (Santo André) <- Roldão Atacadista
  ('de5f5f60-1526-4132-b151-0bd6a067497b', 'ba3260f8-0d19-4bef-a330-507d02ee8577'),
  -- Praia da Vila (Saquarema) <- 2 Quiosque praia da Vila
  ('c00d50bf-ef05-4b02-b54c-8922d80edfe4', '8c57ede5-605a-4583-aa1c-27cbc1ff87fd'),
  -- Parque Ecológico dos Jequitibás (Sobradinho) <- Parque do Jequitibas Musculação
  ('c2090e06-91bb-40ac-b13a-669fcbcfa485', '678332d0-d2f8-4aa0-973c-7d977db71110'),
  -- Ceagesp Sorocaba (Sorocaba) <- Ceagesp Sorocaba, Vestiários dos motoristas e ajudantes
  ('1dac68ac-4771-4c0d-8677-1cd2aef79857', '421832db-1be8-4a8a-b83a-c190082f1032'),
  -- Centro esportivo Jd Simus (Sorocaba) <- Rua ao lado do Centro Esportivo
  ('9da8827f-18ca-4a8e-be1a-c98040a27c62', 'f7ac34cb-d83c-4a2c-bd67-3d8caec86d7b'),
  -- Coop Itavuvu (Sorocaba) <- Banheiro Coop av itavuvu
  ('dfae6784-ba81-46af-be8a-ebcb08dd7037', '9e1061e1-5b63-4fe7-86d9-3d028e5f38a9'),
  -- Parque da Agua (Sorocaba) <- Banheiro Parque das Aguas
  ('33eac764-dc6f-45b5-a744-31a7761f51fa', 'c97385e6-87b8-42d7-87be-218d729b9640'),
  -- Rodoviária (Sorocaba) <- Terminal e rodoviária
  ('6eb641db-99c4-4207-8a5b-0a7655c69215', 'e007958e-a1f7-41b4-8b44-ae1bc4bf6ae1'),
  -- Shopping Cidade (Sorocaba) <- Shopping Cidade L1 | Banheiro Shopping Cidade
  ('f096455a-ae89-48bc-92d3-007756303d61', '9468329c-5800-4f15-9d0a-a20337d50b0e'),
  ('f096455a-ae89-48bc-92d3-007756303d61', 'ba065bc9-2a0e-4ee6-84de-430425a93256'),
  -- Shopping Panorâmico (Sorocaba) <- Vest-Casa Shopping Panoramico
  ('ff574f1e-a17a-4b02-b4aa-28124ad8b81d', '5ee1135f-837b-40ee-8f5a-fd5db9509b6b'),
  -- Sorocaba Shopping (Sorocaba) <- Shopping Sorocaba
  ('b896c0e0-a04d-462e-9d79-6de6ec6667c9', '3031577e-17df-42f7-9fac-72032fd611ea'),
  -- Rua da Rodoviaria (Sumaré) <- Banheiro da rodoviária
  ('b4544d0d-b23d-4b8c-92b7-6434cf904d5a', '7885996a-4d7c-424e-8cff-ad1a77b1f2a1'),
  -- Tenda (Suzano) <- Tenda atacado
  ('706b1218-605e-4f92-abb8-05a8e238664e', '38be528f-8790-4058-8299-99f990184fdf'),
  -- Bem Barato (São Bernardo do Campo) <- Bem Barato Taboão
  ('ffc1b64e-4dd4-4ec4-a76a-258924fa9102', 'f84c7623-b95c-4e2d-8f1a-77517dc56463'),
  -- Coop Rua Dos Vianas (São Bernardo do Campo) <- Banheiro no estacionamento da Coop da rua Dos Vianas
  ('14ffed16-0c2a-4e9f-8ce9-afdd85ecc779', '75216cdf-e390-460f-9495-352e55c96109'),
  -- Dutos Atrás do Poliesportivo (São Bernardo do Campo) <- Ginásio Poliesportivo | Estacionamento do Ginásio Poliesportivo
  ('883ea396-1323-4158-873a-e3590901938f', '4ca0e80d-78e1-4bf9-8a7e-aa62e4f58d37'),
  ('883ea396-1323-4158-873a-e3590901938f', '17cc7bc7-0080-4ba9-9d24-0114b7359c39'),
  -- Novo Assaí Anchieta (São Bernardo do Campo) <- Banheiro Externo do Novo Assaí Anchieta (Antigo Extra)
  ('83f0093d-ac11-44b9-8307-28b3f21f194d', '532fe201-1a6f-4eb3-8704-d683310ede9c'),
  -- Terminal Ferrazópolis (São Bernardo do Campo) <- Banheiro Do Terminal Ferrazopolis | Arvores e Terreno atrás do Terminal Ferrazópolis
  ('d9e79e97-1cb7-4f0d-9db4-1afc4f6fc4c6', '83944287-fbdb-46d9-9b80-68811b192b60'),
  ('d9e79e97-1cb7-4f0d-9db4-1afc4f6fc4c6', '61612657-4132-4d91-80e4-305e5324286a'),
  -- Parque Linear Kennedy (São Caetano do Sul) <- Passarela Parque Linear
  ('61f47080-c59b-4590-8523-6ed460863c30', 'bbca134f-ceaa-4ab1-b1db-abe86b9ecdda'),
  -- Atacadão (São José) <- Atacadao Roçado
  ('d0bcab29-d541-403a-b8d1-7633e71a313e', 'c1c63544-895e-4b7b-8472-d6d998ce1813'),
  -- Banheiros Plaza Avenida Shopping (São José do Rio Preto) <- Estacionamento Plaza Avenida Shopping
  ('7b2cce7b-61cf-40ff-82df-a525e5c47022', '1661bce1-1263-4540-b4bd-62a14f4f310c'),
  -- Mata Rios di Italia (São José do Rio Preto) <- Rios de Italia
  ('1fcfa7e9-f2cc-4012-9991-4de0469be477', 'ce89497f-1822-4b1f-a6ee-f5f12fd62aa3'),
  -- Rodoviária (São José dos Campos) <- Terminal Rodoviário
  ('f21750cf-aa34-4070-aded-5d5df937a125', 'f97f5aba-65b7-4ec2-b54d-d32f6b6e6cec'),
  -- Rodoviária Nova (São José dos Campos) <- Descampado Atrás da Rodoviária Nova
  ('1110c2dc-6c55-4ace-b7bd-3d53364c8eb8', '0032d718-ab02-4e35-af13-d606790c43d9'),
  -- Shibata (São José dos Campos) <- Estacionamento Shibata | Shopping Jardim Oriente | Shopping Oriente (estacionamento) | Banheiro Shibata Shopping Jardim Oriente
  ('98a57546-5e3e-49c2-a54f-65c83afbb569', '01add299-3373-41fd-8959-81d31e63edfe'),
  ('98a57546-5e3e-49c2-a54f-65c83afbb569', '71722117-3bcc-4b30-8827-5e7a99796ed3'),
  ('98a57546-5e3e-49c2-a54f-65c83afbb569', '8996443f-3ef3-415f-92cc-a1a6f9ee5980'),
  ('98a57546-5e3e-49c2-a54f-65c83afbb569', 'ae42ebeb-b272-4459-95d7-32a654251cbd'),
  -- Área Vista Verde (São José dos Campos) <- Terreno (matagal) Vista Verde
  ('11cc9539-fc94-4176-b673-85e8ac65f85c', '7d17c9f0-d93b-4a2a-9fc3-fe95ddad1c8a'),
  -- Praça Catedral (São João da Boa Vista) <- Praças da Catedral
  ('794dda7e-8327-4315-9346-3cdba64464d7', 'c887e20b-09be-4f24-99fc-f91bb537bf16'),
  -- Matão Unisinos (São Leopoldo) <- Banheiros Unisinos
  ('2bf44ad7-0754-4e09-9193-6bec80c96667', '07cdcc13-27ae-45f9-973f-340b857e50b8'),
  -- Sense Cruising (São Leopoldo) <- Sense Cruising for men
  ('c32b4bc4-6911-4063-8ce0-4d2b6a15bab7', 'c0be2494-381c-4777-b5c8-fb1b898669ce'),
  -- Reserva Itapiraco (São Luís) <- Reserva do Itapiraco | Portão da quadra da reserva Itapiracó
  ('95181ffe-c3de-4479-92c8-e8b60ce01336', 'd2e0f313-8b6b-48bf-a09c-cf2fe15af03c'),
  ('95181ffe-c3de-4479-92c8-e8b60ce01336', '8363a68a-72ef-45a8-a13f-f87487fad8eb'),
  -- Aeroporto de Congonhas (São Paulo) <- Aeroporto de Congonhas - Desembarque
  ('a55f8126-e6ba-47d9-b434-a18931c17b33', 'd20c6930-3966-48d7-8571-1cef012c3199'),
  -- Balneário Amazonas (São Paulo) <- Balneário Amazonas Sauna Masculina
  ('feea1df4-2376-45ae-b274-90a4c89e5854', '426d2624-9225-4edd-9569-3dd64e8b5954'),
  -- Banheiro Body Tech - Market Place (São Paulo) <- Banheiro inferior do Shopping Market Place
  ('4198bf5a-2f6f-4f0b-aa82-decdeda975c5', 'd6bd9d16-e94c-4a0c-9dbf-9ab5754d51b1'),
  -- Banheiro Terminal (São Paulo) <- Banheiro Terminal Carrão
  ('cc7b0b0b-0ecb-4c56-8ef2-36e067882747', 'b9197265-7516-47ef-8a24-4f168de6cea0'),
  -- Banheiro Terminal Bandeira (São Paulo) <- Passarela Terminal Bandeira
  ('e791df0d-b5f6-49fe-bf75-b65226087fc5', '92e94833-75e4-461b-a034-41ab538da683'),
  -- Banheiro da Estação Brás CPTM (São Paulo) <- Banheiro da Estação Brás do metro
  ('b592fb10-9404-4fe1-8131-dc96effecfcc', '7eab775c-1fe0-48aa-b053-3a78f856c7fb'),
  -- Bergamini (São Paulo) <- Hipermercado Bergamini
  ('cfc3429c-761f-4d57-af1d-6ff725a439b5', '7b4014ec-0965-4061-a9dc-52c23cce3f38'),
  -- Bosque da Bio (São Paulo) <- Bosque da USP | Bosque dos bancos
  ('97337a2c-9c50-42db-8994-b9ded8375820', '1548fc31-5054-48d5-a32c-a32cb0a72b09'),
  ('97337a2c-9c50-42db-8994-b9ded8375820', '09ebc513-839c-4762-8cce-11440aa675d6'),
  -- Bresser (São Paulo) <- Saída Metrô Bresser Mooca Hospital Notredame
  ('e85be3f5-28be-4846-81e9-ead4383b5c03', '04e15c48-3cae-4e09-be5e-8bd6ede12f5e'),
  -- Engenheiro Goulart (São Paulo) <- Estação engenheiro Goulart | Pegação a noite entre Engenheiro Goulart/Parque Ecológico
  ('ce3d757f-0675-494f-99b3-57456df30731', '07938455-c244-4ead-8fba-9deac30c6dfc'),
  ('ce3d757f-0675-494f-99b3-57456df30731', 'fc126213-fa01-46b8-ab17-49de586e25c9'),
  -- Estação Cidade Jardim (São Paulo) <- Praça ao lado da estação Cidade Jardim
  ('70a833a1-9ead-4fc6-82cb-8c73300e6e59', 'c579d650-625e-43f8-b36a-eeef6542a81b'),
  -- Estação Santo Amaro (São Paulo) <- Terminal Santo Amaro
  ('d365ab4a-a6a9-43e0-a2ad-134863f48fb0', '0e132ee8-250e-4d3d-bc40-05a6cdf841d2'),
  -- Estação São Lucas (São Paulo) <- Praça próximo a estação São Lucas
  ('0e445e93-7156-4d2c-8c52-c265c0a28476', 'd7fe6094-b3ee-4839-b62c-a757466482ff'),
  -- Extra Ricardo Jafet (São Paulo) <- Praça do lado do Extra Ricardo Jaffet
  ('16269289-59ee-4c37-8731-264d68186feb', 'a76ae527-0aa8-4a4a-9167-6a9d827963a0'),
  -- Higienopolis (São Paulo) <- Estação Higienópolis
  ('e0d7324e-096d-4dce-bdb1-2c1c0ecc3677', '952f1ce0-dbfb-4ef4-bafc-f15c73749719'),
  -- Mercado Comercial Esperança (São Paulo) <- Rua atrás do mercado Comercial Esperança
  ('32c5728d-268a-4910-9195-9c9745d96e6a', 'f03fa301-f6ef-46f9-8b3a-6adce0d5f640'),
  -- MercadoCar - Aricanduva (São Paulo) <- Supermercado X Shopping Aricanduva | Banheiro do shopping Interlar Aricanduva | Shopping Aricanduva / Auto Shopping Aricanduva
  ('228213dc-f462-41d4-ab91-0aa5e59e0240', '24f626a4-7e7a-4523-9abe-9eddd6284bda'),
  ('228213dc-f462-41d4-ab91-0aa5e59e0240', '435dfb1b-9727-413a-bbd1-ac90bc7a8e73'),
  ('228213dc-f462-41d4-ab91-0aa5e59e0240', '53883e77-e2b0-47f5-b189-fb777dff1646'),
  -- Metro Penha (São Paulo) <- Rampa de acesso Metrô Penha (acesso ao terminal de ônibus)
  ('9dd57df0-2cf3-4f2a-8471-c8c2b0cf7f3c', 'b851eaee-1f00-46de-ac95-75ab3d220686'),
  -- PQ Ecológico Tietê (São Paulo) <- Trilha de Caminhada Parque Ecológico do Tietê
  ('d6e4b282-e98f-4e6a-ae96-562b7fe51111', '0fb0f625-a402-406a-9dc2-b5178be208cd'),
  -- Parque Augusta (São Paulo) <- Parque Augusta na Consolação
  ('6653cf32-cdcd-4c41-a4e6-96c14ec90247', '508cacbc-ea36-488f-aa93-90e3fb7a44dc'),
  -- Parque Carrão (São Paulo) <- Banheiro do Parque do Carrão
  ('f80f2ed4-53ae-4629-bf2f-8d4f5845e99b', 'cc9377e3-1186-42df-a9cb-0eb18eb6ea12'),
  -- Parque Dom Pedro II (São Paulo) <- Terminal Parque Dom Pedro II
  ('1d6288a6-ee68-476b-b852-b2b37915cde9', 'eb82d0fd-1b44-4a10-a191-e516ecd8c39c'),
  -- Parque Linear (São Paulo) <- Tiquatira Parque Linear
  ('b83b9319-8b3b-4f05-ba27-e3006009b49b', '271667bb-d231-4cd5-875c-f93be249bbc7'),
  -- Parque Toronto (São Paulo) <- Banheiro Parque Toronto
  ('850c74bc-f019-47d7-802f-3129e3b48b91', '09cf46ea-e6ae-4987-ad88-8126ee6abc92'),
  -- Parque da Aclimação (São Paulo) <- Banheiro do parque da Aclimação
  ('f939bc10-d390-4a03-b559-2ef3bc590186', '3fb01bcb-9248-444f-91eb-62780c1bf460'),
  -- Parque do Horto (São Paulo) <- Parque Horto Florestal | Ciclovia do Horto Florestal
  ('bfcdb938-0653-42ea-91be-3792100b2adf', '88d28917-ab33-4c0b-9d53-c2bbe52c6794'),
  ('bfcdb938-0653-42ea-91be-3792100b2adf', '992e2525-9738-48ae-b03d-45f5964d81fe'),
  -- Passarela Terminal Sacomã (São Paulo) <- Banheiro da Estação Sacomã
  ('e9eee2c0-09da-4243-9399-6e55e2a23a79', '00289b17-78be-4feb-892c-dca28dfc46da'),
  -- Patriarca (São Paulo) <- Metrô Patriarca Vila Ré
  ('170c6d90-053b-4e5d-8e6b-0a16a893493f', 'd8542ae8-e15b-452b-87a6-3a40c2877f68'),
  -- Piscinão Rincão (São Paulo) <- Piscinão da Penha | Piscinão Penha (parq rincão)
  ('ce51a6d8-91af-4859-8f4e-ca2b24bdfd5f', 'a7c1c888-009d-4601-9276-7277363b415e'),
  ('ce51a6d8-91af-4859-8f4e-ca2b24bdfd5f', '5ff818a0-3869-4588-88ea-972ef17570e3'),
  -- Posto Campeão 28 (São Paulo) <- Posto Campeão 38
  ('c638c674-1497-4fb0-a3a2-722c8d4b98cb', '1a74b09d-7ccf-4a90-ab9b-0204016dd7a9'),
  -- Prainha (São Paulo) <- Trilha da Prainha
  ('f0699311-d366-494d-b14a-5144e2abd419', 'cd34f633-03cd-4f08-b5a5-401a2804df15'),
  -- Praça Xavier de Almeida (São Paulo) <- Praça Xavier de Almeida Jardim da Saude
  ('86b0bd00-c775-434e-b317-2246e66e1e9a', 'f28acea2-11d8-4645-b33b-5b3a2f3f7c6d'),
  -- Praça cemitério Campo Grande (São Paulo) <- Atrás cemitério do Campo Grande
  ('5307c3ab-d083-48b2-b88b-b6092b03f138', '4c828229-c1ae-4a37-ab07-e9190f2ef855'),
  -- Roldao Cupecê (São Paulo) <- Árvores na calçada do Roldão Cupecê
  ('3afcd56d-9e1d-4ed9-a9e5-970b9f80bb5c', '67e922bd-d6a1-471c-a4a5-09f5002a128a'),
  -- Sesc Interlagos (São Paulo) <- Sesc Interlagos Banheiro Psicina
  ('582c1b3c-068a-4bd2-9dfc-64cc0c7899d7', '21b121b3-ac7d-4bef-a073-3ef9ceed7852'),
  -- Sesc Itaquera (São Paulo) <- Sesc Itaquera - Vestiario
  ('16b6800d-a913-4ae5-a06a-0f3082b570d5', '8f64085f-74f9-4b08-aa29-58564742e399'),
  -- Shop Cidade São Paulo (São Paulo) <- Jardim externo Shopping Cidade São Paulo | Escadas Shopping Cidade São Paulo (Inferiores)
  ('128e4167-fff0-43bb-a846-f72b0929a292', 'c6c2ed17-4626-415f-b32b-470d9fd850f7'),
  ('128e4167-fff0-43bb-a846-f72b0929a292', '81c97389-da29-46a2-bf62-b18f036deb4f'),
  -- Shopping Itaquera (São Paulo) <- Shopping metro Itaquera
  ('f9adcaf2-5485-4892-a329-0f2c84437457', 'fdf226f0-b215-43fb-bbb1-ae9607bff1b2'),
  -- Shopping Pátio Paulista (São Paulo) <- MC Donald's shopping Pátio Paulista
  ('8a30d097-bac0-4649-a629-5058459103e5', '3abe41d6-31ce-4570-92dc-b90a8462a27d'),
  -- Smartfit SP Market (São Paulo) <- Shopping SP Market
  ('b0aebd0b-ff7d-4ef3-a1a9-4a88d9376da0', '013f0af7-a622-4e8d-bba4-bbc95adf35e8'),
  -- Terminal Varginha (São Paulo) <- Obra da Estação Varginha
  ('34bc1775-6e2f-42f7-a1e2-e5485853cc4f', '0e4eaa77-d417-48a1-8e4e-aeac019bce72'),
  -- Terminal de Pirituba (São Paulo) <- Banheiro da Estação Pirituba
  ('12570c7a-66df-4c6a-9e70-bcaa27db3ad2', '1673ac93-cf8c-45a9-aacf-f861049afd41'),
  -- USP Leste (São Paulo) <- Estação USP Leste
  ('e0f96f70-30ef-4f51-848c-65bb828d0cef', 'd2130bd3-01a8-433e-b272-b93578a0773b'),
  -- Uninove Vergueiro (São Paulo) <- Uninove Vergueiro l
  ('c1268d99-e8ce-4825-a3cb-3e2fcb9389d2', 'eb42ba11-02d0-45e8-88d4-995fe7212119'),
  -- Vila Formosa (São Paulo) <- Vila Formosa - Av Abel Ferrei - Trecho Prox Mafalda
  ('630e620d-4dac-4768-b24a-5d6bca006af1', 'c53f9f95-dbd2-4123-9bc1-163ed0e3b1e1'),
  -- Boracéia (São Sebastião) <- Prainha de Boraceia | Depois do Posto de Boraceia
  ('1bf65122-5dc2-446c-b672-e56a8ed7a4dd', '5623765b-3aa9-4651-ab9a-adcd94d9384e'),
  ('1bf65122-5dc2-446c-b672-e56a8ed7a4dd', '0e88cbbd-bcf0-4c4d-899e-a4feb8113773'),
  -- Ilha Porchat (São Vicente) <- Trilha Ilha Porchat | Debaixo da laje do Ilha Porchat Clube
  ('ee7d64df-68e9-4f96-948f-71af3ff1f85b', 'fdea6ac8-e1c9-456a-bd9b-f350fcb7df3f'),
  ('ee7d64df-68e9-4f96-948f-71af3ff1f85b', '330790ae-41bc-46c6-a903-3cd1002c8fe1'),
  -- Itararé (São Vicente) <- Pedras da praia de Itararé | Praia do Itararé (teleférico)
  ('b38725ad-4aee-4d66-a047-afc75173951a', '1f31ec4f-73a3-45fb-8df6-aebef9373bec'),
  ('b38725ad-4aee-4d66-a047-afc75173951a', '8229beec-edec-4077-a5fe-7d622c74ec9f'),
  -- Cemitério Municipal (Taubaté) <- Cemitério Municipal, nos fundos
  ('85b18128-667d-4cc8-82ee-9454e60a641a', '1bc7be24-8164-4383-a4f6-5a68cefe1bfd'),
  -- Av. Maranhão (Teresina) <- Av Maranhão - Caminhadas
  ('782a8cf8-8e72-436c-bafd-62b9536a4ac7', '0249dd27-16f8-48ac-b470-27f51e4a53d4'),
  -- Parque da Cidade (Teresina) <- Parque da Cidade no primavera
  ('14508ee3-d11f-4dbe-b2e2-8b091ba923ce', 'ec002811-51b6-4b91-a3c0-1b475894d549'),
  -- Perequê Açu (Ubatuba) <- Praia Pereque Acu | Fim da praia do Perequê-Açu
  ('9ed4246e-8221-4589-b021-291f6f650dde', '54949ad2-231d-4045-a34e-3b2472180109'),
  ('9ed4246e-8221-4589-b021-291f6f650dde', '2bcdc168-225d-4512-a535-dc30790a8a21'),
  -- Praia Dura (Ubatuba) <- Atrás da ponte da Praia Dura
  ('c7203d70-0f63-4dab-a109-b3201e1e5ef0', '69b6ac8c-76f0-44ad-ace8-2388f1be276c'),
  -- Rodoviária (Uberaba) <- Arredores da Rodoviária
  ('df67bcab-f665-47c8-91c3-7ca3dc84a79d', 'a116713a-f670-4ae2-82ef-ae2021309997'),
  -- Fim Da Rua Da Carioca (Uberlândia) <- Rua JW 4 Próximo a Rua da Carioca
  ('e8c0a270-19d4-45c3-83d8-b23941006c5a', '7958d005-9856-4eff-a271-d2332bd33703'),
  -- Parque do Sabiá (Uberlândia) <- Trilhas Parque do Sabiá
  ('9b8152c7-9f55-4b38-8948-edc06f6d26dd', 'e2ba616c-886e-4549-9b10-3491bd17e99b'),
  -- Parque linear Río Uberabinha (Uberlândia) <- Parque Linear do Rio Uberabinha
  ('1b928869-ad27-47cf-9018-918996b3ebf8', '6f3f2d3d-047c-4e40-9170-af4e44314612'),
  -- Bretas (Varginha) <- Estacionamento do Bretas
  ('e19c2c39-30b1-4efa-8b2d-182a13f9503b', 'a0296512-b724-4add-8efa-d15787196253'),
  -- Represa 1 "João Gasparini" (Vinhedo) <- Represa 1 "João Gasparini": Trilha do Amor | Represa 1 "João Gasparini": Trilha do Pedal | Represa 1 "João Gasparini": Trilha da Árvore | Represa 1 "João Gasparini": Trilho do Trem Sanebavi | Represa 1  "João Gasparini": Campo de Futebol Gramado
  ('93338d8b-875c-4287-b8a5-01a54bf14e91', 'ee58d9e7-e99f-42b8-acb6-f6dcc3a26c95'),
  ('93338d8b-875c-4287-b8a5-01a54bf14e91', '592d5ec6-83fb-4543-8a96-a88b66571fbe'),
  ('93338d8b-875c-4287-b8a5-01a54bf14e91', 'c7cf33d0-564e-4ad1-ac9e-53c30b38563f'),
  ('93338d8b-875c-4287-b8a5-01a54bf14e91', '7c023eb5-a4ab-4a37-a62c-ec695a3ad43e'),
  ('93338d8b-875c-4287-b8a5-01a54bf14e91', 'e4d2265c-236b-4c40-b6b3-65d0d196c4ba'),
  -- Pontual Shopping 2 Andar (Volta Redonda) <- Banheiro do Pontual Shopping
  ('9c1da137-81b2-41d4-b332-80dfb8eafa69', '338ed34e-2ad9-443b-b250-fd34e0c2a098'),
  -- Campolim (Votorantim) <- Ponto 2 Campolim | Ponto 3 Campolim | Ponto 1 Campolim | Ponto 4 Campolim | Pista de caminhada do Campolim | Jardim japonês, Campolim próximo pista de caminhada
  ('5d5af3ce-d9de-43e7-b6db-5f696ec58a2d', '99eb65ec-168d-4582-9cc6-a8e05500e976'),
  ('5d5af3ce-d9de-43e7-b6db-5f696ec58a2d', '396fdb75-2c58-41ea-9d37-28f35fd66a1d'),
  ('5d5af3ce-d9de-43e7-b6db-5f696ec58a2d', 'd93bbedf-8116-4f51-92ff-2a714266e1bc'),
  ('5d5af3ce-d9de-43e7-b6db-5f696ec58a2d', '875a1530-cea4-43a9-91cf-5afe963f6147'),
  ('5d5af3ce-d9de-43e7-b6db-5f696ec58a2d', 'a6321716-a848-4511-962c-0d36aa3780b0'),
  ('5d5af3ce-d9de-43e7-b6db-5f696ec58a2d', '35f426b5-a1f9-4a9f-a087-5a0d12f76c72'),
  -- Praça de Eventos (Votorantim) <- Banheiro Praça Eventos
  ('6a5e9de8-285a-4b95-aaa2-3a67aee9a5a9', 'a76a89da-164c-4122-876f-9a32ce654f7a'),
  -- Shopping Alegria Cinema (Várzea Paulista) <- Banheiro do Shopping Alegria
  ('c6c32467-300a-4f25-a20a-1cd6730c2249', '5b2bded4-72d4-4024-b662-c35eab02782f'),
  -- Vencedor (Várzea Paulista) <- Supermercado vencedor
  ('90205d95-9f1c-46e1-a58f-2913eddb53e9', '7b72224b-8429-40b8-8270-708ab686d1fb'),
  -- Araçatuba Shopping (no city) <- Avenida Joaquim Pompeu perto do Araçatuba Shopping
  ('ce2b4b6a-cad6-4c35-a8c1-2a1b649a5ded', '0899e66a-9c50-4e21-bf18-8a857aba548e'),
  -- Barreiro (no city) <- Barreiro perto da antiga prefeitura
  ('967ba237-2e03-4eb1-9a87-de401b2d624d', '2459a894-d7db-4032-b778-bb7567b9ea69'),
  -- Cabines Eróticas Bangu (no city) <- Cabine Erótika Bangu - Glory Hole
  ('64120544-8589-4779-9cf7-4276cf1c14f3', '5c577eb0-6fde-4e0a-9bf8-2b2761cdeb7c'),
  -- Celtra (no city) <- Banheiro do Celtra
  ('ba85382e-265f-4d12-9ec6-006bba1ba745', '45d9a935-64f7-47e2-ac3a-cb3f327ff413'),
  -- Cemiterio (no city) <- Banheiro Cemitério
  ('f04a1798-9182-4521-b9df-294cf68f19cf', 'd59637c4-ea3e-4918-8f8b-da38fbecec8d'),
  -- Chacara Flora (no city) <- Lagoa da Chácara Flora
  ('a1fe2481-876a-4ea6-9fe8-39287f445bdd', '53afaa03-35cd-40e8-8094-f290f8f5775a'),
  -- Club Cine Hot (no city) <- Cine Hot
  ('ef02bc37-263a-4ed6-9b2d-9e6ec1445e0a', '2e64c95a-d668-4d63-b3de-2a81759a6f1f'),
  -- Cruzeiro (no city) <- Estrada proxima ao cruzeiro
  ('e3d91a15-ed73-40a8-8bd6-b3d88b9acd34', '78c27f45-8b10-4dae-98dd-cdd7f353b804'),
  -- Encostas entre as Praias Resende (no city) <- Encostas entre as praias da Concha, Resende e Tiririca
  ('c3865375-8593-4ffb-a6eb-edf576e2a401', 'fddad7ad-c3d9-476c-acfd-ee2cef853be5'),
  -- Estação Rodoviaria (no city) <- Rodoviária de Osório
  ('f20c72f7-a692-41c5-ad8b-acbe0ea3506f', 'bae1b650-ba97-4f2d-9dd3-dfdb2ff66b78'),
  -- FENAC (no city) <- Rua atrás da Fenac | Banheiro da Estação Fenac
  ('d04b96da-205d-48ec-85a6-7b73ea1163ef', '9d108faf-aedf-42a0-b119-a3b04506790c'),
  ('d04b96da-205d-48ec-85a6-7b73ea1163ef', '874b1a28-b24e-4978-9e25-41f84e0f6d95'),
  -- Ilha Comprida (no city) <- Pontes Ilha Comprida
  ('8e7e41e6-5960-4c1a-9016-5ce129aeda58', 'd288121f-9445-4aae-b03a-276b48d26545'),
  -- Lago Negro (no city) <- Banheiro Lago Negro
  ('d2e4b724-ab07-47a2-b30e-4c8ef87e16a7', '35e9b5d3-97b7-40ef-a921-914aea13a4c0'),
  -- Lago dos Buritís (no city) <- Parque dos Buritis
  ('61a3a829-59fd-496a-bbf4-a8177a117a92', '953a48c3-2890-4fd1-9579-cebd887630d5'),
  -- Mato da Farroupilha (no city) <- Entrada da Trilha pela Farroupilha
  ('9929bdf7-7ede-4a51-aced-79e21c7af294', '1bca9343-65a1-4951-83a9-660059be76cb'),
  -- Mercado Joanim (no city) <- Supermercado Joanin
  ('a6d60510-ab58-4089-bfc4-e9b16ebc6dcb', '6c05124d-709d-4bff-aa3d-31ffc3156a79'),
  -- Parcão (no city) <- Antiga Trilha Do Parção
  ('a1cd7966-ad50-4a1a-9e57-68d2f819df14', '6869bc77-4a4a-4224-a89e-013885e539b2'),
  -- Parque da Cidade Sarah Kubitschek (Cruising) (no city) <- Estacionamento 3 Parque da Cidade | Parque da Cidade, Perto do Laguinho
  ('fd50e5c3-faba-423b-976b-ed22282cdfc7', '5226d4ff-f482-442a-96b6-e07f6c1919ac'),
  ('fd50e5c3-faba-423b-976b-ed22282cdfc7', '0e0c9579-1eca-4ed7-8625-12530340b119'),
  -- Parque do Ibirapuera (cruising) (no city) <- Parque Ibirapuera | Banheiro Portão 6 Ibirapuera
  ('66640d96-4321-4a46-af43-539ead8717f3', '22283cbf-d0c3-4904-aa3d-7765967bf446'),
  ('66640d96-4321-4a46-af43-539ead8717f3', 'bc4b6f0e-51bf-4033-9511-2081a174da4b'),
  -- Porto Novo (no city) <- Orla entre Indaiá e Porto Novo
  ('8717a005-105c-45e4-bdc7-a57d1f371158', 'e540e96b-1eea-462b-8076-c64a4be64654'),
  -- Posto Tabocão - DAIA (no city) <- Banheiro Posto Tabocão
  ('d77542e1-f42e-4556-a42f-cb3ae1010920', '7dafdba7-bcc5-4f2d-a9df-093e35e3fd6b'),
  -- Praia Brava (no city) <- Praia Brava Pedras do lado Esquerdo
  ('91d265c2-7212-4225-8861-c59fd7555778', 'fcd2f74f-d1e1-4473-8c65-5427c74cf885'),
  -- Praia do Buraco (no city) <- Passarela Praia do Buraco na Barra norte
  ('f122408a-c717-4268-9f27-da10842f2e60', '58b8c02c-5bfd-4a8d-850e-60a30d26189b'),
  -- Praça da Moça (no city) <- Shopping Praça da Moça
  ('86e72dff-b6d7-4691-987d-bbe45849a62c', '6205c160-0716-474b-bccf-ceb8619e6c1e'),
  -- Terreno - Mercadão de Madureira (no city) <- Banheiro do Mercadão de Madureira
  ('d9d435db-e7f0-4784-aed9-7444a0b2519b', '2ef5200d-a0a0-4340-9ace-0603fc848dec');

-- 2. Enrich keepers before the merge (fill-if-empty only; planet-randy's
--    translate.google.com wrappers are never copied).
update public.venues k
   set website = coalesce(nullif(btrim(k.website), ''), d.website),
       phone   = coalesce(nullif(btrim(k.phone), ''), d.phone),
       address = coalesce(nullif(btrim(k.address), ''), d.address)
  from (select distinct on (p.keep_id) p.keep_id, d.website, d.phone, d.address
          from _br_pairs p join public.venues d on d.id = p.drop_id
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
  for r in select * from _br_pairs loop
    k := pg_temp.terminal(r.keep_id);
    d := pg_temp.terminal(r.drop_id);
    if k = d then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform public._venue_merge_core(k, d, null);
    v_merged := v_merged + 1;
  end loop;
  raise notice 'BR cruising dedup: merged %, already together %', v_merged, v_skipped;
end
$merge$;

-- 4. Close open review rows for any two members of the same cluster.
update public.dedup_review_queue q
   set status = 'approved',
       reviewed_at = now(),
       reviewer_note = 'manual BR cruising dedup 99991791636544'
 where q.status = 'open'
   and q.entity_type = 'venue'
   and exists (select 1 from (select keep_id, keep_id m from _br_pairs union select keep_id, drop_id from _br_pairs) a
                 join (select keep_id, keep_id m from _br_pairs union select keep_id, drop_id from _br_pairs) b
                   on a.keep_id = b.keep_id
                where a.m = q.keep_id and b.m = q.drop_id);

-- 5. Postconditions: end state, not this file's own writes.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from _br_pairs p
   where pg_temp.terminal(p.keep_id) is distinct from pg_temp.terminal(p.drop_id);
  if v_bad <> 0 then raise exception 'P1 failed: % pairs do not resolve to one venue', v_bad; end if;

  select count(*) into v_bad from (select distinct pg_temp.terminal(keep_id) t from _br_pairs) s
    join public.venues v on v.id = s.t
   where v.duplicate_of_id is not null;
  if v_bad <> 0 then raise exception 'P2 failed: % survivors are not live', v_bad; end if;

  select count(*) into v_bad from _br_pairs p
    join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id is not null
     and not exists (select 1 from public.venue_merge_audit a
                      where a.drop_id = p.drop_id and a.undone_at is null);
  if v_bad <> 0 then raise exception 'P3 failed: % merged drops have no live audit row', v_bad; end if;

  -- P4: old and new bus stations of São José dos Campos are different places.
  select count(*) into v_bad from public.venues
   where id in ('f21750cf-aa34-4070-aded-5d5df937a125', '1110c2dc-6c55-4ace-b7bd-3d53364c8eb8')
     and duplicate_of_id is null;
  if v_bad <> 2 then raise exception 'P4 failed: SJC Rodoviária / Rodoviária Nova must stay separate (% live)', v_bad; end if;
end
$verify$;
