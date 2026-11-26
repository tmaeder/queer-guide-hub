-- 99991795724226_personality_reject_generic_biographies
--
-- TODO: why this migration exists.

-- Existing rows remain available for reviewed cleanup. Do not create or republish
-- this known unsupported template, including via a privileged content importer.
CREATE OR REPLACE FUNCTION api_private.personality_reject_generic_biography()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous jsonb;
BEGIN
  previous = CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  IF NEW.visibility='public' AND NEW.duplicate_of_id IS NULL
    AND (previous->>'visibility' IS DISTINCT FROM 'public'
      OR previous->>'duplicate_of_id' IS NOT NULL
      OR NEW.bio IS DISTINCT FROM previous->>'bio')
    AND NEW.bio ~* '\mnotable\s+figure\s+in\s+the\s+LGBT(Q(IA?)?)?\+?\s+community\M' THEN
    RAISE EXCEPTION 'Replace generic biography with sourced career facts'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION api_private.personality_reject_generic_biography() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS personality_reject_generic_biography ON public.personalities;
CREATE TRIGGER personality_reject_generic_biography
  BEFORE INSERT OR UPDATE OF bio,visibility,duplicate_of_id ON public.personalities
  FOR EACH ROW EXECUTE FUNCTION api_private.personality_reject_generic_biography();
