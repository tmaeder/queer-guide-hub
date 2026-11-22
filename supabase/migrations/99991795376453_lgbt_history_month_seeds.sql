-- UK LGBT+ History Month (February 2027): organiser pages for source-observance-events.
--
-- Measured 2026-11-22: lgbt-history-month had 0 upcoming linked events and 0 events
-- in February 2027 that name the month. Nothing was stuck in ingestion_staging.
--
-- No organiser-level feed exists. lgbtplushistorymonth.co.uk (Schools OUT) is a
-- WordPress site with no event post type, no events REST route and no Event
-- JSON-LD; its 2027 page only links the (past) 14 Nov theme launch. So this is
-- the Phase 3 seed-page fallback (99991795363532).
--
-- Each URL below was found in Eventbrite's UK February-2027 listings or a venue
-- page, read by hand (the page itself names LGBT/LGBTQ+/LGBTQIA+ History Month),
-- and probed with source-observance-events {dry_run, urls}: every one returns one
-- schema.org Event with a start date in February 2027 and a UK city.
-- Rejected on reading: ~160 other February queer events on Eventbrite that do not
-- mention the month (socials, drag nights, walking tours); Royal Museums Greenwich
-- (programme not yet published, no Event JSON-LD).
--
-- Five titles name the month and will auto-link; three name it only in the
-- description (Pontypridd, Ipswich, Brixton) and go to the observance-review queue.
-- The daily 01:20 run picks these up once February is inside its 60-day horizon
-- (~2 Dec); more organisers publish in December/January, so add seeds then.

insert into public.observance_event_seeds (url, observance_id, note)
select v.url, o.id, v.note
from public.observances o
cross join (values
  ('https://www.eventbrite.co.uk/e/lgbtq-history-month-2027-tickets-2005076521852', 'Hounslow, 4 Feb (London Borough of Hounslow)'),
  ('https://www.eventbrite.com/e/2027-lgbt-history-month-lecture-university-of-oxford-tickets-2004379530131', 'Oxford, 10 Feb'),
  ('https://brightondome.org/whats-on/LGz-status-flo-lgbt-history-month/', 'Brighton, 8 Feb (Brighton Dome)'),
  ('https://www.eventbrite.co.uk/e/ual-lgbtq-history-month-wimbledon-life-drawing-workshop-tickets-2003429095355', 'London, 24 Feb (UAL)'),
  ('https://www.eventbrite.co.uk/e/ual-lgbtq-history-month-2b-or-not-2b-collective-life-drawing-workshop-tickets-2001354554347', 'London, 24 Feb (UAL)'),
  ('https://www.eventbrite.com/e/rainbow-realness-burlesque-cabaret-2027-tickets-2003851261064', 'Pontypridd, 27 Feb; description-only'),
  ('https://www.eventbrite.co.uk/e/queer-health-matters-2027-tickets-1986551375641', 'Ipswich, 27 Feb (Suffolk Pride); description-only'),
  ('https://www.eventbrite.co.uk/e/love-stories-of-brixton-walking-tour-tickets-2005078592044', 'London, 14 Feb; description-only')
) as v(url, note)
where o.slug = 'lgbt-history-month'
on conflict (url) do nothing;

do $verify$
declare v int;
begin
  select count(*) into v from public.observance_event_seeds s
    join public.observances o on o.id = s.observance_id where o.slug = 'lgbt-history-month';
  if v < 8 then raise exception 'observance_event_seeds: expected >= 8 lgbt-history-month seeds, got %', v; end if;

  -- The five titles must hit the name signal the linker uses.
  select count(*) into v from public.observances o,
    (values ('LGBTQ+ History Month 2027'), ('2027 LGBT+ History Month Lecture, University of Oxford'),
            ('STATUS FLO: LGBT+ History Month'), ('UAL LGBTQ+ History Month: Wimbledon Life Drawing Workshop'),
            ('UAL LGBTQ+ History Month: 2B Or Not 2B Collective Life Drawing Workshop')) t(title)
   where o.slug = 'lgbt-history-month'
     and t.title ~* ('\m(' || array_to_string(o.match_terms, '|') || ')\M');
  if v <> 5 then raise exception 'lgbt-history-month match_terms: expected 5 title hits, got %', v; end if;
end $verify$;
