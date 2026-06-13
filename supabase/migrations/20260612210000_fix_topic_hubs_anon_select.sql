-- /resources broke for signed-out visitors: anon lost SELECT on topic_hubs
-- (while bizarrely keeping INSERT/UPDATE/DELETE/TRUNCATE), so the topic-hub
-- grid 401'd and the page never rendered. The topic_hubs_public_read RLS
-- policy already allows public reads — restore the table grant to match,
-- and strip the write grants anon should never have had.

GRANT SELECT ON public.topic_hubs TO anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.topic_hubs FROM anon;
