-- Remove CMS Connectors functionality (redundant with Import Hub)

-- Drop dependent table first
DROP TABLE IF EXISTS cms_sync_jobs;

-- Drop connectors table
DROP TABLE IF EXISTS cms_connectors;