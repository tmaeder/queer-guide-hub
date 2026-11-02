-- SchlagerNackt-Party / NacktSchlagerBall (Berlin): past and announced dates.
--
-- The platform held exactly one date of this series: 0b57695f "NacktSchlagerBall",
-- Metropol, 2026-08-30 (ingested from Siegessäule). The organizer publishes the
-- complete history at https://nackt-schlager-ball.de/archiv/ — SchlagerNackt-Party
-- Nr. 1–110 (2003-08-16 … 2025-10-26) and NacktSchlagerBall Nr. 1–4 (2026), plus
-- the next date (2026-12-27, Metropol, 19–2 Uhr) on the homepage. This migration
-- adds the 114 dates that are missing; NSB Nr. 3 is the existing row and only
-- gains its edition label and the organizer source.
--
-- Venues per the organizer's own era headings: Ackerkeller (Ackerstr. 12 for Nr. 1–2,
-- Bergstr. 68 for Nr. 3–24), Kastanienkeller (25–26), Loreley (27–36), Zur Möbelfabrik
-- (37, 39), old SchwuZ Mehringdamm 61 (38, 40–51), SchwuZ Rollbergstr. 26 (52–110),
-- then Metropol / SO36. Loreley and Ackerkeller have no venue row; they are kept as
-- venue_name text only rather than linked to a guess.
--
-- Start times: 17 dates are verified on siegessaeule.de (19:00, 21:00 for 2013-08-15,
-- 18:00 for NSB 2026). For the rest the organizer states 19:00 entry; that time is an
-- ASSUMPTION and is stamped as such in field_provenance.start_date.time_source.
--
-- Idempotent: a date is inserted only if its organizer source row
-- (nackt-schlager-ball, snp-N / nsb-N) does not exist yet.

do $$
declare
  v_city    uuid := '5761c6c4-3ed6-4429-832b-025e508db544';  -- Berlin
  v_country uuid := 'fd9997de-bf8f-49a5-a641-9240a39541ff';  -- DE
  v_archive text := 'https://nackt-schlager-ball.de/archiv/';
  v_today   date := (now() at time zone 'Europe/Berlin')::date;
  r record;
  v_id uuid;
  v_title text;
  v_desc  text;
  v_ss    text;
begin
  perform set_config('app.actor', 'migration:99991793651023_schlagernacktparty_past_dates', true);

  for r in
    select t.series, t.nr, (t.local_start::timestamp at time zone 'Europe/Berlin') as start_date,
           t.local_start::date as local_date, t.title_override, t.ss_path,
           v.venue_id, v.venue_name, v.address
      from (values
('snp',1,'2003-08-16 19:00','acker12','',''),
('snp',2,'2003-10-18 19:00','acker12','',''),
('snp',3,'2005-10-01 19:00','berg68','',''),
('snp',4,'2005-12-10 19:00','berg68','',''),
('snp',5,'2006-02-11 19:00','berg68','',''),
('snp',6,'2006-04-08 19:00','berg68','',''),
('snp',7,'2006-06-10 19:00','berg68','',''),
('snp',8,'2006-08-12 19:00','berg68','',''),
('snp',9,'2006-10-14 19:00','berg68','',''),
('snp',10,'2006-12-09 19:00','berg68','',''),
('snp',11,'2007-02-10 19:00','berg68','',''),
('snp',12,'2007-04-14 19:00','berg68','',''),
('snp',13,'2007-06-09 19:00','berg68','',''),
('snp',14,'2007-08-11 19:00','berg68','',''),
('snp',15,'2007-10-13 19:00','berg68','',''),
('snp',16,'2007-12-08 19:00','berg68','',''),
('snp',17,'2008-02-09 19:00','berg68','',''),
('snp',18,'2008-04-12 19:00','berg68','',''),
('snp',19,'2008-06-14 19:00','berg68','',''),
('snp',20,'2008-08-09 19:00','berg68','',''),
('snp',21,'2008-10-11 19:00','berg68','',''),
('snp',22,'2008-12-13 19:00','berg68','',''),
('snp',23,'2009-02-14 19:00','berg68','',''),
('snp',24,'2009-04-12 19:00','berg68','',''),
('snp',25,'2009-08-29 19:00','kastanien','',''),
('snp',26,'2009-11-28 19:00','kastanien','',''),
('snp',27,'2010-01-23 19:00','loreley','',''),
('snp',28,'2010-03-27 19:00','loreley','',''),
('snp',29,'2010-05-15 19:00','loreley','',''),
('snp',30,'2010-07-17 19:00','loreley','',''),
('snp',31,'2010-09-18 19:00','loreley','',''),
('snp',32,'2010-11-13 19:00','loreley','',''),
('snp',33,'2011-01-15 19:00','loreley','',''),
('snp',34,'2011-03-12 19:00','loreley','',''),
('snp',35,'2011-05-07 19:00','loreley','',''),
('snp',36,'2011-07-09 19:00','loreley','',''),
('snp',37,'2011-09-24 19:00','zmf','',''),
('snp',38,'2011-10-27 19:00','schwuz_old','',''),
('snp',39,'2011-11-26 19:00','zmf','',''),
('snp',40,'2011-12-27 19:00','schwuz_old','',''),
('snp',41,'2012-02-23 19:00','schwuz_old','',''),
('snp',42,'2012-04-26 19:00','schwuz_old','',''),
('snp',43,'2012-06-21 19:00','schwuz_old','',''),
('snp',44,'2012-08-16 19:00','schwuz_old','',''),
('snp',45,'2012-10-25 19:00','schwuz_old','',''),
('snp',46,'2012-12-27 19:00','schwuz_old','',''),
('snp',47,'2013-02-21 19:00','schwuz_old','',''),
('snp',48,'2013-04-18 19:00','schwuz_old','',''),
('snp',49,'2013-06-20 19:00','schwuz_old','',''),
('snp',50,'2013-08-15 21:00','schwuz_old','10 Jahre SchlagerNackt-Party','24531-10-jahre-schlagernackt-party/2013-08-15/21:00'),
('snp',51,'2013-10-17 19:00','schwuz_old','',''),
('snp',52,'2013-12-20 19:00','schwuz','',''),
('snp',53,'2014-02-16 19:00','schwuz','',''),
('snp',54,'2014-04-13 19:00','schwuz','',''),
('snp',55,'2014-06-22 19:00','schwuz','',''),
('snp',56,'2014-08-17 19:00','schwuz','',''),
('snp',57,'2014-10-19 19:00','schwuz','',''),
('snp',58,'2014-12-28 19:00','schwuz','',''),
('snp',59,'2015-02-22 19:00','schwuz','',''),
('snp',60,'2015-04-26 19:00','schwuz','',''),
('snp',61,'2015-06-21 19:00','schwuz','',''),
('snp',62,'2015-08-16 19:00','schwuz','',''),
('snp',63,'2015-10-18 19:00','schwuz','',''),
('snp',64,'2015-12-27 19:00','schwuz','',''),
('snp',65,'2016-02-21 19:00','schwuz','',''),
('snp',66,'2016-04-24 19:00','schwuz','',''),
('snp',67,'2016-06-26 19:00','schwuz','',''),
('snp',68,'2016-08-21 19:00','schwuz','',''),
('snp',69,'2016-10-23 19:00','schwuz','',''),
('snp',70,'2016-12-28 19:00','schwuz','5 Jahre SchlagerNackt-Party','17905-5-jahre-schlagernackt-party/2016-12-28/19:00'),
('snp',71,'2017-02-19 19:00','schwuz','',''),
('snp',72,'2017-04-23 19:00','schwuz','',''),
('snp',73,'2017-06-25 19:00','schwuz','',''),
('snp',74,'2017-08-20 19:00','schwuz','',''),
('snp',75,'2017-10-22 19:00','schwuz','',''),
('snp',76,'2017-12-27 19:00','schwuz','',''),
('snp',77,'2018-02-25 19:00','schwuz','',''),
('snp',78,'2018-04-22 19:00','schwuz','',''),
('snp',79,'2018-06-24 19:00','schwuz','',''),
('snp',80,'2018-08-26 19:00','schwuz','15 Jahre SchlagerNackt-Party','38623-15-jahre-schlagernackt-party/2018-08-26/19:00'),
('snp',81,'2018-10-21 19:00','schwuz','',''),
('snp',82,'2018-12-27 19:00','schwuz','',''),
('snp',83,'2019-02-24 19:00','schwuz','',''),
('snp',84,'2019-04-28 19:00','schwuz','',''),
('snp',85,'2019-06-23 19:00','schwuz','',''),
('snp',86,'2019-08-18 19:00','schwuz','',''),
('snp',87,'2019-10-20 19:00','schwuz','',''),
('snp',88,'2019-12-29 19:00','schwuz','',''),
('snp',89,'2020-02-16 19:00','schwuz','',''),
('snp',90,'2022-06-19 19:00','schwuz','',''),
('snp',91,'2022-08-14 19:00','schwuz','',''),
('snp',92,'2022-10-16 19:00','schwuz','',''),
('snp',93,'2022-12-29 19:00','schwuz','',''),
('snp',94,'2023-02-12 19:00','schwuz','','schlagernacktparty-0223/2023-02-12/19:00'),
('snp',95,'2023-04-06 19:00','schwuz','','schlagernacktparty-0223/2023-04-06/19:00'),
('snp',96,'2023-06-18 19:00','schwuz','','schlagernacktparty-0623/2023-06-18/19:00'),
('snp',97,'2023-08-20 19:00','schwuz','20 Jahre SchlagerNackt-Party','schlagernacktparty-0823/2023-08-20/19:00'),
('snp',98,'2023-10-22 19:00','schwuz','','schlagernacktparty-0623/2023-10-22/19:00'),
('snp',99,'2023-12-28 19:00','schwuz','','schlagernacktparty-0623/2023-12-28/19:00'),
('snp',100,'2024-03-28 19:00','schwuz','',''),
('snp',101,'2024-04-28 19:00','schwuz','',''),
('snp',102,'2024-06-16 19:00','schwuz','',''),
('snp',103,'2024-08-18 19:00','schwuz','',''),
('snp',104,'2024-10-20 19:00','schwuz','',''),
('snp',105,'2024-12-29 19:00','schwuz','',''),
('snp',106,'2025-03-02 19:00','schwuz','','schlagernacktparty-25/2025-03-02/19:00'),
('snp',107,'2025-04-17 19:00','schwuz','SchlagerNackt-Party XXL','schlagernacktparty-0425/2025-04-17/19:00'),
('snp',108,'2025-06-15 19:00','schwuz','','schlagernacktparty-25/2025-06-15/19:00'),
('snp',109,'2025-08-24 19:00','schwuz','','schlagernacktparty-25/2025-08-24/19:00'),
('snp',110,'2025-10-26 19:00','schwuz','','schlagernacktparty-25/2025-10-26/19:00'),
('nsb',1,'2026-05-17 18:00','metropol','','metropol-nacktschlagerball-0426/2026-05-17/18:00'),
('nsb',2,'2026-06-21 18:00','so36','','so36-nacktschlagerball-0626/2026-06-21/18:00'),
('nsb',4,'2026-11-01 18:00','metropol','','metropol-nacktschlagerball-1126/2026-11-01/18:00'),
('nsb',5,'2026-12-27 19:00','metropol','','')
      ) as t(series, nr, local_start, venue_key, title_override, ss_path)
      join (values
        ('acker12',    null::uuid,                              'Ackerkeller',           'Ackerstr. 12, 10115 Berlin'),
        ('berg68',     null::uuid,                              'Ackerkeller',           'Bergstr. 68, 10115 Berlin'),
        ('kastanien',  'd9815b4b-19e9-4951-a329-75d585544a7d', 'Kastanienkeller',       null),
        ('loreley',    null::uuid,                              'Loreley',               null),
        ('zmf',        '61abbcde-10a1-42aa-b80e-77cb8778deb9', 'ZFM (Zur Möbelfabrik)', null),
        ('schwuz_old', '348e22b8-63f0-4f6e-bbb3-6e0e6414d965', 'SchwuZ (No.4)',         'Mehringdamm 61, 10961 Berlin'),
        ('schwuz',     'c7942a24-d8d7-4509-9883-e6770c329cdc', 'SchwuZ',                'Rollbergstr. 26, 12053 Berlin'),
        ('metropol',   'f5f92d58-61b8-4018-a927-61da3b56a182', 'Metropol',              'Nollendorfplatz 5, 10777 Berlin'),
        ('so36',       '881db526-7014-4d35-aeed-bc39dade8ca7', 'SO36',                  'Oranienstraße 190, 10999 Berlin')
      ) as v(venue_key, venue_id, venue_name, address) using (venue_key)
  loop
    continue when exists (
      select 1 from public.event_sources
       where source_slug = 'nackt-schlager-ball' and source_entity_id = r.series || '-' || r.nr);

    v_title := coalesce(nullif(r.title_override, ''),
                 case when r.series = 'nsb' then 'NacktSchlagerBall'
                      when r.nr = 1 then 'Jupiters Sternstunden go naked'
                      else 'SchlagerNackt-Party' end);
    v_desc := case
      when r.series = 'nsb' then
        'Nackte Tanzparty zu Retro-Schlager, deutschen Coverversionen und Deutsch-Pop. Ausgabe Nr. '
        || r.nr || ' des Nackt-Schlager-Balls, des Nachfolgers der SchlagerNackt-Party (2003–2025).'
      when r.nr = 1 then
        'Premiere der SchlagerNackt-Party: nackte Tanzparty zu Retro-Schlager und Easy Listening mit DJ Jupiter im Ackerkeller, Berlin-Mitte.'
      else
        'Nackte Tanzparty zu Retro-Schlager, deutschen Coverversionen und Deutsch-Pop mit DJ Jupiter & Friends. Ausgabe Nr. '
        || r.nr || ' der SchlagerNackt-Party, die seit 2003 in Berlin stattfindet.'
        || case r.nr when 50 then ' Jubiläumsausgabe zum zehnjährigen Bestehen.'
                     when 100 then ' Jubiläumsausgabe zur 100. Party.' else '' end
    end;
    v_ss := nullif(r.ss_path, '');

    insert into public.events (
      title, edition, description, event_type, start_date, timezone,
      venue_id, venue_name, address, city, city_id, country, country_id,
      currency, is_free, is_public, status, review_status, data_source, external_id,
      website, ticket_url, tags, organizer_name, field_provenance)
    values (
      v_title, upper(r.series) || ' Nr. ' || r.nr, v_desc, 'fetish', r.start_date, 'Europe/Berlin',
      r.venue_id, r.venue_name, r.address, 'Berlin', v_city, 'DE', v_country,
      'EUR', false, true,
      case when r.local_date > v_today then 'active' else 'completed' end,
      'approved', 'nackt-schlager-ball', r.series || '-' || r.nr,
      'https://nackt-schlager-ball.de/',
      case when v_ss is not null then 'https://www.siegessaeule.de/termine/clubs/' || v_ss || '/' end,
      array['berlin','dance','gay','lgbtq','queer','queer-friendly'],
      'Nackt-Schlager-Ball (DJ Jupiter & Friends)',
      jsonb_build_object('start_date', jsonb_build_object(
        'date_source', v_archive,
        'time_source', case when v_ss is not null then 'siegessaeule'
                            when r.series = 'nsb' and r.nr = 5 then 'https://nackt-schlager-ball.de/'
                            else 'assumed:organizer_19h_entry' end,
        'note', case when v_ss is null and not (r.series = 'nsb' and r.nr = 5)
                     then 'Date from organizer archive; 19:00 is the organizer''s stated entry time, not verified for this edition.'
                     else 'Date and time verified.' end)))
    returning id into v_id;

    insert into public.event_sources (event_id, source_slug, source_entity_id, source_url, confidence, is_primary)
    values (v_id, 'nackt-schlager-ball', r.series || '-' || r.nr, v_archive, 0.95, true);

    if v_ss is not null then
      insert into public.event_sources (event_id, source_slug, source_entity_id, source_url, confidence, is_primary)
      values (v_id, 'siegessaeule', 'clubs/' || v_ss,
              'https://www.siegessaeule.de/termine/clubs/' || v_ss || '/', 0.95, false)
      on conflict (source_slug, source_entity_id) do nothing;
    end if;
  end loop;

  -- The existing row is NSB Nr. 3.
  update public.events set edition = 'NSB Nr. 3'
   where id = '0b57695f-5406-43e2-b43a-72eaba15baf7' and edition is null;
  insert into public.event_sources (event_id, source_slug, source_entity_id, source_url, confidence, is_primary)
  values ('0b57695f-5406-43e2-b43a-72eaba15baf7', 'nackt-schlager-ball', 'nsb-3', v_archive, 0.95, false)
  on conflict (source_slug, source_entity_id) do nothing;
end $$;
do $verify$
declare v_n int; v_bad int;
begin
  -- every organizer edition (SNP 1-110, NSB 1-5) maps to exactly one event
  select count(distinct es.source_entity_id) into v_n
    from public.event_sources es
   where es.source_slug = 'nackt-schlager-ball'
     and (es.source_entity_id ~ '^snp-([1-9]|[1-9][0-9]|10[0-9]|110)$'
       or es.source_entity_id ~ '^nsb-[1-5]$');
  if v_n <> 115 then
    raise exception 'schlagernacktparty verify: expected 115 organizer editions, found %', v_n;
  end if;

  -- no edition may point at a merged-away row or share an instant with another edition
  select count(*) into v_bad
    from public.event_sources es join public.events e on e.id = es.event_id
   where es.source_slug = 'nackt-schlager-ball' and e.duplicate_of_id is not null;
  if v_bad <> 0 then
    raise exception 'schlagernacktparty verify: % editions sit on a merged-away event', v_bad;
  end if;

  select count(*) - count(distinct e.start_date) into v_bad
    from public.event_sources es join public.events e on e.id = es.event_id
   where es.source_slug = 'nackt-schlager-ball';
  if v_bad <> 0 then
    raise exception 'schlagernacktparty verify: % editions share a start_date', v_bad;
  end if;
end $verify$;
