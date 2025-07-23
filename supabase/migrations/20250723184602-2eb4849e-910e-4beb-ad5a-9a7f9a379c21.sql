-- Create triggers for real-time Algolia sync

-- Function to sync tag changes to Algolia
CREATE OR REPLACE FUNCTION sync_tag_to_algolia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Determine the action and sync to Algolia
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Trigger Edge Function to sync tag
    PERFORM
      net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/sync-tags-to-algolia',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'action', 'sync_tag',
          'tag_id', NEW.id
        )
      );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Trigger Edge Function to delete tag from Algolia
    PERFORM
      net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/sync-tags-to-algolia',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'action', 'delete_tag',
          'tag_id', OLD.id
        )
      );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Function to sync tag relationship changes to Algolia
CREATE OR REPLACE FUNCTION sync_tag_relationship_to_algolia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Determine the action and sync to Algolia
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Trigger Edge Function to sync relationship
    PERFORM
      net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/sync-tags-to-algolia',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'action', 'sync_relationship',
          'relationship_id', NEW.id
        )
      );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Trigger Edge Function to delete relationship from Algolia
    PERFORM
      net.http_post(
        url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/sync-tags-to-algolia',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'action', 'delete_relationship',
          'relationship_id', OLD.id
        )
      );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Create triggers for unified_tags table
DROP TRIGGER IF EXISTS trigger_sync_unified_tags_to_algolia ON public.unified_tags;
CREATE TRIGGER trigger_sync_unified_tags_to_algolia
  AFTER INSERT OR UPDATE OR DELETE ON public.unified_tags
  FOR EACH ROW
  EXECUTE FUNCTION sync_tag_to_algolia();

-- Create triggers for tag_relationships table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tag_relationships') THEN
    DROP TRIGGER IF EXISTS trigger_sync_tag_relationships_to_algolia ON public.tag_relationships;
    CREATE TRIGGER trigger_sync_tag_relationships_to_algolia
      AFTER INSERT OR UPDATE OR DELETE ON public.tag_relationships
      FOR EACH ROW
      EXECUTE FUNCTION sync_tag_relationship_to_algolia();
  END IF;
END $$;

-- Configure Algolia index settings and attributes for faceted search
COMMENT ON FUNCTION sync_tag_to_algolia() IS 'Automatically syncs tag changes to Algolia search index for enhanced search capabilities';
COMMENT ON FUNCTION sync_tag_relationship_to_algolia() IS 'Automatically syncs tag relationship changes to Algolia for graph view enhancements';