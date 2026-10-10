-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261010045306 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
--
-- RECOVERER'S NOTE, correcting the generic paragraph above for THIS file: the
-- author's own four-line header DID survive. `statements` holds parsed
-- statements, and leading comments attach to the statement that follows, so a
-- single-statement migration whose text opens with comments keeps them. The
-- lost-reasoning warning is accurate for the general case and wrong here —
-- everything below this line is the author's, byte-identical to prod (md5
-- 69cd2fa8c5592f61ef9e909029eaa6e3 over the ';\n\n' join, checked against a
-- digest Postgres computed over the same join).
--
-- Recovered by a different session than the one that applied it, to clear the
-- repo-wide drift failure. The 29 `duplicate_active_name` rows this migration
-- produced are a SEPARATE failure and are deliberately NOT touched here —
-- renaming German tags to their English labels collided them with the English
-- rows that already existed (saenger/sangerin/singer -> "Singer",
-- schauspieler/schauspieler-in/actor -> "Actor"), and deciding whether those
-- are merges, re-namings or an intended baseline move belongs to the author.
-- Curated English labels for the English unified_tags.name column.
-- Keep slugs, IDs, content assignments and counts intact. Proper names,
-- software titles and established cultural terms are deliberately excluded.
-- German names remain approved search aliases, rather than English labels.
SELECT set_config('app.actor', 'admin:tags-english-label-repair', true);

WITH fixes(slug, old_name, new_name) AS (
VALUES
  ('aktivist', 'Aktivist', 'Activist'),
  ('akzeptanz', 'Akzeptanz', 'Acceptance'),
  ('alter', 'Alter', 'Age'),
  ('altphilologe', 'Altphilologe', 'Classical Philologist'),
  ('americanfootball', 'Americanfootball', 'American Football'),
  ('andere-eltern', 'Andere Eltern', 'Other Parents'),
  ('anglikanischer-priester', 'Anglikanischer Priester', 'Anglican Priest'),
  ('anonym', 'Anonym', 'Anonymous'),
  ('anti-gewalt', 'Anti-Gewalt', 'Anti-Violence'),
  ('architekt', 'Architekt', 'Architect'),
  ('arzt-arztin', 'Arzt/Ärztin', 'Doctor'),
  ('auszeichnungen', 'Auszeichnungen', 'Awards'),
  ('autor', 'Autor', 'Author'),
  ('ballett-mitbegrunder', 'Ballett Mitbegrunder', 'Ballet Co-Founder'),
  ('barkeeper', 'Barkeeper', 'Bartender'),
  ('beamte', 'Beamte', 'Civil Servants'),
  ('begine', 'Begine', 'Beguine'),
  ('billard', 'Billard', 'Billiards'),
  ('bischof', 'Bischof', 'Bishop'),
  ('bogenschiessen', 'Bogenschiessen', 'Archery'),
  ('brasilian', 'Brasilian', 'Brazilian'),
  ('busfahrer', 'Busfahrer', 'Bus Driver'),
  ('darsteller', 'Darsteller', 'Performer'),
  ('dekan-von-st-albans', 'Dekan Von St Albans', 'Dean of St Albans'),
  ('dichter', 'Dichter', 'Poet'),
  ('dirigent', 'Dirigent', 'Conductor'),
  ('dragkuenstler', 'Dragkuenstler', 'Drag Performer'),
  ('drehbuchautor', 'Drehbuchautor', 'Screenwriter'),
  ('entfesselungskunstler', 'Entfesselungskunstler', 'Escape Artist'),
  ('erotik', 'Erotik', 'Erotica'),
  ('farber', 'Farber', 'Dyer'),
  ('fdny-kaplan', 'Fdny Kaplan', 'FDNY Chaplain'),
  ('frauen', 'Frauen', 'Women'),
  ('friseur', 'Friseur', 'Hairdresser'),
  ('fussballspieler', 'Fussballspieler', 'Football Player'),
  ('galerie', 'Galerie', 'Gallery'),
  ('garten', 'Garten', 'Garden'),
  ('geburtstag', 'Geburtstag', 'Birthday'),
  ('geheimagent', 'Geheimagent', 'Secret Agent'),
  ('geistliche-r', 'Geistliche R', 'Clergy'),
  ('geschlechtsidentitaten', 'Geschlechtsidentitäten', 'Gender Identities'),
  ('gewaltverbrechen', 'Gewaltverbrechen', 'Violent Crime'),
  ('gleichstellung', 'Gleichstellung', 'Equality'),
  ('grohandelskaufmann', 'Grohandelskaufmann', 'Wholesale Merchant'),
  ('gruppe', 'Gruppe', 'Group'),
  ('gruppen', 'Gruppen', 'Groups'),
  ('gutsbesitzer', 'Gutsbesitzer', 'Estate Owner'),
  ('historiker', 'Historiker', 'Historian'),
  ('hofling', 'Hofling', 'Courtier'),
  ('horbuch', 'Hörbuch', 'Audiobook'),
  ('horspiel', 'Hörspiel', 'Radio Drama'),
  ('huttenarbeiter', 'Huttenarbeiter', 'Steelworker'),
  ('identitat', 'Identität', 'Identity'),
  ('informatiker', 'Informatiker', 'Computer Scientist'),
  ('jugend', 'Jugend', 'Youth'),
  ('jugendbund-grunder', 'Jugendbund Grunder', 'Youth Association Founder'),
  ('jugendleiter', 'Jugendleiter', 'Youth Leader'),
  ('kabarettist', 'Kabarettist', 'Cabaret Performer'),
  ('kerle', 'Kerle', 'Guys'),
  ('kleinkunst', 'Kleinkunst', 'Cabaret Arts'),
  ('komiker', 'Komiker', 'Comedian'),
  ('kriegerin', 'Kriegerin', 'Warrior'),
  ('kritiker', 'Kritiker', 'Critic'),
  ('kuenstler', 'Kuenstler', 'Artist'),
  ('kultur', 'Kultur', 'Culture'),
  ('kunst', 'Kunst', 'Art'),
  ('kunstsammler', 'Kunstsammler', 'Art Collector'),
  ('lehrer', 'Lehrer', 'Teacher'),
  ('leichtathlet', 'Leichtathlet', 'Track and Field Athlete'),
  ('leichtathletik', 'Leichtathletik', 'Track and Field'),
  ('marineflieger', 'Marineflieger', 'Naval Aviator'),
  ('medien', 'Medien', 'Media'),
  ('militarberater', 'Militarberater', 'Military Adviser'),
  ('modedesigner', 'Modedesigner', 'Fashion Designer'),
  ('musiker', 'Musiker', 'Musician'),
  ('musikkabarett', 'Musikkabarett', 'Musical Cabaret'),
  ('nasa-mitarbeiter', 'Nasa Mitarbeiter', 'NASA Employee'),
  ('nonne', 'Nonne', 'Nun'),
  ('open-source-aktivist', 'Open Source Aktivist', 'Open Source Activist'),
  ('opernsaenger', 'Opernsaenger', 'Opera Singer'),
  ('ordensgeistliche', 'Ordensgeistliche', 'Religious Order Clergy'),
  ('papst', 'Papst', 'Pope'),
  ('parlamentsstenograf', 'Parlamentsstenograf', 'Parliamentary Stenographer'),
  ('performancekuenstler', 'Performancekuenstler', 'Performance Artist'),
  ('pommes', 'Pommes', 'Fries'),
  ('postbeamt', 'Postbeamt', 'Postal Worker'),
  ('preise', 'Preise', 'Awards'),
  ('preistrager', 'Preisträger', 'Award Winner'),
  ('priester', 'Priester', 'Priest'),
  ('proberaum', 'Proberaum', 'Rehearsal Room'),
  ('queer-bewegung', 'Queer-Bewegung', 'Queer Movement'),
  ('queer-kultur', 'Queer-Kultur', 'Queer Culture'),
  ('queere-kultur', 'Queere Kultur', 'Queer Culture'),
  ('redakteur', 'Redakteur', 'Editor'),
  ('regisseur', 'Regisseur', 'Film Director'),
  ('reichsbahnbeamter', 'Reichsbahnbeamter', 'Railway Official'),
  ('richter', 'Richter', 'Judge'),
  ('rudern', 'Rudern', 'Rowing'),
  ('sangerin', 'Sängerin', 'Singer'),
  ('schauspieler', 'Schauspieler', 'Actor'),
  ('schauspieler-in', 'Schauspieler/In', 'Actor'),
  ('schonheitskonigin', 'Schonheitskonigin', 'Beauty Queen'),
  ('schwimmen', 'Schwimmen', 'Swimming'),
  ('selbsthilfe', 'Selbsthilfe', 'Self-Help'),
  ('sexarbeiter', 'Sexarbeiter', 'Sex Worker'),
  ('sexuell', 'Sexuell', 'Sexual'),
  ('sichtbarkeit', 'Sichtbarkeit', 'Visibility'),
  ('soldat', 'Soldat', 'Soldier'),
  ('sozialarbeiter', 'Sozialarbeiter', 'Social Worker'),
  ('sportler', 'Sportler', 'Athlete'),
  ('staatsmann', 'Staatsmann', 'Statesman'),
  ('straenbahnschaffner', 'Straenbahnschaffner', 'Tram Conductor'),
  ('tagebuchautor', 'Tagebuchautor', 'Diarist'),
  ('theoretiker', 'Theoretiker', 'Theorist'),
  ('topferin', 'Topferin', 'Potter'),
  ('treffen', 'Treffen', 'Meetings'),
  ('u30', 'Ü30', 'Over 30'),
  ('unternehmer', 'Unternehmer', 'Entrepreneur'),
  ('verbuendete', 'Verbuendete', 'Allies'),
  ('verleger', 'Verleger', 'Publisher'),
  ('vernetzung', 'Vernetzung', 'Networking'),
  ('weberin', 'Weberin', 'Weaver'),
  ('widerstandskaempfer', 'Widerstandskaempfer', 'Resistance Fighter'),
  ('zauberkuenstler', 'Zauberkuenstler', 'Magician'),
  ('zeichner', 'Zeichner', 'Illustrator'),
  ('zen-priester', 'Zen Priester', 'Zen Priest'),
  ('zirkus', 'Zirkus', 'Circus'),
  ('zirkuskuenstler', 'Zirkuskuenstler', 'Circus Performer'),
  ('buchhalter', 'Buchhalter', 'Accountant'),
  ('gesellschaft', 'Gesellschaft', 'Society'),
  ('kunstlerduo', 'Kunstlerduo', 'Artist Duo'),
  ('politiker', 'Politiker', 'Politician'),
  ('saenger', 'Saenger', 'Singer'),
  ('dramatiker', 'Dramatiker', 'Playwright'),
  ('fernsehen', 'Fernsehen', 'Television'),
  ('filmemacher', 'Filmemacher', 'Filmmaker'),
  ('homosexuellen-bewegung', 'Homosexuellen-Bewegung', 'Gay Rights Movement'),
  ('krankenpfleger', 'Krankenpfleger', 'Nurse'),
  ('krankenpflegeschuler', 'Krankenpflegeschuler', 'Nursing Student'),
  ('lgbtq-aktivistin', 'LGBTQ+ Aktivistin', 'LGBTQ+ Activist'),
  ('lgbtq-personen', 'LGBTQ+ Personen', 'LGBTQ+ People'),
  ('maler', 'Maler', 'Painter'),
  ('minderheiten', 'Minderheiten', 'Minorities'),
  ('mordopfer', 'Mordopfer', 'Murder Victim'),
  ('pfarrer', 'Pfarrer', 'Parish Priest'),
  ('rabbiner', 'Rabbiner', 'Rabbi'),
  ('schriftstellerin', 'Schriftstellerin', 'Writer'),
  ('sexualwissenschaftler', 'Sexualwissenschaftler', 'Sex Researcher'),
  ('sprecher', 'Sprecher', 'Speaker'),
  ('strafverfolgung', 'Strafverfolgung', 'Prosecution'),
  ('tanzer', 'Tanzer', 'Dancer'),
  ('transpersonen', 'Transpersonen', 'Trans People'),
  ('uebersetzer', 'Uebersetzer', 'Translator'),
  ('wissenschaftler', 'Wissenschaftler', 'Scientist'),
  ('burgermeister-von-houston', 'Burgermeister Von Houston', 'Mayor of Houston')
), renamed AS (
  UPDATE public.unified_tags u
     SET name = f.new_name
    FROM fixes f
   WHERE u.slug = f.slug AND u.name = f.old_name AND u.status = 'active'
  RETURNING u.id, u.slug, f.old_name, u.name
), aliases AS (
  INSERT INTO public.tag_aliases
    (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
  SELECT id, old_name, slug, 'multilingual', 'approved' FROM renamed
  ON CONFLICT (alias_slug) DO NOTHING
  RETURNING id
)
SELECT (SELECT count(*) FROM renamed) AS renamed,
       (SELECT count(*) FROM aliases) AS aliases_added;

-- The former label-specific lead must describe the English heading.
UPDATE public.unified_tags
   SET description = 'Regular meet-ups, support groups and peer counseling sessions that fill much of the queer community calendar.'
 WHERE slug = 'gruppen' AND name = 'Groups'
   AND description = 'German for groups: the regular meet-ups, support groups and peer counseling sessions that fill much of the queer community calendar.';
;
