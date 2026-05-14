-- Remove CMS-related database tables and types since CMS functionality is no longer needed

-- Drop all CMS-related tables
DROP TABLE IF EXISTS public.content_revisions CASCADE;
DROP TABLE IF EXISTS public.content_tag_assignments CASCADE;
DROP TABLE IF EXISTS public.content_category_assignments CASCADE;
DROP TABLE IF EXISTS public.content CASCADE;
DROP TABLE IF EXISTS public.content_categories CASCADE;

-- Drop content-related enums
DROP TYPE IF EXISTS public.content_type CASCADE;
DROP TYPE IF EXISTS public.content_status CASCADE;