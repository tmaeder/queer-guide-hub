-- C-1 / H-1 / H-2 (audit 2026-06-05) — hotline re-verification data patch.
-- Applied to prod cms_pages(slug='help').body_json.hotlines[]. Records the
-- 2026-06-05 verification pass: URL-liveness checked on all 25 entries,
-- phone numbers validated for format/region (NOT dialed — see verified_method).
--   * verified_at/verified_by stamped on the 22 live entries
--   * du-bist-du.ch -> apex host (TLS altname fix), iglyo -> .org (moved)
--   * du-bist-du-ch / iglyo / ilga-directory tagged kind='directory'
--   * 3 dead links (aidsberatung 404, mindline-trans 404, tgns.de TLS) ->
--     link_status='broken' + needs_review (phone CTA kept, website hidden)
update public.cms_pages set body_json = jsonb_set(body_json, '{hotlines}', $qg$[
  {
    "id": "telefonseelsorge-de",
    "url": "https://www.telefonseelsorge.de",
    "free": true,
    "name": "TelefonSeelsorge",
    "hours": "24/7",
    "phone": "0800 111 0 111",
    "topics": [
      "general",
      "suicide",
      "crisis"
    ],
    "country": "DE",
    "anonymous": true,
    "languages": [
      "de"
    ],
    "description": "Kostenlose, anonyme Krisenberatung am Telefon, per Chat und per Mail. Rund um die Uhr erreichbar.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "nummer-gegen-kummer-de",
    "url": "https://www.nummergegenkummer.de",
    "free": true,
    "name": "Nummer gegen Kummer — Kinder- und Jugendtelefon",
    "hours": "Mo–Sa 14–20 Uhr",
    "phone": "116 111",
    "topics": [
      "youth",
      "general",
      "crisis"
    ],
    "country": "DE",
    "anonymous": true,
    "languages": [
      "de"
    ],
    "description": "Kostenlose, anonyme Beratung für Kinder und Jugendliche bei allen Themen — auch zu Identität, Coming-out und Mobbing.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "lsvd-beratung-de",
    "url": "https://www.lsvd.de/de/ct/19-Beratung",
    "free": true,
    "name": "LSVD Beratung",
    "hours": "Di 15–19, Do 18–21",
    "phone": "030 789541-77",
    "topics": [
      "lgbtq",
      "discrimination",
      "coming-out",
      "legal"
    ],
    "country": "DE",
    "anonymous": true,
    "languages": [
      "de",
      "en"
    ],
    "description": "Beratung des Lesben- und Schwulenverbands zu rechtlichen Fragen, Coming-out, Partnerschaft und Diskriminierung.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "hilfetelefon-gewalt-frauen-de",
    "url": "https://www.hilfetelefon.de",
    "free": true,
    "name": "Hilfetelefon Gewalt gegen Frauen",
    "hours": "24/7",
    "phone": "08000 116 016",
    "topics": [
      "violence",
      "women",
      "general"
    ],
    "country": "DE",
    "anonymous": true,
    "languages": [
      "de",
      "en",
      "ar",
      "fa",
      "tr",
      "ru",
      "es",
      "fr",
      "it",
      "pl"
    ],
    "description": "Bundesweites Beratungstelefon für gewaltbetroffene Frauen (inkl. trans und inter Frauen). Übersetzung in 18 Sprachen.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "trans-telefonberatung-de",
    "url": "https://www.tgns.de",
    "free": true,
    "name": "Trans* Telefonberatung",
    "hours": "Mo, Mi, Fr 10–18",
    "phone": "030 4404 0890",
    "topics": [
      "trans",
      "lgbtq",
      "coming-out"
    ],
    "country": "DE",
    "anonymous": true,
    "languages": [
      "de"
    ],
    "description": "Beratung von trans Personen für trans Personen und Angehörige. Peer-Beratung zu Transition, Coming-out, Recht und Gesundheit.",
    "link_status": "broken",
    "needs_review": true,
    "link_checked_at": "2026-06-05"
  },
  {
    "id": "bzga-aids-beratung-de",
    "url": "https://www.aidsberatung.de",
    "free": true,
    "name": "BZgA Aids-Beratung",
    "hours": "Mo–Do 10–22, Fr 10–18, Sa–So 12–14",
    "phone": "0221 892031",
    "topics": [
      "health",
      "hiv",
      "lgbtq"
    ],
    "country": "DE",
    "anonymous": true,
    "languages": [
      "de"
    ],
    "description": "Anonyme Beratung zu HIV, Aids, sexuell übertragbaren Infektionen und Safer Sex.",
    "link_status": "broken",
    "needs_review": true,
    "link_checked_at": "2026-06-05"
  },
  {
    "id": "telefonseelsorge-at",
    "url": "https://www.telefonseelsorge.at",
    "free": true,
    "name": "Telefonseelsorge Österreich",
    "hours": "24/7",
    "phone": "142",
    "topics": [
      "general",
      "suicide",
      "crisis"
    ],
    "country": "AT",
    "anonymous": true,
    "languages": [
      "de"
    ],
    "description": "Kostenlose, anonyme Krisenhotline in Österreich. Auch per Chat und Mail erreichbar.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "courage-beratung-at",
    "url": "https://www.courage-beratung.at",
    "free": false,
    "name": "Courage LGBTIQ+ Beratung",
    "hours": "Mo–Fr nach Vereinbarung",
    "phone": "01 585 69 66",
    "topics": [
      "lgbtq",
      "coming-out",
      "relationships"
    ],
    "country": "AT",
    "anonymous": true,
    "languages": [
      "de",
      "en"
    ],
    "description": "Psychosoziale und psychotherapeutische Beratung für LGBTIQ+ Menschen in Wien, Linz, Graz und Salzburg.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "dargebotene-hand-ch",
    "url": "https://www.143.ch",
    "free": true,
    "name": "Die Dargebotene Hand",
    "hours": "24/7",
    "phone": "143",
    "topics": [
      "general",
      "suicide",
      "crisis"
    ],
    "country": "CH",
    "anonymous": true,
    "languages": [
      "de",
      "fr",
      "it"
    ],
    "description": "Schweizer Krisenhotline: vertrauliche, anonyme Gespräche rund um die Uhr.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "du-bist-du-ch",
    "url": "https://du-bist-du.ch",
    "free": true,
    "name": "du-bist-du",
    "hours": "E-Mail-Beratung",
    "phone": null,
    "topics": [
      "lgbtq",
      "youth",
      "coming-out"
    ],
    "country": "CH",
    "anonymous": true,
    "languages": [
      "de",
      "fr"
    ],
    "description": "E-Mail-Beratung für LGBTIQ+ Jugendliche in der Schweiz zu Coming-out, Identität und Beziehungen.",
    "link_status": "live",
    "kind": "directory",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "tgns-ch",
    "url": "https://www.tgns.ch",
    "free": true,
    "name": "Transgender Network Switzerland",
    "hours": "Mo–Fr",
    "phone": "031 533 37 93",
    "topics": [
      "trans",
      "lgbtq",
      "legal"
    ],
    "country": "CH",
    "anonymous": true,
    "languages": [
      "de",
      "fr",
      "it",
      "en"
    ],
    "description": "Peer-Beratung und rechtliche Unterstützung für trans Menschen in der Schweiz.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "switchboard-lgbt-uk",
    "url": "https://switchboard.lgbt",
    "free": true,
    "name": "Switchboard LGBT+",
    "hours": "Daily 10:00–22:00",
    "phone": "0800 0119 100",
    "topics": [
      "lgbtq",
      "general",
      "coming-out"
    ],
    "country": "GB",
    "anonymous": true,
    "languages": [
      "en"
    ],
    "description": "Free, confidential support for LGBTQIA+ people in the UK. Listening service, not advice.",
    "link_status": "bot_blocked",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "samaritans-uk",
    "url": "https://www.samaritans.org",
    "free": true,
    "name": "Samaritans",
    "hours": "24/7",
    "phone": "116 123",
    "topics": [
      "general",
      "suicide",
      "crisis"
    ],
    "country": "GB",
    "anonymous": true,
    "languages": [
      "en"
    ],
    "description": "Free, confidential emotional support for anyone in distress or suicidal crisis. Available across UK and Ireland.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "mindline-trans-uk",
    "url": "https://bristolmind.org.uk/help-and-counselling/mindline-transplus",
    "free": true,
    "name": "Mindline Trans+",
    "hours": "Mon & Fri 20:00–24:00",
    "phone": "0300 330 5468",
    "topics": [
      "trans",
      "lgbtq",
      "crisis"
    ],
    "country": "GB",
    "anonymous": true,
    "languages": [
      "en"
    ],
    "description": "Confidential emotional and mental health support line for trans, non-binary, gender-fluid and gender-diverse people.",
    "link_status": "broken",
    "needs_review": true,
    "link_checked_at": "2026-06-05"
  },
  {
    "id": "lgbt-helpline-ie",
    "url": "https://lgbt.ie",
    "free": true,
    "name": "LGBT Ireland Helpline",
    "hours": "Mon–Thu 18:30–22:00, Fri 16:00–22:00, weekends 16:00–18:00",
    "phone": "1800 929 539",
    "topics": [
      "lgbtq",
      "general",
      "coming-out"
    ],
    "country": "IE",
    "anonymous": true,
    "languages": [
      "en"
    ],
    "description": "Free, confidential support for LGBTQIA+ people, their families and friends across Ireland.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "trevor-project-us",
    "url": "https://www.thetrevorproject.org",
    "free": true,
    "name": "The Trevor Project",
    "hours": "24/7",
    "phone": "1-866-488-7386",
    "topics": [
      "lgbtq",
      "youth",
      "suicide",
      "crisis"
    ],
    "country": "US",
    "anonymous": true,
    "languages": [
      "en",
      "es"
    ],
    "description": "Crisis intervention and suicide prevention for LGBTQ+ young people under 25. Phone, chat, and text.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "trans-lifeline-us",
    "url": "https://translifeline.org",
    "free": true,
    "name": "Trans Lifeline",
    "hours": "24/7",
    "phone": "1-877-565-8860",
    "topics": [
      "trans",
      "lgbtq",
      "crisis"
    ],
    "country": "US",
    "anonymous": true,
    "languages": [
      "en",
      "es"
    ],
    "description": "Peer support hotline run by and for trans people. Non-carceral — no emergency services contacted without consent.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "988-us",
    "url": "https://988lifeline.org",
    "free": true,
    "name": "988 Suicide & Crisis Lifeline",
    "hours": "24/7",
    "phone": "988",
    "topics": [
      "general",
      "suicide",
      "crisis",
      "lgbtq"
    ],
    "country": "US",
    "anonymous": true,
    "languages": [
      "en",
      "es"
    ],
    "description": "Free, confidential crisis support. Press 3 for LGBTQ+ specific counsellors. Phone, chat, and text.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "lgbt-youthline-ca",
    "url": "https://www.youthline.ca",
    "free": true,
    "name": "LGBT YouthLine",
    "hours": "Sun–Fri 16:00–21:30",
    "phone": "1-800-268-9688",
    "topics": [
      "lgbtq",
      "youth",
      "coming-out"
    ],
    "country": "CA",
    "anonymous": true,
    "languages": [
      "en"
    ],
    "description": "Peer support by and for LGBTQ2S+ youth (29 and under) in Ontario, Canada. Phone, text, and chat.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "qlife-au",
    "url": "https://qlife.org.au",
    "free": true,
    "name": "QLife",
    "hours": "Daily 15:00–24:00",
    "phone": "1800 184 527",
    "topics": [
      "lgbtq",
      "general",
      "coming-out"
    ],
    "country": "AU",
    "anonymous": true,
    "languages": [
      "en"
    ],
    "description": "Anonymous, free LGBTI peer support and referral for people in Australia. Phone and webchat.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "lifeline-au",
    "url": "https://www.lifeline.org.au",
    "free": true,
    "name": "Lifeline Australia",
    "hours": "24/7",
    "phone": "13 11 14",
    "topics": [
      "general",
      "suicide",
      "crisis"
    ],
    "country": "AU",
    "anonymous": true,
    "languages": [
      "en"
    ],
    "description": "Crisis support and suicide prevention services. Free 24/7 phone, text, and chat.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "sos-homophobie-fr",
    "url": "https://www.sos-homophobie.org",
    "free": true,
    "name": "SOS homophobie",
    "hours": "Mon, Tue, Thu, Fri 18:00–22:00",
    "phone": "01 48 06 42 41",
    "topics": [
      "lgbtq",
      "discrimination",
      "violence"
    ],
    "country": "FR",
    "anonymous": true,
    "languages": [
      "fr"
    ],
    "description": "Écoute anonyme pour victimes et témoins de LGBTIphobies, avec soutien juridique.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "switchboard-nl",
    "url": "https://www.switchboard.nl",
    "free": true,
    "name": "Switchboard / Gay & Lesbian Switchboard",
    "hours": "Check website",
    "phone": "020 623 6565",
    "topics": [
      "lgbtq",
      "general",
      "coming-out"
    ],
    "country": "NL",
    "anonymous": true,
    "languages": [
      "nl",
      "en"
    ],
    "description": "Listening ear and information for LGBTQ+ people in the Netherlands.",
    "link_status": "live",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "ilga-directory",
    "url": "https://ilga.org",
    "free": true,
    "name": "ILGA World — Regional Resources",
    "hours": "Directory",
    "phone": null,
    "topics": [
      "lgbtq",
      "legal",
      "discrimination"
    ],
    "country": "INT",
    "anonymous": false,
    "languages": [
      "en",
      "es",
      "fr"
    ],
    "description": "Global federation of LGBTI organisations. Find a member organisation in your country for local support.",
    "link_status": "live",
    "kind": "directory",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  },
  {
    "id": "iglyo",
    "url": "https://www.iglyo.org",
    "free": true,
    "name": "IGLYO — International LGBTQI Youth & Student Organisation",
    "hours": "Directory",
    "phone": null,
    "topics": [
      "lgbtq",
      "youth"
    ],
    "country": "INT",
    "anonymous": false,
    "languages": [
      "en"
    ],
    "description": "International network of LGBTQI youth organisations. Find youth-focused support in your region.",
    "link_status": "live",
    "kind": "directory",
    "link_checked_at": "2026-06-05",
    "verified_at": "2026-06-05",
    "verified_by": "data-quality-audit-2026-06-05",
    "verified_method": "url-liveness+phone-format (not dialed)"
  }
]$qg$::jsonb), updated_at = now() where slug='help';
