-- Policy pages: normalise heading structure. STRUCTURAL ONLY.
--
-- Not one byte of legal prose changes here. The transform rewrites heading
-- TAGS and nothing else, and the assertion at the bottom proves it: the
-- document with every <h2>/<h3> element deleted must be byte-identical before
-- and after.
--
-- Two things are fixed:
--
-- 1. Hand-typed section numbers ("1. Overview") come out of the heading text.
--    The layout numbers stations itself from a CSS counter
--    (`.qg-cms-body--legal h2::before`), so a typed number rendered as
--    "① 1. Overview". The frontend also strips these at runtime
--    (`stripTypedNumber` in CMSRoutePage.tsx) — belt and braces, so an editor
--    typing "1." back into the CMS cannot reintroduce the double number.
--
-- 2. Every <h2> and <h3> gets a stable id. Before this, terms and privacy had
--    ids on some headings and cookies and dmca had none at all, so roughly
--    half of the corpus could not be linked to. You could send someone "the
--    privacy page, scroll down", never "the data-deletion clause". An
--    author-set id is always preserved — /legal's "Common requests" block and
--    any link already in the wild depend on `your-rights` and
--    `account-termination` keeping their names.
--
-- `updated_at` is deliberately restored. It is rendered to the reader as
-- "Last updated", and a structural edit must not announce a policy change that
-- did not happen. (cms_pages has no touch trigger today, so this is belt and
-- braces against one being added later.)
--
-- The per-section "In short" summaries and the four missing Terms clauses are
-- NOT here. They are new prose and ship separately, after sign-off.

-- One-shot tool: created, used, and dropped inside this migration so it never
-- becomes a grantable surface. (Default privileges in this project arm new
-- functions for the API roles — see the anon-write-grants incident.)
create function public._legal_normalize_headings(p_html text)
returns text
language plpgsql
immutable
as $fn$
declare
  v_out text := '';
  v_rest text := coalesce(p_html, '');
  v_open int; v_gt int; v_close int;
  v_level text; v_attrs text; v_inner text; v_text text;
  v_slug text; v_base text; v_n int;
  v_seen text[] := '{}';
  v_existing text;
begin
  loop
    -- Next heading start, whichever of h2/h3 comes first.
    v_open := least(
      coalesce(nullif(position('<h2' in v_rest), 0), 2147483647),
      coalesce(nullif(position('<h3' in v_rest), 0), 2147483647));
    exit when v_open = 2147483647;

    v_level := substr(v_rest, v_open + 1, 2);          -- 'h2' | 'h3'
    v_out   := v_out || substr(v_rest, 1, v_open - 1); -- everything before it, untouched
    v_rest  := substr(v_rest, v_open);                 -- now starts at '<hN'

    v_gt := position('>' in v_rest);
    exit when v_gt = 0;
    v_attrs := substr(v_rest, 4, v_gt - 4);            -- between '<hN' and '>'

    v_close := position('</' || v_level || '>' in v_rest);
    exit when v_close = 0;
    v_inner := substr(v_rest, v_gt + 1, v_close - v_gt - 1);

    -- Visible text, for the slug only: strip inline markup, then entities.
    -- Entities matter — "Optional Analytics &amp; Diagnostics Cookies" must
    -- slug the same way here as `textContent` does in the browser, or the DB
    -- id and the frontend fallback would disagree.
    v_text := btrim(regexp_replace(
                regexp_replace(v_inner, '<[^>]*>', '', 'g'),
                '&[a-z]+;|&#[0-9]+;', ' ', 'gi'));
    v_text := regexp_replace(v_text, '^\s*[0-9]{1,2}\.\s+', '');

    -- An author-set id always wins: existing links depend on those names.
    v_existing := (regexp_match(v_attrs, 'id="([^"]+)"'))[1];
    if v_existing is not null then
      v_slug := v_existing;
    else
      v_base := btrim(regexp_replace(lower(v_text), '[^a-z0-9]+', '-', 'g'), '-');
      v_slug := v_base;
      v_n := 2;
      -- Two sections may legitimately share a title. Ids may not.
      while v_slug = any(v_seen) loop
        v_slug := v_base || '-' || v_n;
        v_n := v_n + 1;
      end loop;
    end if;
    v_seen := v_seen || v_slug;

    v_out := v_out
          || '<' || v_level || ' id="' || v_slug || '">'
          || regexp_replace(v_inner, '^\s*[0-9]{1,2}\.\s+', '')
          || '</' || v_level || '>';

    v_rest := substr(v_rest, v_close + 5);             -- past '</hN>'
  end loop;

  return v_out || v_rest;
end
$fn$;

do $$
declare
  r record;
  v_new text;
  v_strip constant text := '<h[23][^>]*>.*?</h[23]>';
begin
  for r in
    select id, slug, body_html, updated_at
    from public.cms_pages
    where parent_slug = 'legal' and body_html is not null
  loop
    v_new := public._legal_normalize_headings(r.body_html);

    -- The guarantee, enforced rather than asserted in a comment: with every
    -- heading element removed, the document must be unchanged. If this ever
    -- fails the migration aborts and no policy is touched.
    if regexp_replace(r.body_html, v_strip, '', 'gis')
       is distinct from regexp_replace(v_new, v_strip, '', 'gis') then
      raise exception
        'legal heading normalisation altered non-heading content on "%" — aborting', r.slug;
    end if;

    if v_new is distinct from r.body_html then
      update public.cms_pages
         set body_html = v_new,
             -- Restore it: this edit changed no terms, so it must not claim to.
             updated_at = r.updated_at
       where id = r.id;
      raise notice 'legal: normalised headings on %', r.slug;
    end if;
  end loop;
end
$$;

drop function public._legal_normalize_headings(text);
