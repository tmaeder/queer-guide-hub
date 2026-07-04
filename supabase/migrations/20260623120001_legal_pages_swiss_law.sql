-- Re-ground the public legal pages in Swiss law.
--
-- The legal pages are CMS content rendered from cms_pages.body_html (base row;
-- see src/hooks/useCMSPage.ts). An audit found the /dmca page written entirely
-- on US law (DMCA), plus smaller Swiss-law gaps in Terms and Privacy. This
-- migration rewrites that content. The slug 'dmca' is kept so the /dmca route,
-- the Scale icon mapping, and the sitemap stay valid.
--
-- Every statement is idempotent (guarded on a recognizable old substring) so
-- re-running this migration is a no-op. The matching English rows in
-- cms_pages_translations are updated too: the app never reads them, but the CMS
-- admin editor does, so we keep them in sync to avoid showing stale US text.

-- ── 1. DMCA (US law) → Copyright Policy (Swiss URG/CopA) ─────────────────────
UPDATE cms_pages
SET
  title = 'Copyright Policy',
  subtitle = 'How to report copyright infringement, and how we respond',
  meta_title = 'Copyright Policy | Queer Guide',
  meta_description = 'How to report copyright infringement on Queer Guide, and how we respond, under Swiss law.',
  body_html = $HTML$
<h1>Copyright Policy</h1>
<p class="legal-intro">We respect copyright — ours and everyone else's. Here's how to flag content you own, and how we respond to a valid notice under Swiss law.</p>

<h2>1. Overview</h2>
<p>Queer Guide respects the intellectual property rights of others and expects our users to do the same. It is our policy to respond to clear, substantiated notices of alleged copyright infringement. This policy is based on the Swiss Federal Act on Copyright and Related Rights (Urheberrechtsgesetz, URG / CopA, SR 231.1).</p>

<h2>2. Reporting Infringing Content</h2>
<p>If you believe that content on Queer Guide infringes a copyright you hold, you can ask us to remove or disable it. To let us act quickly, your notice should include:</p>
<ul>
<li>Identification of the protected work you say has been infringed</li>
<li>Identification of the allegedly infringing material on Queer Guide, including the exact URL(s) where it appears</li>
<li>Your contact details (name, postal address, and email address)</li>
<li>A statement that you are the rightsholder or are authorised to act on their behalf</li>
<li>A statement, made in good faith, that the use of the material has not been authorised by the rightsholder, their agent, or the law</li>
<li>A confirmation that the information in your notice is accurate and truthful to the best of your knowledge</li>
</ul>
<p>You do not need to swear an oath or make any declaration "under penalty of perjury" — Swiss law requires only that your statements be truthful and made in good faith.</p>

<h2>3. Where to Send a Notice</h2>
<p>Send copyright notices to:</p>
<p><strong>Copyright Notices</strong><br>
Queer Guide<br>
Email: <a href="mailto:dmca@queer.guide">dmca@queer.guide</a><br>
Subject line: Copyright Takedown Notice</p>
<p>Email is the fastest route. Please include "Copyright Takedown Notice" in the subject line.</p>

<h2>4. How We Respond</h2>
<p>As a hosting provider, we do not pre-screen or monitor everything users post, and we are not obliged to do so. We act on specific, substantiated notices. When we receive a valid notice, we review it in good faith and, where the claim appears well-founded, we remove or disable access to the material and notify the user who posted it.</p>

<h2>5. Counter-Notice</h2>
<p>If your content was removed and you believe this was a mistake — for example because you hold the rights, have permission, or the use is permitted by law — you can send us a counter-notice. It should include:</p>
<ul>
<li>Identification of the material that was removed and the URL where it appeared</li>
<li>Your contact details (name, postal address, and email address)</li>
<li>A statement, made in good faith, that the material was removed as a result of a mistake or misidentification</li>
<li>A confirmation that the information in your counter-notice is accurate and truthful</li>
</ul>
<p>We will review counter-notices in good faith and may restore the material if the original complaint no longer appears justified. Where a genuine dispute remains between the parties, it is for the courts to decide; we are not in a position to adjudicate competing rights claims.</p>

<h2>6. Repeat Infringers</h2>
<p>We will, in appropriate circumstances, warn, suspend, or terminate the accounts of users who repeatedly post infringing content. We decide what counts as repeat infringement on a case-by-case basis.</p>

<h2>7. Response Time</h2>
<p>We aim to review and respond to valid copyright notices within 72 hours of receipt. Where the nature of the infringement calls for it, we may act sooner.</p>

<h2>8. Unjustified or Bad-Faith Notices</h2>
<p>Please only report content you genuinely believe infringes your rights. Submitting a knowingly false, abusive, or bad-faith notice — or wrongly demanding the removal of lawful content — can expose you to liability under Swiss law, including claims for damages by affected parties. We reserve the right to seek redress and to decline to act on notices that are clearly unfounded.</p>

<h2>9. User Responsibilities</h2>
<p>If you post content on Queer Guide, you are responsible for making sure you have the right to do so. This includes:</p>
<ul>
<li>Images, photos, and graphics</li>
<li>Text and written materials</li>
<li>Video and audio content</li>
<li>Logos and branding materials</li>
</ul>

<h2>10. Permitted Uses</h2>
<p>Swiss copyright law allows certain uses of protected works without the rightsholder's permission — for example quotation, or use for personal purposes. Whether a particular use is permitted depends on the circumstances, and we assess this case by case when reviewing a notice.</p>

<h2>11. Governing Law and Jurisdiction</h2>
<p>This policy is governed by Swiss law, in particular the Federal Act on Copyright and Related Rights (URG / CopA, SR 231.1). The place of jurisdiction for disputes arising from this policy is the registered seat of the operator in Switzerland, unless mandatory law provides otherwise.</p>

<h2>12. Questions</h2>
<p>If you have questions about this policy or about copyright on our platform, email us at <a href="mailto:legal@queer.guide">legal@queer.guide</a>.</p>

<h2>13. Updates</h2>
<p>We may update this policy from time to time. We'll post the new version here and flag any significant changes through the platform or by email to registered users.</p>
$HTML$,
  updated_at = now()
WHERE slug = 'dmca'
  AND body_html LIKE '%Digital Millennium Copyright Act%';

-- ── 2. Terms §10 — Swiss CO Art. 100 liability carve-out ─────────────────────
-- Art. 100(1) CO voids any advance exclusion of liability for unlawful intent
-- or gross negligence, so the blanket limitation needs a carve-out.
UPDATE cms_pages
SET
  body_html = replace(
    body_html,
    'arising from your use of, or inability to use, the Service.</p>',
    'arising from your use of, or inability to use, the Service. Nothing in these Terms limits or excludes our liability for unlawful intent or gross negligence, or any other liability that cannot be excluded under Swiss law.</p>'
  ),
  updated_at = now()
WHERE slug = 'terms'
  AND body_html LIKE '%inability to use, the Service.</p>%'
  AND body_html NOT LIKE '%unlawful intent or gross negligence%';

-- ── 3. Privacy §7 — add the Swiss FDPIC as a complaint authority ─────────────
UPDATE cms_pages
SET
  body_html = replace(
    body_html,
    '<li>Lodge a complaint with your local data protection authority</li>',
    '<li>Lodge a complaint with your local data protection authority, or in Switzerland with the Federal Data Protection and Information Commissioner (FDPIC)</li>'
  ),
  updated_at = now()
WHERE slug = 'privacy'
  AND body_html LIKE '%Lodge a complaint with your local data protection authority</li>%'
  AND body_html NOT LIKE '%Federal Data Protection and Information Commissioner%';

-- ── 4. Privacy §10 — align minimum age to 18 (matches the 18+ signup gate) ───
UPDATE cms_pages
SET
  body_html = replace(
    body_html,
    'Queer Guide is not intended for children under 16. We do not knowingly collect personal information from anyone under 16. If you believe a child has given us their information, contact us and we''ll remove it.',
    'Queer Guide is intended for adults: you must be at least 18 to create an account. We do not knowingly collect personal information from anyone under 18. If you believe a minor has given us their information, contact us and we''ll remove it.'
  ),
  updated_at = now()
WHERE slug = 'privacy'
  AND body_html LIKE '%not intended for children under 16%';

-- ── 5. Keep the English cms_pages_translations rows in sync ──────────────────
-- Not read by the app, but the CMS admin editor reads them. Same content,
-- same idempotent guards.

UPDATE cms_pages_translations t
SET
  title = 'Copyright Policy',
  body_html = (SELECT body_html FROM cms_pages WHERE slug = 'dmca'),
  updated_at = now()
FROM cms_pages p
WHERE t.page_id = p.id
  AND p.slug = 'dmca'
  AND t.locale = 'en'
  AND t.body_html LIKE '%Digital Millennium Copyright Act%';

UPDATE cms_pages_translations t
SET
  body_html = replace(
    t.body_html,
    'arising from your use of, or inability to use, the Service.</p>',
    'arising from your use of, or inability to use, the Service. Nothing in these Terms limits or excludes our liability for unlawful intent or gross negligence, or any other liability that cannot be excluded under Swiss law.</p>'
  ),
  updated_at = now()
FROM cms_pages p
WHERE t.page_id = p.id
  AND p.slug = 'terms'
  AND t.locale = 'en'
  AND t.body_html LIKE '%inability to use, the Service.</p>%'
  AND t.body_html NOT LIKE '%unlawful intent or gross negligence%';

UPDATE cms_pages_translations t
SET
  body_html = replace(
    t.body_html,
    '<li>Lodge a complaint with your local data protection authority</li>',
    '<li>Lodge a complaint with your local data protection authority, or in Switzerland with the Federal Data Protection and Information Commissioner (FDPIC)</li>'
  ),
  updated_at = now()
FROM cms_pages p
WHERE t.page_id = p.id
  AND p.slug = 'privacy'
  AND t.locale = 'en'
  AND t.body_html LIKE '%Lodge a complaint with your local data protection authority</li>%'
  AND t.body_html NOT LIKE '%Federal Data Protection and Information Commissioner%';

UPDATE cms_pages_translations t
SET
  body_html = replace(
    t.body_html,
    'Queer Guide is not intended for children under 16. We do not knowingly collect personal information from anyone under 16. If you believe a child has given us their information, contact us and we''ll remove it.',
    'Queer Guide is intended for adults: you must be at least 18 to create an account. We do not knowingly collect personal information from anyone under 18. If you believe a minor has given us their information, contact us and we''ll remove it.'
  ),
  updated_at = now()
FROM cms_pages p
WHERE t.page_id = p.id
  AND p.slug = 'privacy'
  AND t.locale = 'en'
  AND t.body_html LIKE '%not intended for children under 16%';
