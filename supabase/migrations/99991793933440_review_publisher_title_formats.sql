-- Only explicit event formats in the captured publisher title are eligible.
-- Match each format once and keep titles that name conflicting formats in review.
create or replace function api_private.source_explicit_event_format(p_title text)
returns text language sql immutable set search_path='' as $fn$
 with formats as (
  select 'drag' format where p_title ~* '\mdrag[ -]+(show|brunch|bingo|queen show|performance|cabaret)\M'
  union all select 'social' where p_title ~* '\m(game[ -]+night|support[ -]+group|discussion[ -]+group|book[ -]+club|coffee[ -]+and[ -]+conversation|karaoke[ -]+mixer)\M'
  union all select 'sports' where p_title ~* '\m(pickleball|climb[ -]+night|climbing[ -]+night|run[ -]+walk[ -]+club|run[ -]+monday[ -]+run|run[ -]+thursday[ -]+morning[ -]+run|trans and nonbinary swim|basketball[ -]+open[ -]+gym|open[ -]+volleyball|tennis[ -]+clinic|walk/run|run/walk)\M'
  union all select 'workshop' where p_title ~* '\m(painting[ -]+class|meditation[ -]+class|bead[ -]+making[ -]+class|boxing[ -]+class|coaching[ -]+class|class[ -]+series)\M'
  union all select 'art' where p_title ~* '\mart[ -]+(showcase|show)\M'
  union all select 'film' where p_title ~* '\m(film[ -]+screening|advance[ -]+screening|documentary[ -]+screening|on the big screen)\M'
 ) select min(format) from formats having count(*)=1;
$fn$;
