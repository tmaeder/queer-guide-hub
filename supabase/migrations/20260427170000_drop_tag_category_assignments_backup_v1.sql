-- Drop leftover backup table _tag_category_assignments_backup_v1.
-- It was a one-off snapshot from a prior tag-category schema change; no
-- longer referenced. Already dropped on prod xqeacpakadqfxjxjcewc; this
-- migration codifies the cleanup.

DROP TABLE IF EXISTS public._tag_category_assignments_backup_v1;
