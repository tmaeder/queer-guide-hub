-- Seed baseline intimate_kink vocabulary into unified_tags.
-- v1 list, conservative. Extend via admin UI later.

insert into public.unified_tags (name, slug, category, is_sensitive, sensitive_topics, verification_status)
values
  ('Oral',         'intimate-oral',         'intimate_kink', true, array['adult'], 'reviewed'),
  ('Anal',         'intimate-anal',         'intimate_kink', true, array['adult'], 'reviewed'),
  ('Kissing',      'intimate-kissing',      'intimate_kink', true, array['adult'], 'reviewed'),
  ('Fisting',      'intimate-fisting',      'intimate_kink', true, array['adult'], 'reviewed'),
  ('Rimming',      'intimate-rimming',      'intimate_kink', true, array['adult'], 'reviewed'),
  ('Toys',         'intimate-toys',         'intimate_kink', true, array['adult'], 'reviewed'),
  ('Roleplay',     'intimate-roleplay',     'intimate_kink', true, array['adult'], 'reviewed'),
  ('Public',       'intimate-public',       'intimate_kink', true, array['adult'], 'reviewed'),
  ('Group',        'intimate-group',        'intimate_kink', true, array['adult'], 'reviewed'),
  ('Cuddling',     'intimate-cuddling',     'intimate_kink', true, array['adult'], 'reviewed'),
  ('Massage',      'intimate-massage',      'intimate_kink', true, array['adult'], 'reviewed'),
  ('Sensual',      'intimate-sensual',      'intimate_kink', true, array['adult'], 'reviewed'),
  ('Rough',        'intimate-rough',        'intimate_kink', true, array['adult'], 'reviewed'),
  ('Bondage',      'intimate-bondage',      'intimate_kink', true, array['adult'], 'reviewed'),
  ('Spanking',     'intimate-spanking',     'intimate_kink', true, array['adult'], 'reviewed'),
  ('Leather',      'intimate-leather',      'intimate_kink', true, array['adult'], 'reviewed'),
  ('Rubber',       'intimate-rubber',       'intimate_kink', true, array['adult'], 'reviewed'),
  ('Edging',       'intimate-edging',       'intimate_kink', true, array['adult'], 'reviewed'),
  ('Tantra',       'intimate-tantra',       'intimate_kink', true, array['adult'], 'reviewed'),
  ('Tickling',     'intimate-tickling',     'intimate_kink', true, array['adult'], 'reviewed')
on conflict (slug) do update
  set category = excluded.category,
      is_sensitive = excluded.is_sensitive,
      sensitive_topics = excluded.sensitive_topics;
