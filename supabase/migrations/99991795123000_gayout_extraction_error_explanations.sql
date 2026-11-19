-- Explain the actual internal extraction configuration and authentication gates.
-- Preserve existing editorial wording on replay.
insert into public.pipeline_explanations (key, title, body, what_now, severity) values
('pipeline-validate:E_GAYOUT_EXTRACT_CONFIG', 'Internal extraction is not configured',
 'The GayOut source cannot run its internal extraction step because the extraction worker URL or shared authentication secret is missing.',
 'Ask an administrator to configure EXTRACT_WORKER_URL and EXTRACT_WORKER_SECRET for the source worker. Keep extraction blocked until configuration is complete.', 'blocking'),
('pipeline-validate:E_GAYOUT_EXTRACT_AUTH', 'Internal extraction authentication failed',
 'The internal extraction worker rejected the source worker authentication secret. No extracted document was accepted.',
 'Ask an administrator to make the source worker EXTRACT_WORKER_SECRET match the extraction worker INTERNAL_SECRET, then retry the source. Do not bypass authentication.', 'blocking')
on conflict (key) do nothing;

do $verify$
begin
 if (select count(*) from public.pipeline_explanations where active and severity='blocking'
   and key in ('pipeline-validate:E_GAYOUT_EXTRACT_CONFIG','pipeline-validate:E_GAYOUT_EXTRACT_AUTH')
   and length(title) between 3 and 60 and length(body)>=20)<>2 then
  raise exception 'Missing or invalid GayOut extraction explanations';
 end if;
end $verify$;
