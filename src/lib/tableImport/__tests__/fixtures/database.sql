-- Disposable local contract database only. Never apply this to application data.
DO $$ BEGIN
  IF current_database() <> 'qg_import_contract' THEN
    RAISE EXCEPTION 'This fixture requires the disposable qg_import_contract database';
  END IF;
END $$;
CREATE ROLE import_contract_actor NOLOGIN;
CREATE ROLE import_contract_anon NOLOGIN;
CREATE ROLE import_contract_authenticator NOINHERIT LOGIN;
GRANT import_contract_actor, import_contract_anon TO import_contract_authenticator;
GRANT USAGE ON SCHEMA public TO import_contract_actor, import_contract_anon;
CREATE TABLE public.import_contract_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) > 0),
  description text,
  tags text[] NOT NULL DEFAULT '{}',
  details jsonb NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL
);
ALTER TABLE public.import_contract_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_records ON public.import_contract_rows
  TO import_contract_actor
  USING (created_by = ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::uuid)
  WITH CHECK (created_by = ((current_setting('request.jwt.claims', true)::jsonb)->>'sub')::uuid);
GRANT SELECT, INSERT, UPDATE ON public.import_contract_rows TO import_contract_actor;
CREATE FUNCTION public.import_contract_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER touch BEFORE UPDATE ON public.import_contract_rows FOR EACH ROW EXECUTE FUNCTION public.import_contract_touch();
CREATE FUNCTION public.import_contract_read(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER AS $$
  SELECT to_jsonb(r) FROM public.import_contract_rows r WHERE r.id=p_id;
$$;
CREATE FUNCTION public.import_contract_save(p_id uuid,p_data jsonb,p_locations jsonb,p_expected_updated_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE saved public.import_contract_rows;
BEGIN
  UPDATE public.import_contract_rows SET
    name=CASE WHEN p_data ? 'name' THEN p_data->>'name' ELSE name END,
    description=CASE WHEN p_data ? 'description' THEN p_data->>'description' ELSE description END
  WHERE id=p_id AND updated_at IS NOT DISTINCT FROM p_expected_updated_at
  RETURNING * INTO saved;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version conflict or denied' USING ERRCODE='40001'; END IF;
  RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.import_contract_read(uuid) FROM public;
REVOKE ALL ON FUNCTION public.import_contract_save(uuid,jsonb,jsonb,timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.import_contract_read(uuid), public.import_contract_save(uuid,jsonb,jsonb,timestamptz) TO import_contract_actor;
