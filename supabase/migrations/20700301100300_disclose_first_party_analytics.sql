-- Disclose the first-party analytics we keep ourselves.
--
-- The Privacy and Cookie policies list PROCESSORS — Supabase, Cloudflare,
-- Stripe, Sentry, Umami, Resend, OpenAI/Anthropic, Mapbox, affiliate partners.
-- They said nothing about the event tables we write into our own database,
-- which is the larger dataset by a wide margin. Measured 2026-09-12:
-- umami.website_event 3.07M rows, public.user_events 335,810 — and
-- user_events carries user_id + entity_type + entity_id, i.e. a per-person
-- trail through venues, events and the intimate features. On this platform
-- that trail is sensitive wherever it is stored.
--
-- "first-party" is not a synonym for "does not need disclosing". Nothing about
-- keeping data ourselves removes the obligation to say we keep it, how long,
-- and on what basis. The Cookie policy already promised analytics loads "only
-- with your consent"; as of this series that is true of every writer, so the
-- text can now state the scope honestly rather than only the vendor list.
--
-- Written as a guarded string insert rather than a rewrite (the
-- 20260624080000_legal_pages_code_reconcile.sql pattern): these pages are
-- CMS rows an editor can change, so this must not clobber their edits and must
-- be a no-op if it has already run.

do $$
declare
  v_anchor_cookies constant text :=
    '<p>We do not use advertising networks or data brokers.';
  -- The heading that follows the processor list, so the new section lands
  -- after that list and its data-transfer note rather than inside them.
  v_anchor_privacy constant text := '<h2 id="children">';
  v_marker constant text := 'id="first-party-analytics"';
  v_block_cookies constant text :=
'<h2 id="first-party-analytics">What we record ourselves</h2>
<p>Most of what we measure never leaves our own database. With your consent we record, first-party:</p>
<ul>
<li><strong>Page views</strong> — the page, the referring site, your browser, device type, language and country, tied to a visitor identifier that is a one-way hash rotated every day. We never store your IP address and we set no tracking cookie, so this cannot follow you from one day to the next.</li>
<li><strong>What you interact with</strong> — which places, events, cities and articles you open, save or click through to. This is what powers recommendations and the "trending" lists. If you are signed in it is linked to your account; if you are not, it is linked only to a temporary session identifier.</li>
<li><strong>Searches</strong> — the words you searched for, how many results came back and which one you opened, so we can see where the search is failing people.</li>
<li><strong>Sign-up steps</strong> — which step of the sign-up form was reached, with no account link, so we can find where the form is broken.</li>
</ul>
<p>We keep all of it for <strong>90 days</strong> and then delete it automatically. If you delete your account we erase the records tied to you straight away. Records that were never linked to an account — anything from a signed-out visit — cannot be traced back to you on request, so the 90-day deletion is what covers those.</p>
<p>If you do not consent to analytics, none of this is recorded at all. You can change your mind at any time from the cookie preferences link in the footer, and we also honour your browser''s Do Not Track setting even if you have consented.</p>
';
  v_block_privacy constant text :=
'<h2 id="first-party-analytics">Usage data we hold ourselves</h2>
<p>Beyond the providers above, we keep usage records in our own database (hosted in the EU). With your consent these cover page views (with a daily-rotating visitor hash, never your IP address, and no tracking cookie), the places and articles you open or save, your searches, and which step of the sign-up form was reached.</p>
<p>The interaction records are what make recommendations and "trending" work. Where you are signed in they are linked to your account; otherwise only to a temporary session identifier. We keep all of it for 90 days and delete it automatically, and we erase the records tied to your account if you delete it. Records that were never linked to an account cannot be identified as yours on request, so the 90-day deletion is what applies to those.</p>
<p>Without analytics consent none of this is recorded, and we honour your browser''s Do Not Track setting regardless of consent.</p>
';
  v_html text;
  v_updated int;
begin
  -- Cookies
  select body_html into v_html from public.cms_pages where slug = 'cookies';
  if v_html is null then
    raise exception 'cms_pages row for slug=cookies is missing';
  end if;
  if position(v_marker in v_html) = 0 then
    if position(v_anchor_cookies in v_html) = 0 then
      raise exception 'cookies policy anchor not found — the page was edited; insert the disclosure by hand rather than guessing a new anchor';
    end if;
    update public.cms_pages
       set body_html = replace(v_html, v_anchor_cookies, v_block_cookies || v_anchor_cookies),
           updated_at = now()
     where slug = 'cookies';
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'cookies policy update touched % rows', v_updated;
    end if;
  end if;

  -- Privacy
  select body_html into v_html from public.cms_pages where slug = 'privacy';
  if v_html is null then
    raise exception 'cms_pages row for slug=privacy is missing';
  end if;
  if position(v_marker in v_html) = 0 then
    if position(v_anchor_privacy in v_html) = 0 then
      raise exception 'privacy policy anchor not found — the page was edited; insert the disclosure by hand rather than guessing a new anchor';
    end if;
    update public.cms_pages
       set body_html = replace(v_html, v_anchor_privacy, v_block_privacy || E'\n' || v_anchor_privacy),
           updated_at = now()
     where slug = 'privacy';
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'privacy policy update touched % rows', v_updated;
    end if;
  end if;

  -- Postcondition: both pages now carry the section, and each carries it once.
  perform 1 from public.cms_pages
   where slug in ('cookies','privacy')
     and position(v_marker in body_html) > 0
  having count(*) = 2;
  if not found then
    raise exception 'the first-party analytics disclosure is missing from a policy page';
  end if;

  select count(*) into v_updated from public.cms_pages
   where slug in ('cookies','privacy')
     and (length(body_html) - length(replace(body_html, v_marker, ''))) / length(v_marker) > 1;
  if v_updated > 0 then
    raise exception 'the disclosure was inserted more than once on % page(s)', v_updated;
  end if;

  raise notice 'first-party analytics disclosed on the cookies and privacy pages';
end
$$;
