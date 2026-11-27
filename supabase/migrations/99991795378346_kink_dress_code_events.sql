-- Kink & feature filters: dress code on events, with negations excluded.
--
-- 99991795361199 left dress-code off events because ~3 in 10 mentions negate
-- it ("no dress code", "free dress code", "rien d'obligatoire"). Measured on
-- prod 2026-11-22 over the 84 upcoming candidates: the exclusion below catches
-- 24; of the 60 left, hand-read, 58 assert a dress code and 2 mean "anything
-- goes" ("All fetish & dress codes welcome", "DRESSCODE No Limits"). Both of
-- those are now excluded too, so the remaining set reads 58/58.
--
-- kink_filter_patterns gains an optional exclude_pattern; run_kink_tag_fill
-- skips a match whose text also matches it. Patched from the live definition
-- (exactly-once replaces), never restated. The venue dress-code review pattern
-- gets the same exclusion, so future venue proposals skip negations too.

select set_config('app.actor', 'migration:99991795378346_kink_dress_code_events', true);

alter table public.kink_filter_patterns add column if not exists exclude_pattern text;

-- One shared negation pattern for dress code, events and venues alike.
create temporary table _kink_dc (x text) on commit drop;
insert into _kink_dc values (
  '(\m(no|free|without|kein\w*|sin|sans|pas de|aucun)\M[^.|]{0,25}\mdress ?codes?\M)'
  || '|(\mdress ?codes?\M[^.|]{0,14}\m(none|free|optional|nicht|libre|welcome|no limits)\M)'
  || '|(\mall\M[^.|]{0,25}\mdress ?codes?\M)'
  || '|rien d.obligatoire'
);

insert into public.kink_filter_patterns (tag_id, target, pattern, mode, exclude_pattern)
select k.tag_id, 'events', '\mdress ?codes?\M', 'auto', (select x from _kink_dc)
  from public.kink_filter_terms k join public.unified_tags t on t.id = k.tag_id
 where t.slug = 'dress-code'
on conflict (tag_id, target) do update
  set pattern = excluded.pattern, mode = excluded.mode, exclude_pattern = excluded.exclude_pattern;

update public.kink_filter_patterns p
   set exclude_pattern = (select x from _kink_dc)
  from public.unified_tags t
 where t.id = p.tag_id and t.slug = 'dress-code' and p.target = 'venues';

do $patch$
declare
  v_def text := pg_get_functiondef('public.run_kink_tag_fill(integer)'::regprocedure);
  v_ev text := $s$     and (coalesce(e.title, '') || ' ' || coalesce(e.description, '')) ~* p.pattern$s$;
  v_ve text := $s$     and (coalesce(v.name, '') || ' ' || coalesce(v.description, '')) ~* p.pattern$s$;
  v_n int;
begin
  if position('p.exclude_pattern' in v_def) > 0 then
    return;  -- already patched
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_ev, ''))) / length(v_ev);
  if v_n <> 1 then raise exception 'run_kink_tag_fill: expected one event match line, found %', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_ve, ''))) / length(v_ve);
  if v_n <> 1 then raise exception 'run_kink_tag_fill: expected one venue match line, found %', v_n; end if;
  v_def := replace(v_def, v_ev, v_ev || $s$
     and (p.exclude_pattern is null
          or not ((coalesce(e.title, '') || ' ' || coalesce(e.description, '')) ~* p.exclude_pattern))$s$);
  v_def := replace(v_def, v_ve, v_ve || $s$
     and (p.exclude_pattern is null
          or not ((coalesce(v.name, '') || ' ' || coalesce(v.description, '')) ~* p.exclude_pattern))$s$);
  execute v_def;
end
$patch$;

do $backfill$
declare r jsonb; i int := 0;
begin
  loop
    r := public.run_kink_tag_fill(300);
    i := i + 1;
    exit when (r->>'events_tagged')::int = 0 and (r->>'venues_tagged')::int = 0
          and (r->>'venue_proposals')::int = 0;
    if i > 30 then raise exception 'fill did not converge: %', r; end if;
  end loop;
end
$backfill$;

do $verify$
declare v_bad int;
begin
  if position('p.exclude_pattern' in pg_get_functiondef('public.run_kink_tag_fill(integer)'::regprocedure)) = 0 then
    raise exception 'P1 failed: run_kink_tag_fill does not honour exclude_pattern';
  end if;
  -- No event the FILL tagged with dress-code may carry a negated mention.
  select count(*) into v_bad
    from public.kink_tag_fill_log l
    join public.unified_tags t on t.id = l.tag_id and t.slug = 'dress-code'
    join public.events e on e.id = l.entity_id
   where l.entity_type = 'events'
     and (coalesce(e.title, '') || ' ' || coalesce(e.description, '')) ~* (select x from _kink_dc);
  if v_bad <> 0 then
    raise exception 'P2 failed: % events tagged dress-code despite a negated mention', v_bad;
  end if;
  if (public.kink_filter_signals()->>'event_array_without_assignment')::int <> 0 then
    raise exception 'P3 failed: event tags without assignments';
  end if;
end
$verify$;
