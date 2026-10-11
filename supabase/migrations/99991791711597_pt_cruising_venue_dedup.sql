-- Cruising-venue dedup for Portugal (2026-10-11).
--
-- Sixth pass after DE (99991791632592), the multi-source countries
-- (99991791634999), BR (99991791636544), ES (99991791636873) and Spanish-
-- speaking Latin America (99991791637198). Portuguese rows are almost all
-- gays-cruising submissions, so duplicates are repeat submissions of one spot
-- (Porto's "Parque da Cidade" six times, "Montemor" three times, the toilet
-- and the car park of one supermarket listed separately).
--
-- Method: every pair of live category='cruising' PT venues within 1.5 km
-- whose names agree after a Portuguese normalisation (praia, parque/jardim/
-- mata/pinhal/bosque, estacionamento, área de serviço, WC/casa de banho/
-- sanitários, centro comercial/shopping, estação; accents and trailing
-- numbers stripped): about 190 candidate pairs, all read by hand. About 120
-- are different places sharing a word (toilets of different stores, a
-- station vs a park of the same town, a gym inside a mall, a hotel next to a
-- wood) and are NOT touched. Named sub-spots of one place (entrances of one
-- park, toilet and car park of one store) are merged, per the site owner.
-- A mall and the gym inside it are asserted to stay separate (P4).
--
-- 70 drops in 61 clusters. Keeper = gayout or multi-source row, otherwise
-- the place name; one keeper is renamed to the place itself.
-- _venue_merge_core copies no fields, so keepers are enriched fill-if-empty
-- first; every merge is schema:1 and reversible with unmerge_venues().
--
-- Soft on preconditions: both sides resolve to their live terminal, so a pair
-- another session already merged (either direction) is a no-op. Hard on
-- postconditions: end state only.


set local statement_timeout = '300s';

create temp table _pt_pairs (keep_id uuid, drop_id uuid) on commit drop;
insert into _pt_pairs values
  -- Algueirão-Mem Martins | Mata das Mercês <- Mata ao lado do Clube de Futebol de Merces
  ('6be81f67-e537-44d2-97e7-86fe4b28a135', 'fb5156ce-1898-4100-be06-e9f3ab3db521'),
  -- Aveiro | Estacionamento Estádio Municipal de Aveiro <- Parque Estacionamento do Estádio Municipal de Aveiro
  ('daf3ad95-a075-4981-98ff-9b31e413ca66', 'ff495c8e-c642-4108-9fd1-626557b994e2'),
  -- Aveiro | WC Glicínias <- Glicinias Casa de Banho Piso1
  ('0e9e8d5c-3286-4bc2-b347-b8b2dd847698', 'd3051818-7cf5-476b-8164-a81136af5870'),
  -- Beja | Estacionamento Continente <- Casa de banho Continente
  ('6e352a5e-7efe-4da8-b341-0ab01bc6d7b2', '8b2af96d-cc18-423a-a9af-473ef8571d83'),
  -- Braga | Centro Comercial Nova Arcada <- Próximo ao Shopping Nova Arcada
  ('f304b1cf-62e0-4a8f-ad01-3f79b97f78b1', 'cff7f563-5a5f-4950-bef0-44e812debb3f'),
  -- Braga | Parque atrás do E.Leclerc <- W E.Leclerc
  ('85d55e88-204c-4c64-97db-048ed1bf5b85', '6c26ec48-6d88-456c-9c48-f2292aecc1a2'),
  -- Braga | WC Braga Parque <- WC Braga Parque
  ('1faece5c-786c-49e2-a881-6d2fab29fe60', '2268750d-2bba-4a06-8be7-dfcf2e34fc5e'),
  -- Carcavelos | Bosque de Carcavelos <- Estacionamento do bosque de Carcavelos
  ('ce1f7df3-2a4a-46d9-b84b-8b237788d5b9', 'b5bb94be-c9f1-452f-a6e3-d0032bda9824'),
  -- Carcavelos | Bosque de Carcavelos <- Bosque esquerdo Carcavelos
  ('ce1f7df3-2a4a-46d9-b84b-8b237788d5b9', '4d639ccf-8892-4a01-ae69-37bc7c308b96'),
  -- Cascais | WC's CascaisVilla <- Passagem subterranea do CascaisVilla
  ('c0a4a82b-b3c5-4224-886a-f98e4f9f9623', 'b1b3091a-722d-446b-8bb0-5eb3d98c3d3c'),
  -- Oeiras | Mata do Jamor <- Spot Jamor
  ('a57cb602-2c94-4d6d-ae74-e0b69c28f461', '0d599ca9-e7d3-4edb-8e52-29531c70f881'),
  -- Faro | Airport Toilets <- Airport toilet front Carlsberg
  ('14b24609-a9bb-4cc7-baea-c994c6e363c5', '923b3645-10ea-43ed-a202-017581429690'),
  -- Felgueiras | Santa Quiteria <- Wc Santa
  ('dae29aa0-ef70-4348-ab58-81e0c193e4f9', '5be35fde-d757-487a-9b25-ce1ee577bb38'),
  -- Figueira da Foz | Cruzamento Praia Costa de Lavos <- Cruzamento Costa
  ('a4be4129-9dd7-4972-806a-1799f77b609c', '5f849e87-e5c0-4903-bd38-fdbf6121e4bc'),
  -- Guimarães | Parque da Cidade <- Parque da Cidade Guimaraes
  ('77193b72-c4eb-4694-b632-a66b55cef537', 'fa1722bf-eeea-44fc-9fcd-0da519f08d63'),
  -- Lagos | Meia Praia Dunes <- Estacionamento Meia Praia
  ('86be7adc-32d2-4019-92fa-7cc6e86fcc84', '0120bdc4-e689-4163-8e4f-e707279f8439'),
  -- Leiria | Casas de Banho Centro Comercial D.Dinis <- Casas de Banho do Centro Comercial D.Dinis
  ('d1ea7327-c935-496f-97a8-2c89f165a43e', 'e53cf77a-f3a1-412e-bcfe-7b959dfab6fc'),
  -- Leiria | Zona Industrial da Cova das Faias (ZICOFA) <- Zicofa zona industrial Leiria
  ('87e62139-7c38-45c4-a05e-2669b59f6ffb', 'de2164a5-2f53-4886-b6a8-a48316b00177'),
  -- Lisboa | Cidade Universitária <- Estacionamento faculdade de Direito - Cidade Universitária
  ('d8e8e99e-c2c3-4f84-b4b8-1d5b9ff38965', 'df45e4c3-2ef1-4a2e-b4b2-28eca426abe7'),
  -- Lisboa | Jardim do Príncipe Real (Cruising) <- Jardim do Príncipe Real
  ('f3936ed5-b69e-47b8-bbeb-7e16ef852f83', 'bbd4badc-4d85-478b-b704-09cca398118a'),
  -- Lisboa | Mata de Alvalade <- Mata de Alvalade sigiloso
  ('fd2b5e1e-fa1d-4674-a0c4-c4105f0c6aae', 'cb01cae2-a8da-44a1-81dd-d250f7cf54b9'),
  -- Lisbon | Drako <- Drako Cruising Bar
  ('327482ac-5bd8-4446-8625-6d165f1c1a9d', '748540f6-71f4-4bc9-a02b-606a3521d6a7'),
  -- Lisbon | Parque da Marques de Pombal <- Estacionamento subsedo Marquês de Pombal
  ('7370deca-2354-481a-87a3-29266f6294b9', 'd48e8747-f11e-4b33-9c8f-0d7ee5726055'),
  -- Lisbon | Parque Eduardo VII (Cruising) <- WC Parque Eduardo VII
  ('a5d06182-62d1-43db-8fa9-f2ae4ff5e047', '0dd99e4a-5bb3-47f6-ab11-4b724796bab9'),
  -- Loulé | Estadio Parking <- Estádio Park
  ('e6964d40-a877-45c8-b45e-7658bef613b3', '322e8aa0-b4f1-4306-a454-02a103a5f97a'),
  -- Loures | Parque de Montemor <- Montemor
  ('5b68b890-8cae-4cd6-a87a-b36a077c9bbd', 'a2d31c6e-2a66-4388-bc8e-857945fdaaf9'),
  -- Loures | Parque de Montemor <- Montemor
  ('5b68b890-8cae-4cd6-a87a-b36a077c9bbd', 'c9e8cf54-c5e1-4f6b-956f-e7096c8fd0fd'),
  -- Lousada | Area de Serviço Lousada <- Por cima da área de serviço Felgueiras sentido Lousada
  ('fb2d3461-f7eb-448b-a452-f34a9db506ca', 'ef538b6a-03f8-4d04-9fef-4a9b4faa856f'),
  -- Lousada | WC Leclerc <- Traseiras Supermercado Eleclerc
  ('34b6d7fe-b6af-4f77-9f7d-213e569e780d', 'e87bbb26-c56c-44d1-a7ec-b3cbc9e076f5'),
  -- Maia | Aerodromo da Maia <- Folgosa Aerodromo da Maia
  ('bb0dec0f-f0d1-405c-ab9b-5549104462f2', 'bb7acc70-c790-41e3-8025-7361cd14c093'),
  -- Matosinhos | Praia do Aterro <- Estacionamento Praia do Aterro traseiras da Petrogal
  ('55731ce4-1949-4e1c-8bfa-d9b8724b09a2', 'a76b51da-23b9-47d3-8246-de1d990bd176'),
  -- Montijo | Casas de banho do E.Leclerc <- Traseiras do E.Leclerc
  ('12f1081f-4b7f-4444-9d8e-3e469664c251', 'b3bbbc0b-0a4a-4355-930c-493621a5e5cd'),
  -- Oeiras | Fontainhas <- Parking Praia das Fontainhas
  ('3e48a63d-37e9-48ba-9aa4-3f8f23ba6642', '8991a67b-afa5-473b-aa3a-0c7dc36d9806'),
  -- Oliveira de Azeméis | Parque de La-Salette <- Caminho a descer a estrada das pescinas La Salette
  ('d138d5ef-98a7-4627-a0df-c8dc29865f3c', '7b3b6d86-e8d1-4c27-baa0-5a2015a92c1f'),
  -- Ovar | Praia de Esmoriz <- Esmoriz
  ('8558cb27-faa5-46fc-ba50-4d05be2b854c', 'f696ee8d-6a8a-4045-a851-1b5bb536df30'),
  -- Ovar | Praia Furadouro <- Praia do Furadouro (Zona Norte)
  ('d5a419f2-5512-42ea-8dab-e609a3829e2d', '01b30d9a-b4e6-41ec-910a-dce473cf4f4a'),
  -- Peniche | Dunas Baleal <- Dunas
  ('562217ed-03da-41e0-ae7b-f7d82e7f1101', '9da4193d-3f4b-4225-be02-8b034c9d1012'),
  -- Peniche | Dunas Baleal <- Praia Baleal
  ('562217ed-03da-41e0-ae7b-f7d82e7f1101', '2d38062e-8822-4e4f-aade-73e656818194'),
  -- Porto | Alameda / Dolce Vitta Shopping <- Alameda Shopping wc piso 4
  ('5f5d9c93-3052-4121-b022-94c4ed92afd3', '845c094a-879f-4b7c-861c-92233f6af92b'),
  -- Porto | Mata Areosa <- Areosa
  ('4c51f143-89c2-48ff-8f48-97c2001736f1', '38713e2b-8cde-4eeb-85fa-e5bf32bfe989'),
  -- Porto | Rua Santo António de Contumil <- Contumil
  ('fbe46120-a8e0-4fc4-99a4-59a65093af48', 'cd9cc062-5fed-4c80-a105-0bdc69659206'),
  -- Porto | Intermarche Vila Nova da Telha <- Estacionamento Intermache Vila Nova da Telha
  ('2e793547-d621-4174-8958-a19c58568046', 'b98df916-0645-4b69-b701-2930f915d03a'),
  -- Porto | Parque da Cidade (Cruising) <- Parque da cidade
  ('4eecf67a-138e-4f74-93a5-17156923a6ad', '688fdf1a-1fd8-40aa-8954-987c6b78349f'),
  -- Porto | Parque da Cidade (Cruising) <- Mato Parque da Cidade
  ('4eecf67a-138e-4f74-93a5-17156923a6ad', 'f753cdfe-c994-43f1-965a-f54ccfad12a7'),
  -- Porto | Parque da Cidade (Cruising) <- Parque da Cidade Anfiteatro
  ('4eecf67a-138e-4f74-93a5-17156923a6ad', '02902cac-18bb-4383-9665-ec5a4c2aa363'),
  -- Porto | Parque da Cidade (Cruising) <- Parque da Cidade, entrada Este
  ('4eecf67a-138e-4f74-93a5-17156923a6ad', '0810d6f7-bed3-4bbb-84d0-c73c88e7e23c'),
  -- Porto | Parque da Cidade (Cruising) <- Parque da Cidade: Entrada Norte
  ('4eecf67a-138e-4f74-93a5-17156923a6ad', '2f298365-23b0-4136-908e-a8d57f0ab966'),
  -- Porto | WC Pingo Doce 24 de Agosto <- Parque de Estacionamento 24 Agosto
  ('f64b77b0-d6eb-4b07-80d6-82885ce8a300', '16d4f89e-2e18-47fa-9b26-9296081bce6d'),
  -- Porto | Prado do repouso <- Estacionamento do Prado
  ('88ea5fc3-cee2-49bd-8bf5-1a86e72ecd3f', '93cda036-0fe0-413f-baa8-c2ae33edd576'),
  -- Porto de Mós | Pingo Doce - São Jorge <- Cerâmica pingo doce são Jorge
  ('1ae187fa-167f-4062-bb6f-c2fbbcea1fec', '69244b26-ca95-4fc9-a66b-736cd824420f'),
  -- Póvoa de Varzim | Praia da Estela <- Mato Estela
  ('dad76d4e-b03c-4614-8945-f7adbc1be24e', '720dd84c-8e75-4a31-948f-f3a02ba7fd25'),
  -- Póvoa de Varzim | Praia da Aguçadoura <- Aguçadoura
  ('27c1cefe-ef24-4e79-95f0-ae6e63f78e23', '86ea8a34-b57f-43ef-8aed-9855702c583a'),
  -- São João das Lampas | Praia da Vigia <- Mata da Vigia
  ('12483c10-86dd-472e-a96c-cb2cd3016d53', 'dd9bafac-b47c-436c-8a6f-dddb506a7f90'),
  -- Seixal | Parque Industrial do Seixal <- Zona Industrial
  ('6c27a86d-709f-4d7f-afff-7e703e6a1ec4', 'f69bff9e-ff87-4a83-9829-5979b80d65fb'),
  -- Torres Vedras | Arena Shopping <- Está localizado na parte de trás da Arena
  ('d2ba80f1-d327-47ee-9914-2c356eefd43e', '0dcb647d-93e4-436a-aa4a-d45c0a33d1e6'),
  -- Torres Vedras | Castro Zambujal <- Caminho Pedonal Castro Zambujal
  ('03bb26bf-925b-4e23-a68e-6fa55cebddba', '9ae6300f-5a44-4944-a27e-75244a6e766f'),
  -- Trofa | Capela S. Pantaleão <- Capela de Sao Pantaleao-Muro
  ('1778736e-4695-47d6-81e8-babfc6c1de8a', '3097dd30-181a-4658-b1a3-ead0328f5c1d'),
  -- Valongo | WC Continente Valongo <- Acima do continente de Valongo
  ('351a1104-41e3-4a37-b150-c47d829e88aa', '4d163fb9-6db7-455f-ac03-97478753e4f2'),
  -- Viana do Castelo | Praia do Rodanho <- Playa do Rodanho
  ('50d7cdaa-b2f3-4f53-801e-1e58941e6a3c', '6135cd1c-1609-4422-a5ee-1bbfe901d9ba'),
  -- Viana do Castelo | Praia do Rodanho <- Entre Amorosa e Rodanho
  ('50d7cdaa-b2f3-4f53-801e-1e58941e6a3c', '4ae3f5c2-fa5a-43b3-a2ca-82ac0ff2fe03'),
  -- Vila do Conde | Estádio Rio Ave <- Junto ao Estádio rio Ave
  ('0f0e8f49-6e7f-43a1-b898-f53b0e3fa065', '2dab5a2b-a81a-4421-8386-e435bc657db8'),
  -- Vila do Conde | Reserva Ornitológica do Mindelo <- Reserva Mindelo
  ('cf5c7bc4-3178-4d72-ae18-2b525cf0e791', '2ead6ac9-00f6-41e8-baf2-b4af99a780c4'),
  -- Vila Nova | Escaleiras Bar <- Escaleiras
  ('461ba99d-623c-4824-8128-168795638704', 'bb9c12f8-cd01-497c-92a3-2ee7e6ac6d9e'),
  -- Vila Nova de Famalicão | Centro Comercial Lago Discount <- WC Parque Estacionamento Lago Discount
  ('4854236c-5d6c-4ae1-a606-70fbbd99457b', 'ee5f0e18-742c-4086-98de-4cb67cb7b170'),
  -- Vila Nova de Famalicão | Parque da Devesa <- Parque de Estacionamento da Devesa
  ('7ee76891-33c0-4b57-b706-924fe45304bd', '64828690-c21c-4d51-8987-ca9aa5efbf49'),
  -- Vila Nova de Famalicão | Parque da Devesa <- Wc Parque da Devesa
  ('7ee76891-33c0-4b57-b706-924fe45304bd', '78c6931d-63e7-4972-b769-61b17b7cfb33'),
  -- Vila Nova de Gaia | Antiga seca do Bacalhau <- Antiga Seca
  ('2c5d90be-4587-457b-9fa5-3cc4a6380803', '65e96d0a-993b-4f7b-96c8-1071992c6804'),
  -- Vila Nova de Gaia | Lavadores <- Beaches-Lavadores
  ('7476c609-caba-4dee-a4c5-9b15b7dda926', '7b426eb9-7534-4660-9b97-99fc8dfe5757'),
  -- Vila Nova de Gaia | Rua Santa Maria Olival <- Olival
  ('a77d9483-dead-40ac-a04d-1d99a872c802', '8ff37891-e552-461f-bb81-aee756888531'),
  -- Vila Nova de Gaia | Arrábida Shopping <- Parque estacionamento Jardins da Arrábida
  ('86a026ad-96f3-4bbb-a029-debb6ed0d234', '1045e0fe-86a6-437e-99b3-c99d6c54374e');

-- 1. Keeper names (guarded on the current name).
update public.venues set name = 'Bosque de Carcavelos' where id = 'ce1f7df3-2a4a-46d9-b84b-8b237788d5b9' and name = 'Bosque-Carcavelos-Lisboa';

-- 2. Enrich keepers before the merge (fill-if-empty only; planet-randy's
--    translate.google.com wrappers are never copied).
update public.venues k
   set website = coalesce(nullif(btrim(k.website), ''), d.website),
       phone   = coalesce(nullif(btrim(k.phone), ''), d.phone),
       address = coalesce(nullif(btrim(k.address), ''), d.address)
  from (select distinct on (p.keep_id) p.keep_id, d.website, d.phone, d.address
          from _pt_pairs p join public.venues d on d.id = p.drop_id
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
  for r in select * from _pt_pairs loop
    k := pg_temp.terminal(r.keep_id);
    d := pg_temp.terminal(r.drop_id);
    if k = d then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    perform public._venue_merge_core(k, d, null);
    v_merged := v_merged + 1;
  end loop;
  raise notice 'PT cruising dedup: merged %, already together %', v_merged, v_skipped;
end
$merge$;

-- 4. Close open review rows for any two members of the same cluster.
update public.dedup_review_queue q
   set status = 'approved',
       reviewed_at = now(),
       reviewer_note = 'manual PT cruising dedup 99991791711597'
 where q.status = 'open'
   and q.entity_type = 'venue'
   and exists (select 1 from (select keep_id, keep_id m from _pt_pairs union select keep_id, drop_id from _pt_pairs) a
                 join (select keep_id, keep_id m from _pt_pairs union select keep_id, drop_id from _pt_pairs) b
                   on a.keep_id = b.keep_id
                where a.m = q.keep_id and b.m = q.drop_id);

-- 5. Postconditions: end state, not this file's own writes.
do $verify$
declare
  v_bad int;
begin
  select count(*) into v_bad from _pt_pairs p
   where pg_temp.terminal(p.keep_id) is distinct from pg_temp.terminal(p.drop_id);
  if v_bad <> 0 then raise exception 'P1 failed: % pairs do not resolve to one venue', v_bad; end if;

  select count(*) into v_bad from (select distinct pg_temp.terminal(keep_id) t from _pt_pairs) s
    join public.venues v on v.id = s.t
   where v.duplicate_of_id is not null;
  if v_bad <> 0 then raise exception 'P2 failed: % survivors are not live', v_bad; end if;

  select count(*) into v_bad from _pt_pairs p
    join public.venues d on d.id = p.drop_id
   where d.duplicate_of_id is not null
     and not exists (select 1 from public.venue_merge_audit a
                      where a.drop_id = p.drop_id and a.undone_at is null);
  if v_bad <> 0 then raise exception 'P3 failed: % merged drops have no live audit row', v_bad; end if;

  -- P4: a mall and the gym inside it are different venues and must stay separate.
  select count(*) into v_bad from public.venues
   where id in ('99687e68-2e46-4e03-9522-b1c900d903be', 'fdcdf9ed-9342-4f9c-9533-8ec3c34e992b')
     and duplicate_of_id is null;
  if v_bad <> 2 then raise exception 'P4 failed: Shopping Cidade do Porto / Fitness Hut must stay separate (% live)', v_bad; end if;
end
$verify$;
