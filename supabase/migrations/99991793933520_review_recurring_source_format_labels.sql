-- Only explicit event formats in the captured publisher title are eligible.
-- Match each format once and keep titles that name conflicting formats in review.
create or replace function api_private.source_explicit_event_format(p_title text)
returns text language sql immutable set search_path='' as $fn$
 with formats as (
  select 'drag' format where p_title ~* '\mdrag[ -]+(show|brunch|bingo|queen show|performance|cabaret)\M'
  union all select 'social' where p_title ~* '\m(game[ -]+night|support[ -]+group|discussion[ -]+group|book[ -]+club|coffee[ -]+and[ -]+conversation|karaoke[ -]+mixer|happy[ -]+hours?|music[ -]+bingo|trivia[ -]+night|friendsgiving[ -]+potluck|bar[ -]+crawl|book[ -]+swap|speed[ -]+date|member[ -]+mixer|networking[ -]+mixer)\M'
  union all select 'sports' where p_title ~* '\m(pickleball|climb[ -]+night|climbing[ -]+night|run[ -]+walk[ -]+club|run[ -]+monday[ -]+run|run[ -]+thursday[ -]+morning[ -]+run|trans and nonbinary swim|basketball[ -]+open[ -]+gym|open[ -]+volleyball|tennis[ -]+clinic|walk/run|run/walk|rugby[ -]+practice|soccer[ -]+club|run[ -]+club|weekly[ -]+run|fun[ -]+run|rainbow[ -]+hike|flag[ -]+football[ -]+games?|front[ -]+runners\M[^:;]*\mwalk[ -]+and[ -]+run)\M'
  union all select 'workshop' where p_title ~* '\m(painting[ -]+class|meditation[ -]+class|bead[ -]+making[ -]+class|boxing[ -]+class|coaching[ -]+class|class[ -]+series|self[ -]+defense[ -]+class|sewing[ -]+class|french[ -]+class|mindful[ -]+movement[ -]+class|drum[ -]+movement[ -]+class)\M'
  union all select 'art' where p_title ~* '\mart[ -]+(showcase|show)\M'
  union all select 'film' where p_title ~* '\m(film[ -]+screening|advance[ -]+screening|documentary[ -]+screening|on the big screen|halloween[ -]+double[ -]+feature|shorts[ -]+screening)\M'
  union all select 'party' where p_title ~* '\m(halloween[ -]+(costume[ -]+|blacklight[ -]+)?(bash|party|ball)|dance[ -]+party|costume[ -]+ball|birthday[ -]+bash|house[ -]+music[ -]+night|friday[ -]+night[ -]+rotating[ -]+djs)\M'
  union all select 'theater' where p_title ~* '\mstaged[ -]+reading\M'
 ) select min(format) from formats
 having count(*)=1 and not (
  coalesce(bool_or(format='social'),false) and p_title ~* '\mhappy[ -]+hours?\M.*\mand\M'
 );
$fn$;
