begin;
do $$
declare rule jsonb; pattern jsonb; n integer;
begin
 pattern:='{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","startH":"22:00","endH":"04:00","recurring":"w","every":1,"w.5":true}]]}';
 rule:=public.agendaq_evidence_schedule(pattern,'2026-10-16','2026-10-31');
 assert rule->>'confidence'='feed','source calendar lost feed confidence';
 assert jsonb_array_length(rule->'extra')=3,'Friday calendar did not preserve weekday/boundaries';
 assert rule->'extra'->0->>'date'='2026-10-16','wrong weekday mapping';
 assert rule->'extra'->2->>'date'='2026-10-30','future slot escaped source end boundary';
 rule:=public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-16","end":"2026-10-17","tz":"Europe/Berlin","startH":"22:00","endH":"06:00","recurring":""}]]}', '2026-10-01','2026-10-31');
 assert jsonb_array_length(rule->'extra')=1,'explicit overnight event became repeated daily sessions';
 assert rule->'extra'->0->>'end'='06:00','overnight close time lost';
 rule:=public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","startH":"12:00","endH":"17:00","recurring":"m","every":1,"m.day":6,"m.nth":1}]]}', '2026-10-01','2026-10-31');
 assert rule->'extra'->0->>'date'='2026-10-03','first Saturday monthly rule misexpanded';
 assert public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","startH":"12:00","endH":"17:00","recurring":"m","every":1,"m.day":6,"m.nth":5}]]}', '2026-10-01','2026-10-31') ->'extra'->0->>'date'='2026-10-31','last Saturday monthly rule misexpanded';
 assert public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"invalid","end":"2026-10-31"}]]}') is null,'invalid source date accepted';
 assert public.agendaq_evidence_schedule('{"dates":"invalid"}') is null,'non-array dates accepted';
 assert public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Invalid/Timezone","startH":"12:00","endH":"17:00","recurring":"d"}]]}', '2026-10-01','2026-10-31') is null,'invalid timezone accepted';
 rule:=public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","startH":"12:00","endH":"17:00","recurring":"d","every":2}]]}', '2026-10-01','2026-10-05');
 assert jsonb_array_length(rule->'extra')=3,'daily interval anchor lost';
 assert public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-05","tz":"Europe/Paris","startH":"12:00","endH":"17:00","recurring":""}]]}', '2026-10-01','2026-10-31') ->'extra'->0->>'end_date'='2026-10-05','explicit multiday span lost its closing date';
 -- Last weekday, recurring cancellation, and expired malformed entries.
 pattern:='{"dates":[["cal",{"start":"2026-10-01","end":"2026-11-30","tz":"Europe/Paris","startH":"19:00","endH":"04:00","recurring":"m","m.day":3,"m.nth":5}],["cal",{"start":"2026-11-25","end":"2026-11-25","tz":"Europe/Paris","label":"CANCEL"}],["cal",{"start":"2020-02-10","end":"2020-01-10"}]]}';
 rule:=public.agendaq_evidence_schedule(pattern,'2026-10-01','2026-11-30');
 assert jsonb_array_length(rule->'extra')=1,'cancellation became an opening or historical typo invalidated calendar';
 assert rule->'extra'->0->>'date'='2026-10-28','last Wednesday incorrectly treated as fifth';
 rule:=public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","startH":"19:00","endH":"21:00","recurring":"w","w.4":true}],["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","label":"CANCEL","recurring":"m","m.day":4,"m.nth":2}]]}', '2026-10-01','2026-10-31');
 assert jsonb_array_length(rule->'extra')=4,'recurring cancellation did not exclude second Thursday';
 assert not exists(select 1 from jsonb_array_elements(rule->'extra') v where v->>'date'='2026-10-08'),'cancelled date leaked';
 rule:=public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","startH":"19:00","endH":"21:00","recurring":"w","w.4":true}],["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Luxembourg","startH":"16:00","endH":"18:00","recurring":"w","w.0":true}]]}', '2026-10-01','2026-10-31');
 assert jsonb_array_length(rule->'extra')=9,'equivalent IANA zones rejected';
 assert public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","startH":"19:00","endH":"21:00","recurring":"d"}],["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"America/New_York","startH":"19:00","endH":"21:00","recurring":"d"}]]}', '2026-10-01','2026-10-31') is null,'incompatible source zones silently merged';
 rule:=public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-05","tz":"Europe/Paris","startH":"12:00","endH":"17:00","recurring":""}]]}', '2026-10-03','2026-10-31');
 select count(*) into n from public.event_schedule_dates(rule,'2026-10-03Z','2026-10-31Z') where open_at='2026-10-01 10:00Z' and close_at='2026-10-05 15:00Z';
 assert n=1,'ongoing multi-day run truncated, repeated or omitted';
 assert not has_function_privilege('anon','public.apply_event_source_evidence(jsonb)','execute'),'public may attach untrusted sources';

end $$;
rollback;
