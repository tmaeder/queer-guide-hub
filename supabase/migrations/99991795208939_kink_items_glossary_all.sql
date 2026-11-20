-- Every Interests & boundaries checklist item links to a glossary article
-- (user request 2026-11-20). 99991795198415 linked the 65 exact-name matches;
-- this links the other 93.
--
-- 85 go to an existing entry under another name, each read for sense
-- (`beards` -> facial-hair, not `beard`, which is the "cover partner" slang;
-- `cnc-abduction` -> abduction-play, not `kidnapping`, which is the crime;
-- `watersports` -> piss-play; `sensual-massage` -> erotic-massage, not the
-- venue-type `massage`). The CNC framings without their own entry go to the
-- consensual-non-consent article. 8 had no entry and get one, written here,
-- unpublished (seo_indexable=false) like every other new glossary term.
begin;
select set_config('app.actor', 'migration:kink_items_glossary_all', true);

create temporary table _new_tags (slug text, name text, cat text, descr text, summ text, adult boolean) on commit drop;
insert into _new_tags values
  ('vaginal-sex', 'Vaginal Sex', 'practices-play', 'Sex in which a penis, fingers or a toy penetrates the vagina. Many trans men and non-binary people call it frontal sex instead, because they do not use the word vagina for their own body. Without a condom or other prevention it can pass on STIs and cause pregnancy.', 'Penetration of the vagina; also called frontal sex.', true),
  ('sportswear-fetish', 'Sportswear & Gear', 'fetishes-interests', 'Attraction to athletic clothing and kit — football shirts, shorts, trackies, lycra, trainers and socks — worn by a partner or by yourself. It overlaps with jock and uniform interests, and often with the smell of kit that has actually been worn.', 'Attraction to athletic clothing and kit.', true),
  ('mirror-play', 'Mirror Play', 'practices-play', 'Having sex in front of a mirror so you can watch yourselves and each other. Some people enjoy it as watching themselves; for others it is a way to see a partner''s reactions, or their own body, from a different angle.', 'Sex in front of a mirror, watching yourselves.', true),
  ('sharing-fantasies', 'Sharing Fantasies', 'practices-play', 'Telling a partner what you fantasise about, out loud, during sex or at another time. A fantasy shared is not a request to act it out, and saying so first makes it easier for both people to talk without feeling pushed.', 'Telling a partner your fantasies, without it being a request.', true),
  ('filming-yourselves', 'Filming Yourselves', 'practices-play', 'Recording yourselves having sex for your own use. Agree beforehand who keeps the files, where they are stored and when they are deleted. Sharing a recording without everyone''s consent is image-based abuse, and a crime in many countries.', 'Recording yourselves for private use, with agreed storage and deletion.', true),
  ('slim', 'Slim', 'fetishes-interests', 'A lean, narrow-framed body, and attraction to it. Used for people of any gender. In gay slang it overlaps with twink, which also implies youth; slim on its own does not.', 'Lean, narrow-framed body type, and attraction to it.', false),
  ('height-difference', 'Height Difference', 'fetishes-interests', 'Attraction to a clear height gap between partners — being much taller or much shorter than the person you are with. Often tied to size contrast, feeling protected or a power dynamic, and found in every gender combination.', 'Attraction to a clear height gap between partners.', false),
  ('clothed-sex', 'Clothed Sex', 'practices-play', 'Having sex while partly or fully dressed — trousers pushed down, a skirt lifted, a shirt left on. People enjoy it for the urgency, for the look of the clothes, or because they prefer not to be fully naked.', 'Sex while partly or fully dressed.', true);

insert into unified_tags (
  name, slug, description, short_description, category_id, category,
  status, seo_indexable, human_reviewed, is_adult, is_sensitive, usage_count, publication_role
)
select n.name, n.slug, n.descr, n.summ, c.id, c.name,
       'active', false, true, n.adult, false, 0, 'utility'
from _new_tags n
join tag_categories c on c.slug = n.cat
where not exists (select 1 from unified_tags t where t.slug = n.slug)
  and not exists (select 1 from tag_aliases a where a.alias_slug = n.slug);

insert into tag_category_assignments (tag_id, category_id, is_primary)
select t.id, c.id, true
from _new_tags n
join unified_tags t on t.slug = n.slug
join tag_categories c on c.slug = n.cat
where not exists (select 1 from tag_category_assignments x where x.tag_id = t.id and x.is_primary);

create temporary table _pairs (item_slug text, tag_slug text) on commit drop;
insert into _pairs values
  ('light-pain', 'pain-play'),
  ('cnc-resistance-play', 'consensual-non-consent-cnc'),
  ('cum-play', 'cum-fetish'),
  ('roleplay-scenarios', 'roleplay'),
  ('dildos', 'dildo'),
  ('threesomes', 'threesome'),
  ('hands-stroking-fingering', 'fingering'),
  ('frontal-vaginal-sex', 'vaginal-sex'),
  ('being-watched', 'exhibitionism'),
  ('ds-play', 'dominance-and-submission-d-s'),
  ('lingerie', 'lingerie-fetish'),
  ('facials', 'facial'),
  ('anal-sex-pegging', 'anal-sex'),
  ('vibrators', 'vibrator'),
  ('cnc-pinned-held-down', 'consensual-non-consent-cnc'),
  ('power-exchange-scenes', 'power-exchange'),
  ('praise', 'praise-kink'),
  ('beards', 'facial-hair'),
  ('watching-others', 'voyeurism'),
  ('strangers-roleplay', 'roleplay'),
  ('latex-rubber', 'latex'),
  ('rules-discipline', 'discipline'),
  ('muscular', 'muscle-fetish'),
  ('sportswear-gear', 'sportswear-fetish'),
  ('mirror-play', 'mirror-play'),
  ('partner-swapping', 'swinging-sexual-practice'),
  ('sensual-massage', 'erotic-massage'),
  ('butt-plugs', 'anal-plug'),
  ('cnc-forced-encounter', 'consensual-non-consent-cnc'),
  ('rope-shibari', 'shibari'),
  ('controlled-orgasms', 'orgasm-control'),
  ('riding-crops', 'riding-crop'),
  ('romance-dates', 'romance-love'),
  ('harnesses', 'harness'),
  ('degradation', 'degradation-play'),
  ('heels', 'high-heels-fetish'),
  ('fantasy-sharing', 'sharing-fantasies'),
  ('filming-private', 'filming-yourselves'),
  ('sleeves-strokers', 'male-masturbator'),
  ('anal-toys', 'sex-toy'),
  ('ruined-orgasms', 'ruined-orgasm'),
  ('blindfolds', 'blindfold'),
  ('cuckolding-compersion', 'cuckolding'),
  ('outercourse-grinding', 'non-penetrative-sex'),
  ('soft-curvy', 'bbw-bhm'),
  ('cnc-somnophilia', 'somnophilia'),
  ('acts-of-service', 'service'),
  ('slim', 'slim'),
  ('uniforms', 'uniform'),
  ('frontal-fisting', 'vaginal-fisting'),
  ('gags', 'gag'),
  ('name-calling', 'verbal-humiliation-and-degradation'),
  ('naturism', 'naturist'),
  ('play-parties', 'play-party'),
  ('spit-play', 'spitting'),
  ('machines', 'fucking-machine'),
  ('instruction-joi', 'jerk-off-instructions'),
  ('boots-footwear', 'boot'),
  ('tantra-slow-sex', 'tantric-sex'),
  ('cnc-abduction', 'abduction-play'),
  ('pup-hoods', 'puppy-play'),
  ('remote-toys', 'remote-control-devices'),
  ('watersports', 'piss-play'),
  ('darkrooms', 'darkroom'),
  ('armpit-play', 'armpit-fetish'),
  ('cnc-blind-scene', 'consensual-non-consent-cnc'),
  ('collars', 'collar'),
  ('public-teasing', 'teasing'),
  ('big-bodies', 'bbw-bhm'),
  ('cnc-blackmail-framing', 'consensual-non-consent-cnc'),
  ('cam-remote-play', 'camming'),
  ('leashes', 'leash'),
  ('cnc-roleplay', 'consensual-non-consent-cnc'),
  ('tattoos-piercings', 'tattoos'),
  ('saunas-bathhouses', 'bathhouse'),
  ('tpe-247', 'total-power-exchange-tpe'),
  ('cnc-authority-pressure', 'consensual-non-consent-cnc'),
  ('intense-pain', 'pain-play'),
  ('sploshing', 'splosh'),
  ('clothed-sex', 'clothed-sex'),
  ('height-difference', 'height-difference'),
  ('cnc-transactional', 'consensual-non-consent-cnc'),
  ('cnc-no-safeword-illusion', 'consensual-non-consent-cnc'),
  ('electro-stimulation', 'electrostimulation'),
  ('cnc-interrogation', 'interrogation'),
  ('cnc-captor-bond', 'consensual-non-consent-cnc'),
  ('cnc-mind-games', 'consensual-non-consent-cnc'),
  ('cnc-degradation-script', 'degradation-play'),
  ('cnc-monster-creature', 'consensual-non-consent-cnc'),
  ('cnc-historical-ritual', 'consensual-non-consent-cnc'),
  ('cnc-institutional', 'consensual-non-consent-cnc'),
  ('cnc-free-use', 'free-use'),
  ('cnc-public-stranger', 'consensual-non-consent-cnc');

-- Only fills empty links, so an admin's own choice in the CMS is never overwritten.
update kink_items k set glossary_tag_slug = p.tag_slug
from _pairs p
join unified_tags t on t.slug = p.tag_slug and t.status = 'active' and t.merged_into_id is null
where k.slug = p.item_slug and k.glossary_tag_slug is null;

do $verify$
declare v_bad int;
begin
  -- End state: no active item is left unlinked while its paired entry is live.
  -- (Keyed on the entry existing, so a near-empty CI database passes.)
  select count(*) into v_bad
  from kink_items k
  join _pairs p on p.item_slug = k.slug
  join unified_tags t on t.slug = p.tag_slug and t.status = 'active' and t.merged_into_id is null
  where k.is_active and k.glossary_tag_slug is null;
  if v_bad <> 0 then
    raise exception 'kink glossary: % checklist items still have no live glossary link', v_bad;
  end if;
end
$verify$;

commit;
