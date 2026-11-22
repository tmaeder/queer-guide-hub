-- Germany observes LGBT+ History Month in MAY ("Queer History Month"), not
-- February (UK) or October (US/CA). Found while hand-reading the observance
-- review queue on 2026-11-22: "Berlin: Queer History Month" and "Hamburg: Queer
-- History Month" (2026-05-01) matched by title but fell outside every window,
-- because lgbt-history-month had no German rule and no global one.
-- Source: queere-jugend-berlin.de ("Jedes Jahr im Mai findet in Berlin ..."),
-- organiser queerhistory.de (Archiv der Jugendkulturen).
-- Idempotent: the unique index is one rule per (observance, country).

insert into public.observance_dates (observance_id, country_id, rule_type, month)
select o.id, c.id, 'month', 5
from public.observances o
join public.countries c on c.code = 'DE'
where o.slug = 'lgbt-history-month'
  and not exists (select 1 from public.observance_dates r
                  where r.observance_id = o.id and r.country_id = c.id);

update public.observances
   set sources = sources || '[{"url":"https://queere-jugend-berlin.de/infos/fortbildung/","checked":"2026-11-22","country":"DE"},{"url":"https://www.queerhistory.de/","checked":"2026-11-22","country":"DE"}]'::jsonb,
       updated_at = now()
 where slug = 'lgbt-history-month'
   and not sources @> '[{"country":"DE"}]'::jsonb;

do $verify$
declare v_d date;
begin
  -- end state: a German event resolves to May; the UK and US rules are untouched
  select lower(public.observance_occurrence(o.id, 2027, c.id)) into v_d
  from public.observances o, public.countries c where o.slug = 'lgbt-history-month' and c.code = 'DE';
  if v_d is distinct from '2027-05-01'::date then raise exception 'P1 failed: DE history month = %', v_d; end if;
  select lower(public.observance_occurrence(o.id, 2027, c.id)) into v_d
  from public.observances o, public.countries c where o.slug = 'lgbt-history-month' and c.code = 'GB';
  if v_d is distinct from '2027-02-01'::date then raise exception 'P2 failed: GB history month = %', v_d; end if;
end $verify$;
