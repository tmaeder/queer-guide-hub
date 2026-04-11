-- Seed the "/help" crisis hotlines page.
--
-- Creates a single cms_pages row (slug='help') that holds:
--   • body_html  — short intro + safety disclaimer (rendered as HTML)
--   • body_json  — structured { hotlines: [...] } consumed by HelpHotlines.tsx
--
-- Admins can edit both fields later via AdminCMS. This migration only
-- creates the row if it does not already exist (idempotent).

INSERT INTO cms_pages (
  slug,
  page_type,
  title,
  subtitle,
  excerpt,
  body_html,
  body_json,
  workflow_state,
  visibility_level,
  published_at,
  meta_title,
  meta_description,
  tags,
  category
)
VALUES (
  'help',
  'page',
  'Hilfe & Krisen-Hotlines',
  'Du bist nicht allein. Hier findest du sofortige Unterstützung.',
  'Kostenlose, anonyme und vertrauliche Hotlines und Beratungsstellen für queere Menschen in Krisensituationen.',
  $HTML$
<p><strong>Bei akuter Lebensgefahr wähle sofort den Notruf: 112 (EU) oder 911 (US/CA).</strong></p>
<p>Queer Guide ist kein Ersatz für professionelle Hilfe. Die folgenden Hotlines und Beratungsstellen bieten kostenlose, anonyme und vertrauliche Unterstützung — speziell für LGBTQIA+ Menschen oder allgemeine Krisenberatung. Niemand muss eine schwierige Situation allein durchstehen.</p>
<p>Wenn du gerade jemandem zuhörst, der in einer Krise steckt: Nimm die Person ernst, bleib ruhig, hör zu, und ermutige sie, eine der Nummern anzurufen. Du musst nicht alle Antworten haben.</p>
<hr/>
<p><em>In acute danger, call your local emergency number immediately: 112 (EU) or 911 (US/CA). Queer Guide does not replace professional help. The hotlines below offer free, anonymous, and confidential support — either LGBTQIA+ specific or general crisis counselling. You are not alone.</em></p>
  $HTML$,
  jsonb_build_object(
    'hotlines', jsonb_build_array(
      -- ── Germany ─────────────────────────────────────────────────────
      jsonb_build_object(
        'id', 'telefonseelsorge-de',
        'name', 'TelefonSeelsorge',
        'country', 'DE',
        'phone', '0800 111 0 111',
        'url', 'https://www.telefonseelsorge.de',
        'topics', jsonb_build_array('general', 'suicide', 'crisis'),
        'languages', jsonb_build_array('de'),
        'hours', '24/7',
        'description', 'Kostenlose, anonyme Krisenberatung am Telefon, per Chat und per Mail. Rund um die Uhr erreichbar.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'nummer-gegen-kummer-de',
        'name', 'Nummer gegen Kummer — Kinder- und Jugendtelefon',
        'country', 'DE',
        'phone', '116 111',
        'url', 'https://www.nummergegenkummer.de',
        'topics', jsonb_build_array('youth', 'general', 'crisis'),
        'languages', jsonb_build_array('de'),
        'hours', 'Mo–Sa 14–20 Uhr',
        'description', 'Kostenlose, anonyme Beratung für Kinder und Jugendliche bei allen Themen — auch zu Identität, Coming-out und Mobbing.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'lsvd-beratung-de',
        'name', 'LSVD Beratung',
        'country', 'DE',
        'phone', '030 789541-77',
        'url', 'https://www.lsvd.de/de/ct/19-Beratung',
        'topics', jsonb_build_array('lgbtq', 'discrimination', 'coming-out', 'legal'),
        'languages', jsonb_build_array('de', 'en'),
        'hours', 'Di 15–19, Do 18–21',
        'description', 'Beratung des Lesben- und Schwulenverbands zu rechtlichen Fragen, Coming-out, Partnerschaft und Diskriminierung.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'hilfetelefon-gewalt-frauen-de',
        'name', 'Hilfetelefon Gewalt gegen Frauen',
        'country', 'DE',
        'phone', '08000 116 016',
        'url', 'https://www.hilfetelefon.de',
        'topics', jsonb_build_array('violence', 'women', 'general'),
        'languages', jsonb_build_array('de', 'en', 'ar', 'fa', 'tr', 'ru', 'es', 'fr', 'it', 'pl'),
        'hours', '24/7',
        'description', 'Bundesweites Beratungstelefon für gewaltbetroffene Frauen (inkl. trans und inter Frauen). Übersetzung in 18 Sprachen.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'trans-telefonberatung-de',
        'name', 'Trans* Telefonberatung',
        'country', 'DE',
        'phone', '030 4404 0890',
        'url', 'https://www.tgns.de',
        'topics', jsonb_build_array('trans', 'lgbtq', 'coming-out'),
        'languages', jsonb_build_array('de'),
        'hours', 'Mo, Mi, Fr 10–18',
        'description', 'Beratung von trans Personen für trans Personen und Angehörige. Peer-Beratung zu Transition, Coming-out, Recht und Gesundheit.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'bzga-aids-beratung-de',
        'name', 'BZgA Aids-Beratung',
        'country', 'DE',
        'phone', '0221 892031',
        'url', 'https://www.aidsberatung.de',
        'topics', jsonb_build_array('health', 'hiv', 'lgbtq'),
        'languages', jsonb_build_array('de'),
        'hours', 'Mo–Do 10–22, Fr 10–18, Sa–So 12–14',
        'description', 'Anonyme Beratung zu HIV, Aids, sexuell übertragbaren Infektionen und Safer Sex.',
        'free', true,
        'anonymous', true
      ),

      -- ── Austria ─────────────────────────────────────────────────────
      jsonb_build_object(
        'id', 'telefonseelsorge-at',
        'name', 'Telefonseelsorge Österreich',
        'country', 'AT',
        'phone', '142',
        'url', 'https://www.telefonseelsorge.at',
        'topics', jsonb_build_array('general', 'suicide', 'crisis'),
        'languages', jsonb_build_array('de'),
        'hours', '24/7',
        'description', 'Kostenlose, anonyme Krisenhotline in Österreich. Auch per Chat und Mail erreichbar.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'courage-beratung-at',
        'name', 'Courage LGBTIQ+ Beratung',
        'country', 'AT',
        'phone', '01 585 69 66',
        'url', 'https://www.courage-beratung.at',
        'topics', jsonb_build_array('lgbtq', 'coming-out', 'relationships'),
        'languages', jsonb_build_array('de', 'en'),
        'hours', 'Mo–Fr nach Vereinbarung',
        'description', 'Psychosoziale und psychotherapeutische Beratung für LGBTIQ+ Menschen in Wien, Linz, Graz und Salzburg.',
        'free', false,
        'anonymous', true
      ),

      -- ── Switzerland ─────────────────────────────────────────────────
      jsonb_build_object(
        'id', 'dargebotene-hand-ch',
        'name', 'Die Dargebotene Hand',
        'country', 'CH',
        'phone', '143',
        'url', 'https://www.143.ch',
        'topics', jsonb_build_array('general', 'suicide', 'crisis'),
        'languages', jsonb_build_array('de', 'fr', 'it'),
        'hours', '24/7',
        'description', 'Schweizer Krisenhotline: vertrauliche, anonyme Gespräche rund um die Uhr.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'du-bist-du-ch',
        'name', 'du-bist-du',
        'country', 'CH',
        'phone', null,
        'url', 'https://www.du-bist-du.ch',
        'topics', jsonb_build_array('lgbtq', 'youth', 'coming-out'),
        'languages', jsonb_build_array('de', 'fr'),
        'hours', 'E-Mail-Beratung',
        'description', 'E-Mail-Beratung für LGBTIQ+ Jugendliche in der Schweiz zu Coming-out, Identität und Beziehungen.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'tgns-ch',
        'name', 'Transgender Network Switzerland',
        'country', 'CH',
        'phone', '031 533 37 93',
        'url', 'https://www.tgns.ch',
        'topics', jsonb_build_array('trans', 'lgbtq', 'legal'),
        'languages', jsonb_build_array('de', 'fr', 'it', 'en'),
        'hours', 'Mo–Fr',
        'description', 'Peer-Beratung und rechtliche Unterstützung für trans Menschen in der Schweiz.',
        'free', true,
        'anonymous', true
      ),

      -- ── United Kingdom ──────────────────────────────────────────────
      jsonb_build_object(
        'id', 'switchboard-lgbt-uk',
        'name', 'Switchboard LGBT+',
        'country', 'GB',
        'phone', '0800 0119 100',
        'url', 'https://switchboard.lgbt',
        'topics', jsonb_build_array('lgbtq', 'general', 'coming-out'),
        'languages', jsonb_build_array('en'),
        'hours', 'Daily 10:00–22:00',
        'description', 'Free, confidential support for LGBTQIA+ people in the UK. Listening service, not advice.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'samaritans-uk',
        'name', 'Samaritans',
        'country', 'GB',
        'phone', '116 123',
        'url', 'https://www.samaritans.org',
        'topics', jsonb_build_array('general', 'suicide', 'crisis'),
        'languages', jsonb_build_array('en'),
        'hours', '24/7',
        'description', 'Free, confidential emotional support for anyone in distress or suicidal crisis. Available across UK and Ireland.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'mindline-trans-uk',
        'name', 'Mindline Trans+',
        'country', 'GB',
        'phone', '0300 330 5468',
        'url', 'https://bristolmind.org.uk/help-and-counselling/mindline-transplus',
        'topics', jsonb_build_array('trans', 'lgbtq', 'crisis'),
        'languages', jsonb_build_array('en'),
        'hours', 'Mon & Fri 20:00–24:00',
        'description', 'Confidential emotional and mental health support line for trans, non-binary, gender-fluid and gender-diverse people.',
        'free', true,
        'anonymous', true
      ),

      -- ── Ireland ─────────────────────────────────────────────────────
      jsonb_build_object(
        'id', 'lgbt-helpline-ie',
        'name', 'LGBT Ireland Helpline',
        'country', 'IE',
        'phone', '1800 929 539',
        'url', 'https://lgbt.ie',
        'topics', jsonb_build_array('lgbtq', 'general', 'coming-out'),
        'languages', jsonb_build_array('en'),
        'hours', 'Mon–Thu 18:30–22:00, Fri 16:00–22:00, weekends 16:00–18:00',
        'description', 'Free, confidential support for LGBTQIA+ people, their families and friends across Ireland.',
        'free', true,
        'anonymous', true
      ),

      -- ── United States ───────────────────────────────────────────────
      jsonb_build_object(
        'id', 'trevor-project-us',
        'name', 'The Trevor Project',
        'country', 'US',
        'phone', '1-866-488-7386',
        'url', 'https://www.thetrevorproject.org',
        'topics', jsonb_build_array('lgbtq', 'youth', 'suicide', 'crisis'),
        'languages', jsonb_build_array('en', 'es'),
        'hours', '24/7',
        'description', 'Crisis intervention and suicide prevention for LGBTQ+ young people under 25. Phone, chat, and text.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'trans-lifeline-us',
        'name', 'Trans Lifeline',
        'country', 'US',
        'phone', '1-877-565-8860',
        'url', 'https://translifeline.org',
        'topics', jsonb_build_array('trans', 'lgbtq', 'crisis'),
        'languages', jsonb_build_array('en', 'es'),
        'hours', '24/7',
        'description', 'Peer support hotline run by and for trans people. Non-carceral — no emergency services contacted without consent.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', '988-us',
        'name', '988 Suicide & Crisis Lifeline',
        'country', 'US',
        'phone', '988',
        'url', 'https://988lifeline.org',
        'topics', jsonb_build_array('general', 'suicide', 'crisis', 'lgbtq'),
        'languages', jsonb_build_array('en', 'es'),
        'hours', '24/7',
        'description', 'Free, confidential crisis support. Press 3 for LGBTQ+ specific counsellors. Phone, chat, and text.',
        'free', true,
        'anonymous', true
      ),

      -- ── Canada ──────────────────────────────────────────────────────
      jsonb_build_object(
        'id', 'lgbt-youthline-ca',
        'name', 'LGBT YouthLine',
        'country', 'CA',
        'phone', '1-800-268-9688',
        'url', 'https://www.youthline.ca',
        'topics', jsonb_build_array('lgbtq', 'youth', 'coming-out'),
        'languages', jsonb_build_array('en'),
        'hours', 'Sun–Fri 16:00–21:30',
        'description', 'Peer support by and for LGBTQ2S+ youth (29 and under) in Ontario, Canada. Phone, text, and chat.',
        'free', true,
        'anonymous', true
      ),

      -- ── Australia ───────────────────────────────────────────────────
      jsonb_build_object(
        'id', 'qlife-au',
        'name', 'QLife',
        'country', 'AU',
        'phone', '1800 184 527',
        'url', 'https://qlife.org.au',
        'topics', jsonb_build_array('lgbtq', 'general', 'coming-out'),
        'languages', jsonb_build_array('en'),
        'hours', 'Daily 15:00–24:00',
        'description', 'Anonymous, free LGBTI peer support and referral for people in Australia. Phone and webchat.',
        'free', true,
        'anonymous', true
      ),
      jsonb_build_object(
        'id', 'lifeline-au',
        'name', 'Lifeline Australia',
        'country', 'AU',
        'phone', '13 11 14',
        'url', 'https://www.lifeline.org.au',
        'topics', jsonb_build_array('general', 'suicide', 'crisis'),
        'languages', jsonb_build_array('en'),
        'hours', '24/7',
        'description', 'Crisis support and suicide prevention services. Free 24/7 phone, text, and chat.',
        'free', true,
        'anonymous', true
      ),

      -- ── France ──────────────────────────────────────────────────────
      jsonb_build_object(
        'id', 'sos-homophobie-fr',
        'name', 'SOS homophobie',
        'country', 'FR',
        'phone', '01 48 06 42 41',
        'url', 'https://www.sos-homophobie.org',
        'topics', jsonb_build_array('lgbtq', 'discrimination', 'violence'),
        'languages', jsonb_build_array('fr'),
        'hours', 'Mon, Tue, Thu, Fri 18:00–22:00',
        'description', 'Écoute anonyme pour victimes et témoins de LGBTIphobies, avec soutien juridique.',
        'free', true,
        'anonymous', true
      ),

      -- ── Netherlands ─────────────────────────────────────────────────
      jsonb_build_object(
        'id', 'switchboard-nl',
        'name', 'Switchboard / Gay & Lesbian Switchboard',
        'country', 'NL',
        'phone', '020 623 6565',
        'url', 'https://www.switchboard.nl',
        'topics', jsonb_build_array('lgbtq', 'general', 'coming-out'),
        'languages', jsonb_build_array('nl', 'en'),
        'hours', 'Check website',
        'description', 'Listening ear and information for LGBTQ+ people in the Netherlands.',
        'free', true,
        'anonymous', true
      ),

      -- ── International fallbacks ─────────────────────────────────────
      jsonb_build_object(
        'id', 'ilga-directory',
        'name', 'ILGA World — Regional Resources',
        'country', 'INT',
        'phone', null,
        'url', 'https://ilga.org',
        'topics', jsonb_build_array('lgbtq', 'legal', 'discrimination'),
        'languages', jsonb_build_array('en', 'es', 'fr'),
        'hours', 'Directory',
        'description', 'Global federation of LGBTI organisations. Find a member organisation in your country for local support.',
        'free', true,
        'anonymous', false
      ),
      jsonb_build_object(
        'id', 'iglyo',
        'name', 'IGLYO — International LGBTQI Youth & Student Organisation',
        'country', 'INT',
        'phone', null,
        'url', 'https://www.iglyo.com',
        'topics', jsonb_build_array('lgbtq', 'youth'),
        'languages', jsonb_build_array('en'),
        'hours', 'Directory',
        'description', 'International network of LGBTQI youth organisations. Find youth-focused support in your region.',
        'free', true,
        'anonymous', false
      )
    )
  ),
  'published',
  'public',
  now(),
  'Hilfe & Krisen-Hotlines | Queer Guide',
  'Kostenlose, anonyme LGBTQIA+ Krisenhotlines und Beratungsstellen weltweit. Du bist nicht allein.',
  ARRAY['help', 'crisis', 'support', 'hotline'],
  'support'
)
ON CONFLICT (slug) DO NOTHING;
