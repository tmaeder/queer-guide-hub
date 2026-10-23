-- Synthetic admin data for the Critical paths specs run against the local
-- snapshot DB (e2e-local.yml). The snapshot copies only anon-readable rows, so
-- every admin queue and the archived slice would otherwise be empty, and the
-- specs that refuse to pass vacuously (admin-inbox-renders,
-- admin-archived-lifecycle) fail. Nothing here comes from production.

-- An archived slice for /admin/content/venues, which lists organisations;
-- they archive via status = 'archived' (src/config/contentTypes/organization.ts).
update public.organizations set status = 'archived'
where id in (select id from public.organizations order by id limit 5);

-- One decision source (general-review) and one finding source (event-quality).
insert into public.review_queue (entity_type, entity_id, review_type, status, details)
select 'venue', id, 'ci_seed', 'pending', '{}'::jsonb
from public.venues
where duplicate_of_id is null
order by id limit 3;

insert into public.event_quality_issues (event_id, dimension, issue_code, detector, severity, status, evidence, evidence_hash)
select id, 'completeness', 'DESCRIPTION_MISSING', 'ci_seed', 'low', 'open', '{}'::jsonb, md5('ci_seed' || id)
from public.events where duplicate_of_id is null order by id limit 3;

select public.refresh_admin_review_queue_counts();
select public.refresh_admin_review_queue_top();
select public.refresh_admin_review_worklist();
