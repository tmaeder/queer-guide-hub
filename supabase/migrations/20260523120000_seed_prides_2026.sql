-- Seed ~120 major pride events for 2026.
-- Dates are mid-month estimates where exact dates not yet published.
-- Editorial pass will refine top-tier dates + flip is_featured for headline editions.
-- Source: Wikipedia List_of_pride_parades + manual curation. Marked verification_status='unverified'.
-- Re-runnable: ON CONFLICT (slug) DO NOTHING.

WITH pride_data(city_name, country_code, label, month_num, day_num, end_day_num, is_major) AS (
  VALUES
  -- ── EUROPE ─────────────────────────────────────────────────────
  ('Berlin','DE','Berlin Pride CSD',7,25,25,true),
  ('Cologne','DE','Cologne Pride CSD',7,4,5,true),
  ('Hamburg','DE','Hamburg Pride CSD',8,1,2,false),
  ('Munich','DE','Munich CSD',7,11,12,false),
  ('Frankfurt','DE','Frankfurt CSD',7,18,19,false),
  ('London','GB','London Pride',7,4,4,true),
  ('Manchester','GB','Manchester Pride',8,28,31,true),
  ('Brighton','GB','Brighton & Hove Pride',8,1,2,true),
  ('Cardiff','GB','Pride Cymru',8,22,23,false),
  ('Edinburgh','GB','Pride Edinburgh',6,20,20,false),
  ('Paris','FR','Marche des Fiertés Paris',6,27,27,true),
  ('Lyon','FR','Lyon Pride',6,13,13,false),
  ('Marseille','FR','Marseille Pride',7,4,4,false),
  ('Toulouse','FR','Toulouse Pride',6,6,6,false),
  ('Madrid','ES','MADO Madrid Pride',7,1,5,true),
  ('Barcelona','ES','Pride Barcelona',6,27,27,true),
  ('Sitges','ES','Sitges Pride',6,11,14,false),
  ('Valencia','ES','Valencia Pride',6,20,20,false),
  ('Amsterdam','NL','Amsterdam Pride',8,1,9,true),
  ('Rotterdam','NL','Rotterdam Pride',9,26,26,false),
  ('Utrecht','NL','Utrecht Canal Pride',6,6,6,false),
  ('Stockholm','SE','Stockholm Pride',7,27,8,true),
  ('Gothenburg','SE','West Pride Gothenburg',6,8,14,false),
  ('Malmö','SE','Malmö Pride',8,17,23,false),
  ('Copenhagen','DK','Copenhagen Pride',8,17,23,true),
  ('Oslo','NO','Oslo Pride',6,20,28,true),
  ('Bergen','NO','Bergen Pride',6,6,13,false),
  ('Helsinki','FI','Helsinki Pride',6,29,5,true),
  ('Turku','FI','Turku Pride',8,15,15,false),
  ('Rome','IT','Roma Pride',6,13,13,true),
  ('Milan','IT','Milano Pride',6,27,27,true),
  ('Naples','IT','Napoli Pride',7,4,4,false),
  ('Bologna','IT','Bologna Pride',6,27,27,false),
  ('Florence','IT','Florence Toscana Pride',6,20,20,false),
  ('Lisbon','PT','Lisboa Pride',6,20,20,true),
  ('Porto','PT','Porto Pride',7,11,11,false),
  ('Vienna','AT','Vienna Pride & Regenbogenparade',6,13,13,true),
  ('Salzburg','AT','Salzburg Pride',6,6,6,false),
  ('Zurich','CH','Zurich Pride',6,20,20,true),
  ('Geneva','CH','Geneva Pride',7,4,4,false),
  ('Brussels','BE','Brussels Pride',5,16,16,true),
  ('Antwerp','BE','Antwerp Pride',8,8,16,false),
  ('Prague','CZ','Prague Pride',8,3,9,true),
  ('Warsaw','PL','Warsaw Pride / Parada Równości',6,20,20,true),
  ('Budapest','HU','Budapest Pride',7,18,18,true),
  ('Athens','GR','Athens Pride',6,13,13,true),
  ('Thessaloniki','GR','Thessaloniki Pride',6,20,20,false),
  ('Dublin','IE','Dublin Pride',6,27,27,true),
  ('Cork','IE','Cork Pride',7,25,2,false),
  ('Reykjavik','IS','Reykjavik Pride',8,3,9,true),
  ('Tallinn','EE','Baltic Pride Tallinn',6,6,6,false),
  ('Riga','LV','Riga Pride',6,13,13,false),
  ('Vilnius','LT','Vilnius Pride',7,11,11,false),
  ('Bucharest','RO','Bucharest Pride',7,18,26,false),
  ('Sofia','BG','Sofia Pride',6,13,13,false),
  ('Ljubljana','SI','Ljubljana Pride',6,13,13,false),
  ('Zagreb','HR','Zagreb Pride',6,20,20,false),
  ('Sarajevo','BA','Sarajevo Pride',9,12,12,false),
  ('Belgrade','RS','Belgrade Pride',9,12,12,false),
  ('Bratislava','SK','Bratislava Pride',7,18,18,false),
  ('Tbilisi','GE','Tbilisi Pride Week',7,1,8,false),
  ('Istanbul','TR','Istanbul Pride',6,28,28,true),
  -- ── NORTH AMERICA ──────────────────────────────────────────────
  ('New York','US','NYC Pride',6,28,28,true),
  ('San Francisco','US','San Francisco Pride',6,27,28,true),
  ('Los Angeles','US','LA Pride',6,13,14,true),
  ('Chicago','US','Chicago Pride',6,28,28,true),
  ('Miami','US','Miami Beach Pride',4,12,19,true),
  ('Seattle','US','Seattle Pride',6,28,28,true),
  ('Boston','US','Boston Pride for the People',6,13,13,true),
  ('Washington','US','Capital Pride DC',6,7,14,true),
  ('Atlanta','US','Atlanta Pride',10,10,11,true),
  ('Portland','US','Portland Pride',7,18,19,false),
  ('Denver','US','Denver PrideFest',6,20,21,false),
  ('Austin','US','Austin Pride',8,15,15,false),
  ('Houston','US','Houston LGBT+ Pride',6,27,27,false),
  ('Philadelphia','US','Philly Pride',6,7,7,false),
  ('Las Vegas','US','Las Vegas Pride',10,9,10,false),
  ('San Diego','US','San Diego Pride',7,18,19,true),
  ('Minneapolis','US','Twin Cities Pride',6,27,28,false),
  ('Phoenix','US','Phoenix Pride',4,3,5,false),
  ('New Orleans','US','New Orleans Pride',6,13,13,false),
  ('Dallas','US','Dallas Pride',6,6,6,false),
  ('Provincetown','US','Provincetown Carnival',8,15,21,false),
  ('Palm Springs','US','Palm Springs Pride',11,6,8,true),
  ('Toronto','CA','Toronto Pride',6,26,28,true),
  ('Vancouver','CA','Vancouver Pride',8,2,2,true),
  ('Montreal','CA','Montréal Pride / Fierté',8,3,9,true),
  ('Ottawa','CA','Capital Pride Ottawa',8,16,23,false),
  ('Mexico City','MX','Marcha del Orgullo CDMX',6,27,27,true),
  ('Guadalajara','MX','Guadalajara Pride',6,13,13,false),
  ('Puerto Vallarta','MX','Vallarta Pride',5,23,30,true),
  -- ── SOUTH AMERICA ──────────────────────────────────────────────
  ('Sao Paulo','BR','São Paulo Pride',6,7,7,true),
  ('Rio de Janeiro','BR','Rio Pride',11,15,15,true),
  ('Salvador','BR','Salvador Pride',9,13,13,false),
  ('Buenos Aires','AR','Marcha del Orgullo Buenos Aires',11,7,7,true),
  ('Santiago','CL','Movilh Pride Santiago',6,20,20,false),
  ('Bogota','CO','Marcha Bogotá',7,4,4,false),
  ('Lima','PE','Marcha del Orgullo Lima',6,27,27,false),
  ('Quito','EC','Orgullo Quito',6,27,27,false),
  ('Montevideo','UY','Marcha por la Diversidad Montevideo',9,25,25,false),
  -- ── OCEANIA ────────────────────────────────────────────────────
  ('Sydney','AU','Sydney Gay & Lesbian Mardi Gras',2,28,28,true),
  ('Melbourne','AU','Midsumma Pride March',2,1,1,true),
  ('Brisbane','AU','Brisbane Pride',9,19,19,false),
  ('Adelaide','AU','Feast Festival Adelaide',11,7,22,false),
  ('Perth','AU','PrideFEST Perth',11,7,22,false),
  ('Auckland','NZ','Auckland Pride',2,7,22,true),
  ('Wellington','NZ','Wellington Pride',3,7,22,false),
  -- ── ASIA ───────────────────────────────────────────────────────
  ('Tel Aviv','IL','Tel Aviv Pride',6,12,12,true),
  ('Jerusalem','IL','Jerusalem Pride',6,4,4,false),
  ('Tokyo','JP','Tokyo Rainbow Pride',4,25,26,true),
  ('Osaka','JP','Kansai Rainbow Festa',10,17,18,false),
  ('Taipei','TW','Taiwan LGBT Pride Taipei',10,31,31,true),
  ('Kaohsiung','TW','Kaohsiung Pride',11,28,28,false),
  ('Bangkok','TH','Bangkok Pride',6,1,7,true),
  ('Chiang Mai','TH','Chiang Mai Pride',2,21,21,false),
  ('Phuket','TH','Phuket Pride',4,25,2,false),
  ('Hong Kong','HK','Hong Kong Pride Parade',11,14,14,false),
  ('Seoul','KR','Seoul Queer Culture Festival',6,6,6,true),
  ('Singapore','SG','Pink Dot SG',6,27,27,true),
  ('Manila','PH','Metro Manila Pride',6,27,27,false),
  ('Ho Chi Minh City','VN','VietPride Saigon',9,26,26,false),
  -- ── AFRICA ─────────────────────────────────────────────────────
  ('Cape Town','ZA','Cape Town Pride',2,21,1,true),
  ('Johannesburg','ZA','Johannesburg Pride',10,24,24,true),
  ('Durban','ZA','Durban Pride',6,27,27,false)
)
INSERT INTO events (
  title, slug, event_type, start_date, end_date,
  city, country, city_id, country_id,
  latitude, longitude, timezone,
  data_source, verification_status, is_featured, status, is_public,
  description
)
SELECT
  pd.label || ' 2026'                                                    AS title,
  lower(regexp_replace(
    regexp_replace(pd.label, '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-|-$)', '', 'g'
  )) || '-2026'                                                          AS slug,
  'pride'                                                                AS event_type,
  make_date(2026, pd.month_num, pd.day_num)::timestamptz                 AS start_date,
  CASE
    WHEN pd.end_day_num >= pd.day_num
      THEN (make_date(2026, pd.month_num, pd.end_day_num) + INTERVAL '23 hours 59 minutes')::timestamptz
    ELSE (make_date(2026, pd.month_num, pd.day_num) + INTERVAL '7 days')::timestamptz
  END                                                                    AS end_date,
  c.name                                                                 AS city,
  co.code                                                                AS country,
  c.id                                                                   AS city_id,
  co.id                                                                  AS country_id,
  c.latitude                                                             AS latitude,
  c.longitude                                                            AS longitude,
  c.timezone                                                             AS timezone,
  'seed:wikipedia-prides-2026'                                           AS data_source,
  'unverified'                                                           AS verification_status,
  pd.is_major                                                            AS is_featured,
  'active'                                                               AS status,
  true                                                                   AS is_public,
  pd.label || ' — annual LGBTQ+ pride celebration in ' || c.name
    || '. Date is an estimate; check the official event for confirmation.' AS description
FROM pride_data pd
JOIN countries co ON co.code = pd.country_code
JOIN cities c
  ON c.country_id = co.id
 AND (LOWER(c.name) = LOWER(pd.city_name)
      OR LOWER(COALESCE(c.name_en,'')) = LOWER(pd.city_name)
      OR LOWER(COALESCE(c.name_normalized,'')) = LOWER(pd.city_name))
ON CONFLICT (slug) DO NOTHING;
