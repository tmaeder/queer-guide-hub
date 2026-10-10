-- Read-only regression contracts for the cleaned profession catalogue.
BEGIN;
DO $test$
DECLARE p record; token text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.professions WHERE slug LIKE 'nonprofession-%') THEN
  RAISE EXCEPTION 'Topic rejection rows leaked into the occupation catalogue';
 END IF;
 FOR p IN SELECT name FROM public.professions WHERE is_active LOOP
  IF public.normalize_profession(p.name) IS DISTINCT FROM p.name THEN
   RAISE EXCEPTION 'Canonical occupation changed: %',p.name;
  END IF;
 END LOOP;
 FOREACH token IN ARRAY ARRAY['Art','Kunst','Politics','Politik','Music','Musik','Film','Fashion','Mode','Science','Wissenschaft','Community','Comedy','Performance','Literature','Literatur','Dance','Tanz','Acting','Schauspiel','Services','Dienstleistung','bildende kunst','lyrik','fernsehen','film & fernsehen'] LOOP
  IF public.normalize_profession(token) IS NOT NULL OR public.normalize_profession_full(token)->>'match'<>'rejected' THEN
   RAISE EXCEPTION 'Topic became an occupation: %',token;
  END IF;
 END LOOP;
 IF public.normalize_profession('Schauspieler/in') IS DISTINCT FROM 'Actor'
  OR public.normalize_profession('Sängerin') IS DISTINCT FROM 'Singer'
  OR public.normalize_profession('Politikerin') IS DISTINCT FROM 'Politician'
  OR public.normalize_profession('Drag king') IS DISTINCT FROM 'Drag king' THEN
  RAISE EXCEPTION 'Occupation alias or drag identity was changed';
 END IF;
END $test$;
SELECT 'profession catalogue cleanup contracts passed' AS verification;
ROLLBACK;
