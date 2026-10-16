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
 assert public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","startH":"12:00","endH":"17:00","recurring":"m","every":1,"m.day":6,"m.nth":5}]]}', '2026-10-01','2026-10-31') is null,'unknown fifth/last sentinel silently interpreted';
 assert public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"invalid","end":"2026-10-31"}]]}') is null,'invalid source date accepted';
 assert public.agendaq_evidence_schedule('{"dates":"invalid"}') is null,'non-array dates accepted';
 rule:=public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-31","tz":"Europe/Paris","startH":"12:00","endH":"17:00","recurring":"d","every":2}]]}', '2026-10-01','2026-10-05');
 assert jsonb_array_length(rule->'extra')=3,'daily interval anchor lost';
 assert public.agendaq_evidence_schedule('{"dates":[["cal",{"start":"2026-10-01","end":"2026-10-05","tz":"Europe/Paris","startH":"12:00","endH":"17:00","recurring":""}]]}', '2026-10-01','2026-10-31') is null,'unsupported multiday span truncated to one day';
end $$;
rollback;
