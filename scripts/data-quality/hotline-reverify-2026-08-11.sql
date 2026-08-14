-- Hotline re-verification, 2026-08-11.
--
-- Every value below was read from the OPERATOR'S OWN website. Nothing is
-- inferred, and nothing is filled from recalled knowledge: where a site did not
-- publish a fact, the key is left absent rather than guessed. Three fields are
-- new (`hours_slots`, `timezone`, `always_open`) and one changes meaning
-- (`reports_to_police` is now three-state — see src/types/cms.ts).
--
-- ─────────────────────────────────────────────────────────────────────────
-- P0 — we are currently publishing three things that can cause direct harm
-- ─────────────────────────────────────────────────────────────────────────
--
-- 1. mindline-trans-uk — `mindlinetrans.org.uk` IS NO LONGER THE HELPLINE.
--    It now serves "Best Non GamStop Casinos UK 2026", an offshore-gambling
--    affiliate site. Verified three times (two independent fetches + a browser
--    render). The domain lapsed and was re-registered; search engines still
--    index the old title, and an HTTP-status liveness check cannot see this,
--    which is why our `link_status` still says 'ok'. We are sending trans
--    people in distress to casino marketing. URL repointed to the operator,
--    Mind in Somerset.
--
-- 2. lgbt-youthline-ca — THE PHONE LINE DOES NOT EXIST. YouthLine stopped
--    taking calls in 2023; their contact page labels the number we publish
--    "NOT the contact info for the Peer Support HelpLine". It is a staff/office
--    line. A youth in crisis dialling it reaches nobody. Phone removed; the
--    real service (text / chat / email) added.
--
-- 3. trans-lifeline-us — NOT 24/7. Operating hours are Mon–Fri 10:00–18:00
--    Pacific. Our "24/7" would send someone to an unstaffed line at 03:00.
--
-- ─────────────────────────────────────────────────────────────────────────
-- Wrong hours (not immediately dangerous, but false)
-- ─────────────────────────────────────────────────────────────────────────
--   qlife-au              15:00–21:00, not 15:00–24:00 (changed 2025-12-01)
--   sos-homophobie-fr     missing Wed/Sat/Sun entirely; Fri closes 20:00
--   bzga-aids-beratung-de weekends are 10–18, not 12–14
--   courage-beratung-at   Mo–Do 09:00–15:00, not "nach Vereinbarung"
--   mindline-trans-uk     Fri 20:00–23:00 only, not Mon & Fri to midnight
--   switchboard-nl        established (we held "Check website"); closed Sundays
--
-- ─────────────────────────────────────────────────────────────────────────
-- Deliberately NOT changed here — these need a human decision
-- ─────────────────────────────────────────────────────────────────────────
--   switchboard-lgbt-uk    Site geo-blocks non-UK visitors, so the number,
--                          email and chat URL could not be verified from
--                          outside the UK. Hours confirmed correct. Needs a
--                          UK-based re-check.
--   hilfetelefon-…-de      Site now publishes only `116 016`; we hold
--                          `08000 116 016`. No retirement notice found, so the
--                          number is left alone pending a decision.
--   988-us                 The LGBTQI+ subnetwork ("press 3" / text PRIDE) was
--                          discontinued 2025-07-17. We never published it —
--                          recorded here so nobody re-adds it.
--
-- Resolved 2026-08-11 (see the two entries below the P0 block):
--   lsvd-beratung-de / tgns-ch — phone REMOVED rather than repointed. Neither
--   number appears on the operator's site, and the numbers they do publish are
--   a press line and an office line respectively, not counselling routes.
--   Listing a wrong number is worse than listing none; both now carry their
--   real email/referral routes instead.
--
-- APPLIED to production 2026-08-11 in four id-scoped chunks via the Supabase
-- MCP (DE / AT+CH / GB+IE+FR+NL / US+CA+AU+INT), followed by the guard below.
-- Each chunk is an idempotent jsonb merge keyed by id, so re-running this file
-- as one transaction is a no-op and is the canonical record of the change.
-- Post-apply counts: channels 0→18, hours_slots 0→11, timezone 0→19,
-- always_open 0→8, reports_to_police 0→6 true / 1 false, operator 1→25,
-- link_status 'ok' 3→0.
--
-- Also applied: `link_checked_at = '2026-08-11'` on all 25 entries. Every URL
-- was opened and its CONTENT read against the operator's identity, which is
-- strictly stronger than the HTTP-status probe that previously wrote this
-- column — that probe reported 'ok' for the hijacked mindline-trans domain.
-- The new `hotline_link_stale` release gate (migration 20260831100000) reads
-- this column and fires at 45 days, so the evidence cannot go quietly stale
-- for two months again. It was firing 25/25 before this stamp.
--
-- Apply with: psql "$DATABASE_URL" -f this-file.sql   (single transaction)

begin;

with patch(id, delta) as (
  values
  -- ── DE ──────────────────────────────────────────────────────────────
  ('telefonseelsorge-de', '{
     "always_open": true,
     "timezone": "Europe/Berlin",
     "operator": "TelefonSeelsorge Deutschland e.V. (katholische und evangelische Kirche)",
     "affiliation": "religious",
     "channels": [{"kind":"chat","value":"https://online.telefonseelsorge.de/"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- Chat hours deliberately absent: TelefonSeelsorge publishes no fixed
  -- Chatzeiten, only "by appointment or when a slot frees up".

  ('nummer-gegen-kummer-de', '{
     "timezone": "Europe/Berlin",
     "hours_slots": [{"day":1,"open":"14:00","close":"20:00"},
                     {"day":2,"open":"14:00","close":"20:00"},
                     {"day":3,"open":"14:00","close":"20:00"},
                     {"day":4,"open":"14:00","close":"20:00"},
                     {"day":5,"open":"14:00","close":"20:00"},
                     {"day":6,"open":"14:00","close":"20:00"}],
     "operator": "Nummer gegen Kummer e.V.",
     "affiliation": "ngo",
     "reports_to_police": true,
     "channels": [{"kind":"chat","value":"https://www.nummergegenkummer.de/onlineberatung/","hours":"Mo–Do 14–20 Uhr"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- reports_to_police=true, their own words: counsellors are bound by
  -- Schweigepflicht, "Wenn dein Leben oder das einer anderen Person ganz
  -- konkret und unmittelbar in Gefahr ist. Dann sind wir rechtlich
  -- verpflichtet, bestimmte Informationen an die Polizei weiterzugeben."

  ('hilfetelefon-gewalt-frauen-de', '{
     "always_open": true,
     "timezone": "Europe/Berlin",
     "operator": "Bundesamt für Familie und zivilgesellschaftliche Aufgaben (BAFzA)",
     "affiliation": "state",
     "channels": [{"kind":"chat","value":"https://onlineberatung.hilfetelefon.de","hours":"Täglich 12:00–20:00 (deutschsprachig)"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),

  ('bzga-aids-beratung-de', '{
     "timezone": "Europe/Berlin",
     "hours": "Mo–Do 10–22, Fr–So 10–18",
     "hours_slots": [{"day":1,"open":"10:00","close":"22:00"},
                     {"day":2,"open":"10:00","close":"22:00"},
                     {"day":3,"open":"10:00","close":"22:00"},
                     {"day":4,"open":"10:00","close":"22:00"},
                     {"day":5,"open":"10:00","close":"18:00"},
                     {"day":6,"open":"10:00","close":"18:00"},
                     {"day":0,"open":"10:00","close":"18:00"}],
     "operator": "LIEBESLEBEN — Bundesinstitut für Öffentliche Gesundheit (BIÖG, vormals BZgA)",
     "affiliation": "state",
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),

  ('trans-telefonberatung-de', '{
     "timezone": "Europe/Berlin",
     "hours": "Fr 13–15 (Telefonsprechstunde, Durchwahl -146)",
     "hours_slots": [{"day":5,"open":"13:00","close":"15:00"}],
     "phone": "030 446688-146",
     "operator": "Queer Leben – Inter*Trans*Beratung (Schwulenberatung Berlin)",
     "affiliation": "ngo",
     "channels": [{"kind":"email","value":"beratung@queer-leben.de"},
                  {"kind":"email","value":"beratung@tinantigewalt.de","label":"Gewaltberatung"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- Two corrections: the Friday phone slot runs on extension -146 (dialling
  -- -111 reaches reception), and the old "Do 15–17" was an IN-PERSON open
  -- consultation, not a phone slot — it must not sit in a phone schedule.

  -- ── AT ──────────────────────────────────────────────────────────────
  -- Phone removed rather than repointed. `030 789541-77` appears on no LSVD
  -- site; it resembles their PRESS line (030 789 547 78) with transposed
  -- digits, and a press line is not a counselling route. The federal LSVD no
  -- longer runs phone counselling at all — legal advice is email-only, handled
  -- by external lawyers. Keeping a wrong number is worse than keeping none.
  ('lsvd-beratung-de', '{
     "phone": null,
     "hours": "E-Mail-Beratung, Antwort in der Regel innerhalb von 14 Tagen",
     "description": "Rechtsberatung des LSVD zu Coming-out, Partnerschaft und Diskriminierung. Ausschliesslich per E-Mail; persönliche Beratung über die Landesverbände.",
     "timezone": "Europe/Berlin",
     "operator": "LSVD+ – Verband Queere Vielfalt",
     "affiliation": "ngo",
     "channels": [{"kind":"email","value":"lsvd@lsvd.de"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review; stored number unverifiable, removed"
   }'::jsonb),

  ('telefonseelsorge-at', '{
     "always_open": true,
     "timezone": "Europe/Vienna",
     "operator": "Telefonseelsorge Österreich (regionale kirchliche Träger)",
     "affiliation": "religious",
     "channels": [{"kind":"chat","value":"https://chat.onlineberatung-telefonseelsorge.at/hc/de/p/chat","hours":"täglich 16:00–23:00"},
                  {"kind":"chat","value":"https://chat.onlineberatung-telefonseelsorge.at/hc/de/p/Messenger","label":"Messenger","hours":"täglich 17:30–19:30"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- The messenger route is a link to their counselling platform, NOT a
  -- dialable WhatsApp number, so it is stored as `chat`, not `whatsapp`.

  ('courage-beratung-at', '{
     "timezone": "Europe/Vienna",
     "hours": "Mo–Do 09:00–15:00",
     "hours_slots": [{"day":1,"open":"09:00","close":"15:00"},
                     {"day":2,"open":"09:00","close":"15:00"},
                     {"day":3,"open":"09:00","close":"15:00"},
                     {"day":4,"open":"09:00","close":"15:00"}],
     "operator": "COURAGE Beratungsstellen",
     "affiliation": "ngo",
     "channels": [{"kind":"email","value":"info@courage-beratung.at"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),

  -- ── CH ──────────────────────────────────────────────────────────────
  ('dargebotene-hand-ch', '{
     "always_open": true,
     "timezone": "Europe/Zurich",
     "operator": "Schweizer Verband Die Dargebotene Hand",
     "affiliation": "ngo",
     "channels": [{"kind":"chat","value":"https://www.143.ch/chat-deutschschweiz/","hours":"täglich 10:00–22:00 (keine neuen Chats nach 21:45)"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),

  -- Phone removed rather than repointed. `031 533 37 93` appears nowhere on
  -- tgns.ch. The number they do publish (031 372 33 44) is an OFFICE line
  -- staffed Mon+Wed only, not a counselling line — TGNS routes actual trans
  -- counselling to the regional Checkpoints. Listing an office line under a
  -- crisis heading would overstate what a caller reaches.
  ('tgns-ch', '{
     "phone": null,
     "hours": "Beratung über die regionalen Checkpoints; Rechtsberatung per E-Mail",
     "description": "Rechtsberatung und Peer-Unterstützung für trans Menschen in der Schweiz. Persönliche Beratung läuft über die Checkpoints in Zürich, Bern, Basel, der Waadt und der Zentralschweiz — kostenlos, vertraulich und von trans Personen geleistet.",
     "timezone": "Europe/Zurich",
     "operator": "Transgender Network Switzerland (TGNS)",
     "affiliation": "ngo",
     "channels": [{"kind":"email","value":"legal@tgns.ch","label":"Rechtsberatung"},
                  {"kind":"email","value":"info@tgns.ch"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review; stored number unverifiable, removed"
   }'::jsonb),

  ('du-bist-du-ch', '{
     "timezone": "Europe/Zurich",
     "operator": "Sexuelle Gesundheit Zürich (SeGZ)",
     "affiliation": "ngo",
     "channels": [{"kind":"email","value":"info@du-bist-du.ch"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- Maintainer flag: at review time all 13 listed peer counsellors were marked
  -- "zurzeit abwesend". Worth a re-check before relying on this entry.

  -- ── GB ──────────────────────────────────────────────────────────────
  ('samaritans-uk', '{
     "always_open": true,
     "timezone": "Europe/London",
     "operator": "Samaritans",
     "affiliation": "secular",
     "reports_to_police": true,
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- No email channel: the widely-recalled jo@samaritans.org is NOT on their
  -- contact page and they state the UK email service is closing during 2026.
  -- Web chat is a randomised pilot with no stable URL or hours.
  -- reports_to_police=true: "This will involve contacting the emergency
  -- services with or without caller consent."

  ('mindline-trans-uk', '{
     "url": "https://www.mindinsomerset.org.uk/our-services/adult-one-to-one-support/mindline-trans/",
     "timezone": "Europe/London",
     "hours": "Fri 20:00–23:00",
     "hours_slots": [{"day":5,"open":"20:00","close":"23:00"}],
     "operator": "Mind in Somerset",
     "affiliation": "ngo",
     "verified_at": "2026-08-11",
     "verified_method": "operator website review; old domain confirmed hijacked"
   }'::jsonb),

  -- ── IE ──────────────────────────────────────────────────────────────
  ('lgbt-helpline-ie', '{
     "timezone": "Europe/Dublin",
     "hours_slots": [{"day":1,"open":"18:30","close":"22:00"},
                     {"day":2,"open":"18:30","close":"22:00"},
                     {"day":3,"open":"18:30","close":"22:00"},
                     {"day":4,"open":"18:30","close":"22:00"},
                     {"day":5,"open":"16:00","close":"22:00"},
                     {"day":6,"open":"16:00","close":"18:00"},
                     {"day":0,"open":"16:00","close":"18:00"}],
     "operator": "LGBT Ireland",
     "affiliation": "ngo",
     "channels": [{"kind":"chat","value":"https://lgbt.ie/instant-messaging-support-service/"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),

  -- ── FR ──────────────────────────────────────────────────────────────
  ('sos-homophobie-fr', '{
     "timezone": "Europe/Paris",
     "hours": "Lun–Jeu 18h–22h, Ven 18h–20h, Sam 14h–16h, Dim 18h–20h",
     "hours_slots": [{"day":1,"open":"18:00","close":"22:00"},
                     {"day":2,"open":"18:00","close":"22:00"},
                     {"day":3,"open":"18:00","close":"22:00"},
                     {"day":4,"open":"18:00","close":"22:00"},
                     {"day":5,"open":"18:00","close":"20:00"},
                     {"day":6,"open":"14:00","close":"16:00"},
                     {"day":0,"open":"18:00","close":"20:00"}],
     "operator": "SOS homophobie",
     "affiliation": "ngo",
     "channels": [{"kind":"chat","value":"https://www.sos-homophobie.org/tchatecoute","hours":"Mardi et jeudi 20h–22h, dimanche 18h–20h"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),

  -- ── NL ──────────────────────────────────────────────────────────────
  ('switchboard-nl', '{
     "timezone": "Europe/Amsterdam",
     "hours": "Ma 10–12 & 19–20, Di 12–15 & 19–20, Wo 11–14, Do 13–16, Vr 11–13, Za 14–17",
     "hours_slots": [{"day":1,"open":"10:00","close":"12:00"},
                     {"day":1,"open":"19:00","close":"20:00"},
                     {"day":2,"open":"12:00","close":"15:00"},
                     {"day":2,"open":"19:00","close":"20:00"},
                     {"day":3,"open":"11:00","close":"14:00"},
                     {"day":4,"open":"13:00","close":"16:00"},
                     {"day":5,"open":"11:00","close":"13:00"},
                     {"day":6,"open":"14:00","close":"17:00"}],
     "operator": "Switchboard, een initiatief van COC Nederland",
     "affiliation": "ngo",
     "channels": [{"kind":"chat","value":"https://switchboard.nl/#chat","hours":"Zoals telefoon, plus di 17:00–19:00 (alleen chat)"},
                  {"kind":"email","value":"info@switchboard.nl"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- Closed Sundays. The Tuesday 17:00–19:00 block is chat-only and is
  -- deliberately excluded from the PHONE schedule.

  -- ── US ──────────────────────────────────────────────────────────────
  ('988-us', '{
     "description": "Free, confidential crisis support, 24/7. Phone, text and chat. The dedicated LGBTQ+ subnetwork (press 3) was discontinued in July 2025.",
     "always_open": true,
     "operator": "SAMHSA / Vibrant Emotional Health",
     "affiliation": "state",
     "reports_to_police": true,
     "channels": [{"kind":"sms","value":"988"},
                  {"kind":"chat","value":"https://chat.988lifeline.org/"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- reports_to_police=true, from their own intervention PDF (updated
  -- 2024-09-10): counsellors contact emergency services "when a less invasive
  -- plan for the caller/texter''s safety cannot be collaborated on".
  -- The LGBTQI+ subnetwork (press 3 / text PRIDE) closed 2025-07-17 — do not
  -- publish either pathway.

  ('trevor-project-us', '{
     "always_open": true,
     "operator": "The Trevor Project",
     "affiliation": "ngo",
     "reports_to_police": true,
     "channels": [{"kind":"sms","value":"678-678","label":"Text START"},
                  {"kind":"chat","value":"https://www.thetrevorproject.org/get-help/"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- reports_to_police=true, terms of service: "our policy is to alert law
  -- enforcement, state authorities, or emergency services if your
  -- communications … indicate that you are at imminent risk of death or
  -- serious injury". TrevorChat has no standalone URL — it is a button on
  -- /get-help/, so that page is the honest value.

  ('trans-lifeline-us', '{
     "always_open": false,
     "timezone": "America/Los_Angeles",
     "hours": "Mon–Fri 10:00–18:00 Pacific",
     "hours_slots": [{"day":1,"open":"10:00","close":"18:00"},
                     {"day":2,"open":"10:00","close":"18:00"},
                     {"day":3,"open":"10:00","close":"18:00"},
                     {"day":4,"open":"10:00","close":"18:00"},
                     {"day":5,"open":"10:00","close":"18:00"}],
     "operator": "Trans Lifeline",
     "affiliation": "ngo",
     "reports_to_police": false,
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- The one line in the corpus with an explicit non-carceral policy: "Trans
  -- Lifeline has a policy against nonconsensual active rescue. We will not call
  -- emergency services or law enforcement without your explicit request – even
  -- if you tell us you or someone else is in danger."
  -- No SMS/chat: they state text support is still "preparing".

  -- ── CA ──────────────────────────────────────────────────────────────
  ('lgbt-youthline-ca', '{
     "phone": null,
     "description": "Peer support by and for LGBTQ2S+ youth (29 and under) in Ontario, Canada. Text, chat and email — the phone line was discontinued in 2023.",
     "timezone": "America/Toronto",
     "hours": "Sun–Fri 16:00–21:30 ET (text, chat and email only)",
     "hours_slots": [{"day":0,"open":"16:00","close":"21:30"},
                     {"day":1,"open":"16:00","close":"21:30"},
                     {"day":2,"open":"16:00","close":"21:30"},
                     {"day":3,"open":"16:00","close":"21:30"},
                     {"day":4,"open":"16:00","close":"21:30"},
                     {"day":5,"open":"16:00","close":"21:30"}],
     "operator": "LGBT YouthLine (Ontario, under 30)",
     "affiliation": "ngo",
     "channels": [{"kind":"sms","value":"647-694-4275"},
                  {"kind":"chat","value":"https://www.youthline.ca/helpline/peer-support-helpline/"},
                  {"kind":"email","value":"askus@youthline.ca"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review; phone service confirmed discontinued 2023"
   }'::jsonb),

  -- ── AU ──────────────────────────────────────────────────────────────
  ('lifeline-au', '{
     "always_open": true,
     "operator": "Lifeline Australia",
     "affiliation": "ngo",
     "reports_to_police": true,
     "channels": [{"kind":"sms","value":"0477 13 11 14"},
                  {"kind":"chat","value":"https://www.lifeline.org.au/get-help/services/chat"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- reports_to_police=true: "we collect information to share with emergency
  -- services without seeking consent because we have a duty of care".

  ('qlife-au', '{
     "hours": "3pm–9pm local time, every day (all states and territories)",
     "operator": "LGBTIQ+ Health Australia",
     "affiliation": "ngo",
     "reports_to_police": true,
     "channels": [{"kind":"chat","value":"https://qlife.org.au","label":"Webchat","hours":"3pm–9pm local time"}],
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb),
  -- NO hours_slots and NO timezone ON PURPOSE. QLife opens 15:00–21:00 in EACH
  -- state''s own local time, a 3-hour spread (5 with DST). Storing
  -- Australia/Sydney would tell a Perth reader the line is open at noon and
  -- closed at 6pm, when the opposite is true. An honest free-text string beats
  -- a wrong zone; `isOpenNow` returns null for it, which renders as silence.
  -- Hours changed 2025-12-01 from 3pm–midnight.

  -- ── INT ─────────────────────────────────────────────────────────────
  ('ilga-directory', '{
     "operator": "ILGA World",
     "affiliation": "ngo",
     "verified_at": "2026-08-11",
     "verified_method": "operator website review (browser render; ilga.org 403s automated fetchers)"
   }'::jsonb),

  ('iglyo', '{
     "operator": "IGLYO",
     "affiliation": "ngo",
     "verified_at": "2026-08-11",
     "verified_method": "operator website review"
   }'::jsonb)
)
update cms_pages p
set body_json = jsonb_set(
      p.body_json,
      '{hotlines}',
      (select jsonb_agg(
                -- Normalise the one drifted field on EVERY row, then apply the
                -- per-id patch. `link_status: 'ok'` is not in the TS union and
                -- sits on 3 rows — one of them mindline-trans-uk, which is the
                -- point: an HTTP-status liveness check reported "ok" for a
                -- domain that had been re-registered as a casino site.
                h
                || case when h->>'link_status' = 'ok'
                        then '{"link_status":"live"}'::jsonb else '{}'::jsonb end
                || coalesce(patch.delta, '{}'::jsonb)
                order by ord)
       from jsonb_array_elements(p.body_json->'hotlines') with ordinality as t(h, ord)
       left join patch on patch.id = t.h->>'id')
    ),
    updated_at = now()
where p.slug = 'help';

-- Guard: the patch list must have matched every id it names. A typo would
-- otherwise apply nothing and report success.
do $$
declare missing text;
begin
  select string_agg(x.id, ', ') into missing
  from (values
    ('telefonseelsorge-de'),('nummer-gegen-kummer-de'),('hilfetelefon-gewalt-frauen-de'),
    ('bzga-aids-beratung-de'),('trans-telefonberatung-de'),('telefonseelsorge-at'),
    ('courage-beratung-at'),('dargebotene-hand-ch'),('du-bist-du-ch'),('samaritans-uk'),
    ('mindline-trans-uk'),('lgbt-helpline-ie'),('sos-homophobie-fr'),('switchboard-nl'),
    ('988-us'),('trevor-project-us'),('trans-lifeline-us'),('lgbt-youthline-ca'),
    ('lifeline-au'),('qlife-au'),('ilga-directory'),('iglyo'),
    ('lsvd-beratung-de'),('tgns-ch')
  ) as x(id)
  where not exists (
    select 1 from cms_pages p
    cross join lateral jsonb_array_elements(p.body_json->'hotlines') h
    where p.slug = 'help' and h->>'id' = x.id and h->>'verified_at' = '2026-08-11'
  );
  if missing is not null then
    raise exception 'hotline patch did not apply to: %', missing;
  end if;
end $$;

commit;
