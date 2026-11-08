-- Resolve only built-in names and explicitly qualified application objects.
alter function public.refresh_gate_snapshots() set search_path = '';
