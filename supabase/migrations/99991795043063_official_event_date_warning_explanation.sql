-- Explain the existing date-review warning to editors, rather than a raw code.
-- Prepared during the coordinated migration hold; do not apply before release.
-- Preserve any existing explanation, including human editorial rewrites.
insert into public.pipeline_explanations(key,title,body,what_now,severity) values
('pipeline-validate:W_EVENT_DATE_UNCONFIRMED','Event date needs confirmation',
 'The source does not confirm the calendar date for this exact event and edition. The event stays in Review until official evidence establishes its date.',
 'Check the organiser''s current event page for the exact event, edition and location. Do not infer an hour or duration from a confirmed day.',
 'warning')
on conflict(key) do nothing;

