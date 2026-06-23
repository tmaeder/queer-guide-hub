-- Reconcile the Privacy & Cookie policies with what the code actually does.
--
-- An audit of the codebase vs. the legal pages found the Privacy/Cookie policies
-- (a) listed only Supabase/Cloudflare/Stripe as processors while the app also
-- uses Sentry, Resend, OpenAI/Anthropic, Cloudflare Workers AI, Mapbox/Nominatim,
-- affiliate partners and GitHub; (b) claimed EU-only processing while several of
-- those egress to the US; and (c) never disclosed that the app collects GDPR
-- Art. 9 / nFADP special-category data (sexual orientation, gender identity,
-- health, dating/intimate-profile, immigration status). This migration closes
-- those disclosure gaps. Sentry is being consent-gated in the same change set, so
-- the optional-analytics copy is relabelled "analytics & diagnostics".
--
-- Targeted, idempotent replace()s keyed on the current text (disjoint from the
-- prior Swiss-law migration's §7/§10 edits). The English cms_pages_translations
-- rows are re-synced to the base afterwards (the app reads the base row; the CMS
-- admin editor reads translations).

-- ── Privacy: §2 special-category disclosure, §9 processors, §11 transfers ─────
UPDATE cms_pages
SET
  body_html = replace(
    replace(
      replace(
        body_html,
        '<p>You can browse most of Queer Guide without an account, and without giving us any of this.</p>',
        '<p>You can browse most of Queer Guide without an account, and without giving us any of this.</p>

<h3>Sensitive information you choose to share</h3>
<p>Some features — your identity profile and your dating and community profiles — let you optionally add information that data-protection law treats as sensitive ("special-category" data): your sexual orientation, gender identity, pronouns, relationship details, health or accessibility needs, and the free text of your intimate profile. Providing any of this is entirely optional. We process it only with your <strong>explicit consent</strong> (GDPR Art. 9(2)(a) and the Swiss nFADP), you control who can see each field, we never sell it, and you can edit or delete it at any time. Sensitive free text in your intimate profile is encrypted at rest.</p>'
      ),
      '<p>We keep third parties to a minimum and use only trusted providers needed to run the service — such as Supabase (database and authentication, hosted in the EU), Cloudflare (content delivery and security), and Stripe (donations). We don''t share your data with advertisers. Pages we link to elsewhere on the web are not covered by this policy.</p>',
      '<p>We keep third parties to a minimum and use only trusted providers needed to run the service. Our main processors are:</p>
<ul>
<li><strong>Supabase</strong> — database and authentication, hosted in the EU</li>
<li><strong>Cloudflare</strong> — content delivery, security, and some AI features (global network)</li>
<li><strong>Stripe</strong> — donation and payment processing</li>
<li><strong>Sentry</strong> — error diagnostics, loaded only with your consent, with personal identifiers stripped before sending</li>
<li><strong>Resend</strong> — sending transactional email</li>
<li><strong>OpenAI and Anthropic</strong> — optional AI features such as summaries and tagging</li>
<li><strong>Mapbox and OpenStreetMap (Nominatim)</strong> — maps and geocoding</li>
<li><strong>Umami</strong> — privacy-friendly, first-party usage analytics, loaded only with your consent</li>
<li><strong>Affiliate booking partners</strong> — when you click an outbound booking or shopping link, that partner may set its own cookies under its own policy</li>
<li><strong>GitHub</strong> — routing of feedback and bug reports</li>
</ul>
<p>We have data-processing agreements with these providers, and where data is transferred outside Switzerland or the EU we rely on the EU Standard Contractual Clauses and the Swiss–US Data Privacy Framework. We don''t share your data with advertisers, and pages we link to elsewhere on the web are not covered by this policy.</p>'
    ),
    '<p>Your data is processed and stored on servers in the European Union (Supabase, eu-central region). If you use Queer Guide from outside the EU, your information is transferred to and handled in the EU under GDPR-level protection.</p>',
    '<p>Your account data is primarily stored in the European Union (Supabase, eu-central region). Some of the processors listed above operate in the United States or on global infrastructure, so limited data may be processed outside Switzerland and the EU. Where that happens, we rely on safeguards such as the EU Standard Contractual Clauses and the Swiss–US Data Privacy Framework to keep your data protected to Swiss and EU standards.</p>'
  ),
  updated_at = now()
WHERE slug = 'privacy'
  AND body_html NOT LIKE '%Sensitive information you choose to share%';

-- ── Cookies: §2 relabel, §3 heading + summary, §4 processor list ─────────────
UPDATE cms_pages
SET
  body_html = replace(
    replace(
      replace(
        replace(
          body_html,
          '<li><strong>Optional analytics cookies:</strong> set only if you allow them, to measure basic, anonymous usage so we can improve</li>',
          '<li><strong>Optional analytics &amp; diagnostics cookies:</strong> set only if you allow them, to measure basic, anonymous usage and to capture error diagnostics so we can fix problems</li>'
        ),
        '<h3>Optional Analytics Cookies</h3>',
        '<h3>Optional Analytics &amp; Diagnostics Cookies</h3>'
      ),
      '<p>This data is anonymous and first-party. It is never used for advertising or sold to anyone.</p>',
      '<p>Usage analytics are first-party and anonymous; error diagnostics are handled by Sentry with personal identifiers stripped. Neither is ever used for advertising or sold to anyone.</p>'
    ),
    '<p>A few trusted providers set cookies strictly to run the service:</p>
<ul>
<li><strong>Supabase:</strong> authentication and database (hosted in the EU)</li>
<li><strong>Cloudflare:</strong> content delivery and security</li>
<li><strong>Stripe:</strong> only on donation pages, to process payments securely</li>
</ul>
<p>We do not use advertising networks or data brokers.</p>',
    '<p>A few trusted providers help us run the service. Some are essential; the analytics and diagnostics providers load only with your consent:</p>
<ul>
<li><strong>Supabase:</strong> authentication and database (hosted in the EU)</li>
<li><strong>Cloudflare:</strong> content delivery, security, and some AI features</li>
<li><strong>Stripe:</strong> only on donation pages, to process payments securely</li>
<li><strong>Sentry:</strong> error diagnostics, loaded only with your consent</li>
<li><strong>Umami:</strong> privacy-friendly, first-party analytics, loaded only with your consent</li>
<li><strong>Resend:</strong> sending transactional email</li>
<li><strong>OpenAI and Anthropic:</strong> optional AI features</li>
<li><strong>Mapbox and OpenStreetMap:</strong> maps and geocoding</li>
<li><strong>Affiliate booking partners:</strong> may set their own cookies when you click an outbound link</li>
</ul>
<p>We do not use advertising networks or data brokers. For more on how we handle your data and on international transfers, see our <a href="/privacy">Privacy Policy</a>.</p>'
  ),
  updated_at = now()
WHERE slug = 'cookies'
  AND body_html NOT LIKE '%Diagnostics%';

-- ── Re-sync the English translation rows to the base (app reads base) ─────────
UPDATE cms_pages_translations t
SET body_html = (SELECT body_html FROM cms_pages WHERE slug = 'privacy'),
    updated_at = now()
FROM cms_pages p
WHERE t.page_id = p.id AND p.slug = 'privacy' AND t.locale = 'en'
  AND t.body_html NOT LIKE '%Sensitive information you choose to share%';

UPDATE cms_pages_translations t
SET body_html = (SELECT body_html FROM cms_pages WHERE slug = 'cookies'),
    updated_at = now()
FROM cms_pages p
WHERE t.page_id = p.id AND p.slug = 'cookies' AND t.locale = 'en'
  AND t.body_html NOT LIKE '%Diagnostics%';
