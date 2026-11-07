-- Classify only formats explicitly named by a captured publisher occurrence.
CREATE OR REPLACE FUNCTION api_private.source_explicit_event_format(p_title text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 with formats as (
  select 'drag' format where p_title ~* '\mdrag[ -]+(show|brunch|bingo|queen show|performance|cabaret)\M'
  union all select 'social' where p_title ~* '\m(game[ -]+night|support[ -]+group|discussion[ -]+group|book[ -]+club|coffee[ -]+and[ -]+conversation|karaoke[ -]+mixer|happy[ -]+hours?|music[ -]+bingo|trivia[ -]+night|friendsgiving[ -]+potluck|bar[ -]+crawl|book[ -]+swap|speed[ -]+date|member[ -]+mixer|networking[ -]+mixer|elder[ -]+breakfast|pancake[ -]+breakfast|halloween[ -]+queeraoke)\M'
  union all select 'sports' where p_title ~* '\m(pickleball|climb[ -]+night|climbing[ -]+night|run[ -]+walk[ -]+club|run[ -]+monday[ -]+run|run[ -]+thursday[ -]+morning[ -]+run|trans and nonbinary swim|basketball[ -]+open[ -]+gym|open[ -]+volleyball|tennis[ -]+clinic|walk/run|run/walk|rugby[ -]+practice|soccer[ -]+club|run[ -]+club|weekly[ -]+run|fun[ -]+run|rainbow[ -]+hike|mountain[ -]+hike|open[ -]+play[ -]+tennis|tennis[ -]+open[ -]+play|flag[ -]+football[ -]+games?|front[ -]+runners\M[^:;]*\mwalk[ -]+and[ -]+run)\M' or p_title ~* '^run[ -]+from[ -]+[[:alpha:] ]+[ -]+park$'
  union all select 'workshop' where p_title ~* '\m(painting[ -]+class|meditation[ -]+class|bead[ -]+making[ -]+class|boxing[ -]+class|coaching[ -]+class|class[ -]+series|self[ -]+defense[ -]+class|sewing[ -]+class|french[ -]+class|mindful[ -]+movement[ -]+class|drum[ -]+movement[ -]+class|bikepacking[ -]+101)\M'
  union all select 'art' where p_title ~* '\mart[ -]+(showcase|show)\M'
  union all select 'film' where p_title ~* '\m(film[ -]+screening|advance[ -]+screening|documentary[ -]+screening|on the big screen|halloween[ -]+double[ -]+feature|shorts[ -]+screening)\M'
  union all select 'party' where p_title ~* '\m(halloween[ -]+(costume[ -]+|blacklight[ -]+)?(bash|party|ball)|dance[ -]+party|costume[ -]+ball|birthday[ -]+bash|masquerade[ -]+ball|house[ -]+music[ -]+night|friday[ -]+night[ -]+rotating[ -]+djs)\M'
  union all select 'meetup' where p_title ~* '\m(families|family)[ -]+meet[ -]?up\M'
  union all select 'fundraiser' where p_title ~* '\m(fundraiser[ -]+dinner|fundraising[ -]+gala)\M'
  union all select 'theater' where p_title ~* '\mstaged[ -]+reading\M'
 ) select min(format) from formats
 having count(*)=1 and not (
  coalesce(bool_or(format='social'),false) and p_title ~* '\mhappy[ -]+hours?\M.*\mand\M'
 );
$function$;

-- The LGBT Network provides an original WordPress occurrence, including title,
-- date, and a stable publisher ID. Reuse the existing repair and audit path.
do $patch$
declare
 definition text:=regexp_replace(
  pg_get_functiondef('api_private.reconcile_source_event_formats(integer,boolean)'::regprocedure),
  $strip$('(?:[^']|'')*'|"(?:[^"]|"")*")|--[^$strip$||chr(10)||']*',
  $keep$\1$keep$,'g');
 sources_anchor text:=$anchor$s.source_slug in('qcal','ticketmaster')$anchor$;
 ticketmaster_anchor text:=$anchor$  or s.source_slug='ticketmaster'$anchor$;
 network_branch text:=$branch$  or s.source_slug='lgbtnetwork' and s.source_entity_id~'^[0-9]+$'
   and s.payload#>>'{normalized,metadata,source}'='lgbtnetwork'
   and s.payload#>>'{normalized,metadata,wp_id}'=s.source_entity_id
   and s.payload#>>'{raw,id}'=s.source_entity_id
   and s.payload#>>'{raw,slug}'~'^[a-z0-9-]+$'
   and s.source_url='https://lgbtnetwork.org/events/'||(s.payload#>>'{raw,slug}')||'/'
   and s.payload#>>'{raw,url}'=s.source_url and s.payload#>>'{normalized,metadata,url}'=s.source_url
   and s.payload#>>'{raw,title}'=e.title
   and case when pg_input_is_valid(s.payload#>>'{raw,start}','timestamptz')
    then (s.payload#>>'{raw,start}')::timestamptz=e.start_date else false end
   and not exists(select 1 from public.event_sources peer where peer.event_id=e.id and peer.id<>s.id)
$branch$;
begin
 if (length(definition)-length(replace(definition,sources_anchor,'')))/length(sources_anchor)<>1
  or (length(definition)-length(replace(definition,ticketmaster_anchor,'')))/length(ticketmaster_anchor)<>1 then
  raise exception 'Publisher format repair contract changed';
 end if;
 definition:=replace(definition,sources_anchor,$new$s.source_slug in('qcal','ticketmaster','lgbtnetwork')$new$);
 execute replace(definition,ticketmaster_anchor,network_branch||ticketmaster_anchor);
end $patch$;
