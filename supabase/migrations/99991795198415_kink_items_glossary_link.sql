-- Kink checklist items link to their glossary (Knowledge) page.
--
-- A separate column, not `unified_tag_slug`: that one is read by intimate discovery
-- filters (`replace(ki.unified_tag_slug, 'intimate-', '')`), so repointing it would
-- change who matches whom.
--
-- The pairs are frozen and were read by hand (2026-11-20): every item whose slug or
-- label matched an ACTIVE, unmerged tag, each checked for sense (two came from the
-- label: cnc-fear-play -> fear-play, lactation -> lactation-play). Name matching at
-- runtime is not used: a same-name tag in the wrong sense would publish a wrong link.
-- Items with no glossary entry stay unlinked; admins can set the slug in the CMS.

alter table public.kink_items add column if not exists glossary_tag_slug text;

create temporary table _kink_glossary_pairs (item_slug text, tag_slug text) on commit drop;
insert into _kink_glossary_pairs (item_slug, tag_slug) values
  ('aftercare', 'aftercare'),
  ('anal-fingering', 'anal-fingering'),
  ('anal-fisting', 'anal-fisting'),
  ('androgyny', 'androgyny'),
  ('begging', 'begging'),
  ('biting', 'biting'),
  ('body-hair', 'body-hair'),
  ('body-worship', 'body-worship'),
  ('breath-play', 'breath-play'),
  ('caning', 'caning'),
  ('chastity', 'chastity'),
  ('clothespins', 'clothespins'),
  ('cnc-fear-play', 'fear-play'),
  ('crossdressing', 'cross-dressing'),
  ('cruising', 'cruising'),
  ('cuddling', 'cuddling'),
  ('cuffs', 'cuffs'),
  ('deep-throating', 'deep-throating'),
  ('dirty-talk', 'dirty-talk'),
  ('double-penetration', 'double-penetration'),
  ('drag', 'drag'),
  ('edging', 'edging'),
  ('erotic-hypnosis', 'erotic-hypnosis'),
  ('face-sitting', 'face-sitting'),
  ('face-slapping', 'face-slapping'),
  ('flogging', 'flogging'),
  ('foot-play', 'foot-play'),
  ('gangbang', 'gangbang'),
  ('gender-play', 'gender-play'),
  ('genitorture', 'genitorture'),
  ('glory-hole', 'glory-hole'),
  ('group-sex', 'group-sex'),
  ('kissing', 'kissing'),
  ('lactation', 'lactation-play'),
  ('leather', 'leather'),
  ('light-bondage', 'light-bondage'),
  ('medical-play', 'medical-play'),
  ('mummification', 'mummification'),
  ('mutual-masturbation', 'mutual-masturbation'),
  ('needle-play', 'needle-play'),
  ('nipple-clamps', 'nipple-clamps'),
  ('oral-sex', 'oral-sex'),
  ('orgasm-denial', 'orgasm-denial'),
  ('paddling', 'paddling'),
  ('pet-play', 'pet-play'),
  ('primal-play', 'primal-play'),
  ('rimming', 'rimming'),
  ('rough-sex', 'rough-sex'),
  ('scratching', 'scratching'),
  ('sensation-play', 'sensation-play'),
  ('sensory-deprivation', 'sensory-deprivation'),
  ('sexting', 'sexting'),
  ('sixty-nine', 'sixty-nine'),
  ('sounding', 'sounding'),
  ('spanking', 'spanking'),
  ('squirting', 'squirting'),
  ('stockings', 'stockings'),
  ('strap-on', 'strap-on'),
  ('suspension', 'suspension'),
  ('swallowing', 'swallowing'),
  ('temperature-play', 'temperature-play'),
  ('tickling', 'tickling'),
  ('underwear', 'underwear'),
  ('wax-play', 'wax-play'),
  ('whipping', 'whipping');

update public.kink_items ki
set glossary_tag_slug = v.tag_slug
from _kink_glossary_pairs v
join public.unified_tags t
  on t.slug = v.tag_slug and t.status = 'active' and t.merged_into_id is null
where ki.slug = v.item_slug
  and ki.glossary_tag_slug is null;

-- End state, not a count: every reviewed pair whose item and live tag both exist
-- here is linked. A database holding neither (a CI snapshot) passes; production,
-- measured at 65 resolvable pairs, must link all 65.
do $verify$
declare v_missing int;
begin
  select count(*) into v_missing
  from _kink_glossary_pairs v
  join public.kink_items ki on ki.slug = v.item_slug
  join public.unified_tags t
    on t.slug = v.tag_slug and t.status = 'active' and t.merged_into_id is null
  where ki.glossary_tag_slug is null;
  if v_missing <> 0 then
    raise exception 'kink_items glossary links: % reviewed pairs left unlinked', v_missing;
  end if;
end
$verify$;
