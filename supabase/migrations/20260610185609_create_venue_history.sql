CREATE TABLE IF NOT EXISTS public.venue_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  note text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS venue_history_venue_id_idx ON public.venue_history(venue_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS venue_history_event_type_idx ON public.venue_history(event_type);

ALTER TABLE public.venue_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY venue_history_read_all ON public.venue_history
  FOR SELECT USING (true);

CREATE POLICY venue_history_admin_write ON public.venue_history
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','editor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','editor')));

COMMENT ON TABLE public.venue_history IS 'Audit log of significant venue lifecycle events: moves, renames, closures, reopens, merges.';
COMMENT ON COLUMN public.venue_history.event_type IS 'e.g. moved, renamed, closed, reopened, merged, ownership_changed';
