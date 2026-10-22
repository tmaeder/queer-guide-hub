-- Preserve the operational recovery budget; a refresh stays bounded below its
-- five-minute cadence. Source repairs commit in their own independent job.
select cron.schedule('review_worklist_refresh','4-59/5 * * * *',
 'set statement_timeout=''180s''; select public.refresh_admin_review_worklist();');
