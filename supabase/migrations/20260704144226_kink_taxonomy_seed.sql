-- Kink taxonomy seed v1. Idempotent (ON CONFLICT slug DO UPDATE).
-- Adapted from KinkList defaults with LGBTQ+-inclusive, anatomy-neutral wording.
-- Deliberate exclusions: non-consent ("aggressor/target") category, incest,
-- bestiality, necrophilia, age play, blood play, scat. CNC appears only as
-- pre-negotiated roleplay with discussion_recommended.
-- English labels only; label_i18n backfilled later (UI falls back to label).

insert into public.kink_categories (slug, label, description, axis, sort_order) values
  ('affection-romance',  'Affection & romance',        'Warmth, closeness and connection.', 'general', 10),
  ('bodies-attraction',  'Bodies & attraction',        'Features and presentation you find attractive.', 'general', 20),
  ('clothing-gear',      'Clothing',                   'What''s worn — on you or your partner.', 'self_partner', 30),
  ('oral-hands',         'Oral & hands',               'Mouths and hands.', 'give_receive', 40),
  ('penetration',        'Penetrative play',           'Penetrative sex of any configuration.', 'give_receive', 50),
  ('anal-play',          'Anal play',                  'Everything anal.', 'give_receive', 60),
  ('bondage-restraints', 'Bondage & restraints',       'Restriction and restraint play.', 'give_receive', 70),
  ('impact-play',        'Impact play',                'Consensual striking with hands or implements.', 'give_receive', 80),
  ('pain-intensity',     'Pain & intensity',           'Intense sensation by mutual agreement.', 'give_receive', 90),
  ('sensation-tease',    'Sensation & tease',          'Light, playful and sensory experiences.', 'give_receive', 100),
  ('power-dynamics',     'Power dynamics',             'Consensual exchange of control.', 'dom_sub', 110),
  ('verbal-play',        'Verbal play',                'What''s said during play.', 'give_receive', 120),
  ('voyeur-exhib',       'Watching & being watched',   'Exhibitionism and voyeurism between consenting adults.', 'self_partner', 130),
  ('group-social',       'Group & social',             'More than two, and queer social venues.', 'general', 140),
  ('fluids-mess',        'Fluids & mess',              'Body fluids and messy play.', 'general', 150),
  ('toys-tech',          'Toys & tech',                'Toys, machines and remote play.', 'give_receive', 160),
  ('orgasm-control',     'Orgasm control',             'Controlling when and how orgasms happen.', 'give_receive', 170),
  ('roleplay-fantasy',   'Roleplay & fantasy',         'Characters, scenarios and imagination.', 'general', 180),
  ('materials-fetish',   'Materials & fetish gear',    'Leather, rubber, sportswear and gear.', 'general', 190)
on conflict (slug) do update set
  label = excluded.label,
  description = excluded.description,
  axis = excluded.axis,
  sort_order = excluded.sort_order,
  is_active = true;

with cat as (select id, slug from public.kink_categories)
insert into public.kink_items
  (category_id, slug, label, description, axis_override, discussion_recommended, sort_order, unified_tag_slug)
select c.id, v.slug, v.label, v.description, v.axis_override, v.discussion_recommended, v.sort_order, v.unified_tag_slug
from (values
  -- Affection & romance (general)
  ('affection-romance', 'kissing',              'Kissing & making out', null, null, false, 10, 'intimate-kissing'),
  ('affection-romance', 'cuddling',             'Cuddling & spooning', null, null, false, 20, 'intimate-cuddling'),
  ('affection-romance', 'sensual-massage',      'Sensual massage', null, 'give_receive', false, 30, 'intimate-massage'),
  ('affection-romance', 'romance-dates',        'Romance & dates', null, null, false, 40, null),
  ('affection-romance', 'tantra-slow-sex',      'Tantra & slow sex', null, null, false, 50, 'intimate-tantra'),
  ('affection-romance', 'aftercare',            'Aftercare', 'Checking in and caring for each other after a scene.', 'give_receive', false, 60, null),

  -- Bodies & attraction (general)
  ('bodies-attraction', 'body-hair',            'Body hair', null, null, false, 10, null),
  ('bodies-attraction', 'beards',               'Beards & scruff', null, null, false, 20, null),
  ('bodies-attraction', 'muscular',             'Muscular bodies', null, null, false, 30, null),
  ('bodies-attraction', 'soft-curvy',           'Soft & curvy bodies', null, null, false, 40, null),
  ('bodies-attraction', 'slim',                 'Slim bodies', null, null, false, 50, null),
  ('bodies-attraction', 'big-bodies',           'Big bodies', null, null, false, 60, null),
  ('bodies-attraction', 'tattoos-piercings',    'Tattoos & piercings', null, null, false, 70, null),
  ('bodies-attraction', 'androgyny',            'Androgyny', null, null, false, 80, null),
  ('bodies-attraction', 'height-difference',    'Height difference', null, null, false, 90, null),

  -- Clothing (self_partner)
  ('clothing-gear', 'lingerie',                 'Lingerie', null, null, false, 10, null),
  ('clothing-gear', 'underwear',                'Underwear, jocks & briefs', null, null, false, 20, null),
  ('clothing-gear', 'stockings',                'Stockings & hosiery', null, null, false, 30, null),
  ('clothing-gear', 'heels',                    'Heels', null, null, false, 40, null),
  ('clothing-gear', 'uniforms',                 'Uniforms & costumes', null, null, false, 50, null),
  ('clothing-gear', 'crossdressing',            'Cross-dressing', null, null, false, 60, null),
  ('clothing-gear', 'drag',                     'Drag', null, null, false, 70, null),
  ('clothing-gear', 'clothed-sex',              'Partially clothed sex', null, null, false, 80, null),

  -- Oral & hands (give_receive)
  ('oral-hands', 'hands-stroking-fingering',    'Hands (stroking & fingering)', null, null, false, 10, null),
  ('oral-hands', 'oral-sex',                    'Oral sex', null, null, false, 20, 'intimate-oral'),
  ('oral-hands', 'deep-throating',              'Deep throating', 'Gag reflex and breathing limits differ — agree on signals first.', null, true, 30, null),
  ('oral-hands', 'face-sitting',                'Face-sitting', null, null, false, 40, null),
  ('oral-hands', 'sixty-nine',                  '69', null, 'general', false, 50, null),

  -- Penetrative play (give_receive)
  ('penetration', 'frontal-vaginal-sex',        'Vaginal / frontal sex', null, null, false, 10, null),
  ('penetration', 'strap-on',                   'Strap-on play', null, null, false, 20, null),
  ('penetration', 'mutual-masturbation',        'Mutual masturbation', null, 'general', false, 30, null),
  ('penetration', 'outercourse-grinding',       'Grinding & outercourse', null, 'general', false, 40, null),
  ('penetration', 'frontal-fisting',            'Frontal fisting', 'High-intensity play — go slow, use plenty of lube, agree on signals.', null, true, 50, null),

  -- Anal play (give_receive)
  ('anal-play', 'anal-fingering',               'Anal fingering', null, null, false, 10, null),
  ('anal-play', 'anal-sex-pegging',             'Anal sex / pegging', null, null, false, 20, 'intimate-anal'),
  ('anal-play', 'rimming',                      'Rimming', null, null, false, 30, 'intimate-rimming'),
  ('anal-play', 'anal-toys',                    'Anal toys', null, null, false, 40, null),
  ('anal-play', 'double-penetration',           'Double penetration', null, null, true, 50, null),
  ('anal-play', 'anal-fisting',                 'Anal fisting', 'High-intensity play — go slow, use plenty of lube, agree on signals.', null, true, 60, 'intimate-fisting'),

  -- Bondage & restraints (give_receive)
  ('bondage-restraints', 'cuffs',               'Cuffs', null, null, false, 10, null),
  ('bondage-restraints', 'light-bondage',       'Light bondage', null, null, false, 20, 'intimate-bondage'),
  ('bondage-restraints', 'rope-shibari',        'Rope bondage / shibari', null, null, false, 30, null),
  ('bondage-restraints', 'blindfolds',          'Blindfolds', null, null, false, 40, null),
  ('bondage-restraints', 'gags',                'Gags', 'Blocks verbal safewords — agree on a non-verbal signal first.', null, true, 50, null),
  ('bondage-restraints', 'collars',             'Collars', null, null, false, 60, null),
  ('bondage-restraints', 'leashes',             'Leashes', null, null, false, 70, null),
  ('bondage-restraints', 'chastity',            'Chastity', null, 'self_partner', false, 80, null),
  ('bondage-restraints', 'mummification',       'Encasement & mummification', 'Restricts movement and sometimes breathing — plan release and signals.', null, true, 90, null),
  ('bondage-restraints', 'suspension',          'Suspension', 'Advanced rope skill required — real injury risk without training.', null, true, 100, null),

  -- Impact play (give_receive)
  ('impact-play', 'spanking',                   'Spanking', null, null, false, 10, 'intimate-spanking'),
  ('impact-play', 'paddling',                   'Paddling', null, null, false, 20, null),
  ('impact-play', 'flogging',                   'Flogging', null, null, false, 30, null),
  ('impact-play', 'riding-crops',               'Riding crops', null, null, false, 40, null),
  ('impact-play', 'caning',                     'Caning', 'Marks and intensity vary a lot — agree on limits first.', null, true, 50, null),
  ('impact-play', 'whipping',                   'Whipping', 'High skill and intensity — agree on limits first.', null, true, 60, null),
  ('impact-play', 'face-slapping',              'Face slapping', null, null, true, 70, null),

  -- Pain & intensity (give_receive)
  ('pain-intensity', 'light-pain',              'Light pain', null, null, false, 10, null),
  ('pain-intensity', 'rough-sex',               'Rough sex', null, null, false, 20, 'intimate-rough'),
  ('pain-intensity', 'nipple-clamps',           'Nipple clamps', null, null, false, 30, null),
  ('pain-intensity', 'clothespins',             'Clothespins', null, null, false, 40, null),
  ('pain-intensity', 'wax-play',                'Wax play', null, null, false, 50, null),
  ('pain-intensity', 'scratching',              'Scratching', null, null, false, 60, null),
  ('pain-intensity', 'biting',                  'Biting', null, null, false, 70, null),
  ('pain-intensity', 'intense-pain',            'Intense pain', 'Know each other''s limits and signals before going here.', null, true, 80, null),
  ('pain-intensity', 'genitorture',             'Genital torture (CBT / CPT)', null, null, true, 90, null),
  ('pain-intensity', 'electro-stimulation',     'Electro-stimulation', 'Use body-safe devices only; never above the waist.', null, true, 100, null),
  ('pain-intensity', 'breath-play',             'Breath play', 'Genuinely dangerous — many practitioners rule it out entirely. Talk in depth first.', null, true, 110, null),
  ('pain-intensity', 'needle-play',             'Needle play', 'Sterile technique required — real health risk without training.', null, true, 120, null),

  -- Sensation & tease (give_receive)
  ('sensation-tease', 'tickling',               'Tickling', null, null, false, 10, 'intimate-tickling'),
  ('sensation-tease', 'sensation-play',         'Sensation play (soft & sharp)', null, null, false, 20, 'intimate-sensual'),
  ('sensation-tease', 'temperature-play',       'Temperature play (ice & warmth)', null, null, false, 30, null),
  ('sensation-tease', 'body-worship',           'Body worship', null, null, false, 40, null),
  ('sensation-tease', 'foot-play',              'Foot play', null, null, false, 50, null),
  ('sensation-tease', 'armpit-play',            'Armpit play', null, null, false, 60, null),
  ('sensation-tease', 'sensory-deprivation',    'Sensory deprivation', 'Can be disorienting — agree on signals and check in.', null, true, 70, null),

  -- Power dynamics (dom_sub)
  ('power-dynamics', 'ds-play',                 'Dominant / submissive play', null, null, false, 10, null),
  ('power-dynamics', 'power-exchange-scenes',   'Power exchange (scenes)', null, null, false, 20, null),
  ('power-dynamics', 'rules-discipline',        'Rules & discipline', null, null, false, 30, null),
  ('power-dynamics', 'begging',                 'Begging', null, null, false, 40, null),
  ('power-dynamics', 'acts-of-service',         'Acts of service', null, null, false, 50, null),
  ('power-dynamics', 'pet-play',                'Pet play', null, null, false, 60, null),
  ('power-dynamics', 'primal-play',             'Primal play (chase & wrestle)', null, null, true, 70, null),
  ('power-dynamics', 'tpe-247',                 '24/7 dynamics', 'Ongoing power exchange outside scenes — needs deep, ongoing negotiation.', null, true, 80, null),

  -- Verbal play (give_receive)
  ('verbal-play', 'dirty-talk',                 'Dirty talk', null, null, false, 10, null),
  ('verbal-play', 'praise',                     'Praise', null, null, false, 20, null),
  ('verbal-play', 'sexting',                    'Sexting & phone sex', null, 'general', false, 30, null),
  ('verbal-play', 'degradation',                'Degradation & humiliation', 'Words land differently for everyone — agree on themes that are off-limits.', null, true, 40, null),
  ('verbal-play', 'name-calling',               'Name calling', 'Agree beforehand which words are hot and which are off-limits.', null, true, 50, null),

  -- Watching & being watched (self_partner)
  ('voyeur-exhib', 'being-watched',             'Being watched (consenting audience)', null, null, false, 10, null),
  ('voyeur-exhib', 'watching-others',           'Watching others (with consent)', null, null, false, 20, null),
  ('voyeur-exhib', 'mirror-play',               'Mirror play', null, null, false, 30, null),
  ('voyeur-exhib', 'filming-private',           'Filming ourselves (private)', 'Agree on storage, access and deletion before recording anything.', null, true, 40, null),
  ('voyeur-exhib', 'naturism',                  'Nude beaches & naturism', null, null, false, 50, null),
  ('voyeur-exhib', 'public-teasing',            'Discreet teasing in appropriate venues', null, null, true, 60, 'intimate-public'),

  -- Group & social (general)
  ('group-social', 'threesomes',                'Threesomes', null, null, false, 10, null),
  ('group-social', 'group-sex',                 'Group sex', null, null, false, 20, 'intimate-group'),
  ('group-social', 'partner-swapping',          'Partner swapping', null, null, false, 30, null),
  ('group-social', 'cuckolding-compersion',     'Cuckolding & compersion play', null, null, false, 40, null),
  ('group-social', 'play-parties',              'Play parties & clubs', null, null, false, 50, null),
  ('group-social', 'darkrooms',                 'Darkrooms', null, null, false, 60, null),
  ('group-social', 'cruising',                  'Cruising', null, null, false, 70, null),
  ('group-social', 'saunas-bathhouses',         'Saunas & bathhouses', null, null, false, 80, null),
  ('group-social', 'gangbang',                  'Gangbangs', null, null, true, 90, null),
  ('group-social', 'glory-hole',                'Glory holes', null, null, true, 100, null),

  -- Fluids & mess (general)
  ('fluids-mess', 'cum-play',                   'Cum play', null, null, false, 10, null),
  ('fluids-mess', 'facials',                    'Facials', null, 'give_receive', false, 20, null),
  ('fluids-mess', 'swallowing',                 'Swallowing', null, 'give_receive', false, 30, null),
  ('fluids-mess', 'squirting',                  'Squirting', null, null, false, 40, null),
  ('fluids-mess', 'spit-play',                  'Spit play', null, 'give_receive', false, 50, null),
  ('fluids-mess', 'watersports',                'Watersports', null, 'give_receive', true, 60, null),
  ('fluids-mess', 'lactation',                  'Lactation play', null, null, true, 70, null),
  ('fluids-mess', 'sploshing',                  'Food & messy play (sploshing)', null, null, false, 80, null),

  -- Toys & tech (give_receive)
  ('toys-tech', 'dildos',                       'Dildos', null, 'self_partner', false, 10, 'intimate-toys'),
  ('toys-tech', 'vibrators',                    'Vibrators', null, 'self_partner', false, 20, null),
  ('toys-tech', 'butt-plugs',                   'Butt plugs', null, 'self_partner', false, 30, null),
  ('toys-tech', 'sleeves-strokers',             'Sleeves & strokers', null, 'self_partner', false, 40, null),
  ('toys-tech', 'machines',                     'Machines', null, 'self_partner', false, 50, null),
  ('toys-tech', 'remote-toys',                  'Remote-controlled toys', null, null, false, 60, null),
  ('toys-tech', 'cam-remote-play',              'Cam & remote play', null, 'general', false, 70, null),
  ('toys-tech', 'sounding',                     'Sounding', 'Sterile technique required — real injury risk without care.', null, true, 80, null),

  -- Orgasm control (give_receive)
  ('orgasm-control', 'edging',                  'Edging', null, null, false, 10, 'intimate-edging'),
  ('orgasm-control', 'orgasm-denial',           'Orgasm denial', null, null, false, 20, null),
  ('orgasm-control', 'controlled-orgasms',      'Controlled orgasms', null, null, true, 30, null),
  ('orgasm-control', 'ruined-orgasms',          'Ruined orgasms', null, null, false, 40, null),
  ('orgasm-control', 'instruction-joi',         'Instruction (JOI)', null, null, false, 50, null),

  -- Roleplay & fantasy (general)
  ('roleplay-fantasy', 'roleplay-scenarios',    'Roleplay (scenarios & characters)', null, null, false, 10, 'intimate-roleplay'),
  ('roleplay-fantasy', 'strangers-roleplay',    'Strangers-meeting roleplay', null, null, false, 20, null),
  ('roleplay-fantasy', 'gender-play',           'Gender play', null, null, false, 30, null),
  ('roleplay-fantasy', 'fantasy-sharing',       'Sharing fantasies aloud', null, null, false, 40, null),
  ('roleplay-fantasy', 'medical-play',          'Medical play', null, null, true, 50, null),
  ('roleplay-fantasy', 'erotic-hypnosis',       'Erotic hypnosis', 'Altered-state play — discuss boundaries and grounding beforehand.', null, true, 60, null),
  ('roleplay-fantasy', 'cnc-roleplay',          'CNC — consensual non-consent roleplay', 'Pre-negotiated roleplay only: the scene is agreed in detail beforehand, consent stays active throughout, and any safeword ends it immediately.', null, true, 70, null),

  -- Materials & fetish gear (general)
  ('materials-fetish', 'leather',               'Leather', null, null, false, 10, 'intimate-leather'),
  ('materials-fetish', 'latex-rubber',          'Latex & rubber', null, null, false, 20, 'intimate-rubber'),
  ('materials-fetish', 'sportswear-gear',       'Sportswear & gear', null, null, false, 30, null),
  ('materials-fetish', 'harnesses',             'Harnesses', null, null, false, 40, null),
  ('materials-fetish', 'boots-footwear',        'Boots & footwear', null, null, false, 50, null),
  ('materials-fetish', 'pup-hoods',             'Pup hoods & gear', null, null, false, 60, null)
) as v(category_slug, slug, label, description, axis_override, discussion_recommended, sort_order, unified_tag_slug)
join cat c on c.slug = v.category_slug
on conflict (slug) do update set
  category_id = excluded.category_id,
  label = excluded.label,
  description = excluded.description,
  axis_override = excluded.axis_override,
  discussion_recommended = excluded.discussion_recommended,
  sort_order = excluded.sort_order,
  unified_tag_slug = excluded.unified_tag_slug,
  is_active = true,
  deprecated_at = null;

insert into public.kink_taxonomy_versions (version, notes)
values (1, 'Initial taxonomy: 19 categories, ~130 items. KinkList-derived, LGBTQ+-adapted, consent-forward.')
on conflict (version) do nothing;
