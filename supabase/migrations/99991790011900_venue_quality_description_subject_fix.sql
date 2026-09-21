-- PostgreSQL ARE does not interpret \b as a word boundary. Keep the
-- wrong-subject guard explicit so event/article/hotel copy cannot qualify a
-- venue for guide-ready publication.
create or replace function public.venue_description_issue(p_description text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $description$
  select case
    when nullif(btrim(regexp_replace(coalesce(p_description, ''), '<[^>]*>', ' ', 'g')), '') is null
      then 'missing'
    when lower(btrim(regexp_replace(p_description, '<[^>]*>', ' ', 'g'))) ~
      '^(tbd|todo|n/?a|unknown|coming soon|description unavailable|no description( available)?)\.?$'
      then 'placeholder'
    when lower(p_description) ~
      '(^|[[:space:]])(lorem ipsum|insert description|sample text|test venue)([[:space:]]|$)'
      then 'placeholder'
    when lower(p_description) ~
      '^(this|the) (event|article|news story|hotel|product|personality)([[:space:]]|$)'
      then 'wrong_subject'
    when length(btrim(regexp_replace(p_description, '<[^>]*>', ' ', 'g'))) < 40
      then 'too_short'
    else null
  end
$description$;

comment on function public.venue_description_issue(text) is
  'Rejects missing, placeholder, wrong-subject and very short venue descriptions before guide-ready scoring.';
