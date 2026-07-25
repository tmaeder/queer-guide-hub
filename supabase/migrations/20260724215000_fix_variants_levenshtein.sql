-- fuzzystrmatch (levenshtein) lives in the `extensions` schema. tag_slugs_are_variants had a
-- bare levenshtein() call that resolved only when the caller's search_path included extensions,
-- so it failed inside functions with `set search_path = public` (e.g. refresh_tag_merge_candidates).
-- Schema-qualify so it resolves regardless of caller search_path.
create or replace function public.tag_slugs_are_variants(a text, b text)
returns boolean language sql immutable as $$
  select case
    when a is null or b is null then false
    when a = b then true
    when position(a in b) > 0 or position(b in a) > 0 then true
    when rtrim(a,'s') = rtrim(b,'s') then true
    when extensions.levenshtein(a, b) <= 2 then true
    else false
  end;
$$;
