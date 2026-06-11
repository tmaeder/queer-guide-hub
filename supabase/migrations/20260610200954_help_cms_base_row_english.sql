-- P0-2 follow-up: the cms_pages base row for /help was seeded in German
-- (20260411120000_seed_help_hotlines), so every locale rendered a German
-- h1/subtitle/intro on the crisis page. A de translation row already exists
-- in cms_pages_translations with identical content, so the base row can be
-- the canonical English without losing German. English strings below are the
-- already-approved ones from src/i18n/locales/en.json (help.*) and the
-- English paragraph that has been part of the seeded body_html all along.
-- Idempotent: only touches the row while the title is still German.
UPDATE cms_pages
SET
  title = 'Help & Crisis Hotlines',
  subtitle = 'You are not alone. Find immediate support here.',
  excerpt = 'Free, anonymous LGBTQIA+ crisis hotlines and counselling services worldwide. You are not alone.',
  body_html = $HTML$
<p><strong>In acute danger, call your local emergency number immediately: 112 (EU) or 911 (US/CA).</strong></p>
<p>Queer Guide does not replace professional help. The hotlines below offer free, anonymous, and confidential support — either LGBTQIA+ specific or general crisis counselling. You are not alone.</p>
  $HTML$,
  meta_title = 'Help & Crisis Hotlines | Queer Guide',
  meta_description = 'Free, anonymous LGBTQIA+ crisis hotlines and counselling services worldwide. You are not alone.',
  updated_at = now()
WHERE slug = 'help'
  AND title = 'Hilfe & Krisen-Hotlines';
