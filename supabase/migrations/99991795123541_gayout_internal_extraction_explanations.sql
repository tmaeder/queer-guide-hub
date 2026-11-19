-- Explain the existing internal extraction failures without replacing editor copy.
insert into public.pipeline_explanations(key,title,body,what_now,severity) values
('pipeline-validate:E_GAYOUT_EXTRACT_CONFIG','Internal extraction needs configuration',
 'The GayOut fallback could not find an extraction worker URL or credential. It stopped instead of treating unavailable source content as an empty import.',
 'Configure EXTRACT_WORKER_URL and EXTRACT_WORKER_SECRET for the existing internal extraction worker, then retry the saved source job.','blocking'),
('pipeline-validate:E_GAYOUT_EXTRACT_AUTH','Internal extraction credential was rejected',
 'The internal extraction worker rejected the request with HTTP 401 or 403. No source facts were inferred from the rejected response.',
 'Make EXTRACT_WORKER_SECRET match the extraction worker INTERNAL_SECRET, then retry the saved source job.','blocking')
on conflict(key) do nothing;

