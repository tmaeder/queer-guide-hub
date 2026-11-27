-- Explanations for the two internal-extraction codes source-gayout/extract.ts
-- emits. Without them the admin inspector shows a raw key and the
-- check-explanation-keys gate fails. Seed only; human rewrites win.
insert into public.pipeline_explanations(key,title,body,what_now,severity) values
('pipeline-validate:E_GAYOUT_EXTRACT_CONFIG','Internal extraction is not configured',
 'The GayOut source needs the internal extraction worker, but EXTRACT_WORKER_URL or its secret is not set. No page was fetched, and nothing was treated as an empty import.',
 'Set EXTRACT_WORKER_URL and EXTRACT_WORKER_SECRET on the edge function, then retry the sync.','blocking'),
('pipeline-validate:E_GAYOUT_EXTRACT_AUTH','Internal extraction rejected the secret',
 'The extraction worker answered 401 or 403. The secret the edge function sends does not match the worker''s INTERNAL_SECRET, so no source page was retrieved.',
 'Make EXTRACT_WORKER_SECRET match the extraction worker INTERNAL_SECRET, then retry the sync.','blocking')
on conflict(key) do nothing;
