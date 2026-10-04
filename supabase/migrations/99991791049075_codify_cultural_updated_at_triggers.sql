-- Codify the nine cultural_* / user_hanky_signals updated_at triggers as
-- literal statements, so `check-schema-object-drift.mjs` can see them.
--
-- THE TRIGGERS WERE NEVER HAND-ATTACHED. 20261003134417_visual_culture_graph_foundation
-- creates all nine, but inside a `do $$ … foreach … execute format(...)` loop that
-- composes each name at run time from `v_table || '_updated_at_trg'`. The gate scans
-- migration FILES for a literal `create trigger <name>`, so a name that exists only as
-- a runtime concatenation is invisible to it — and it reported all nine as
-- "run in production that NO migration creates".
--
-- That is a FALSE POSITIVE about provenance and a TRUE statement about the scan: a
-- rebuild from migrations does create these, so the invariant the gate protects was
-- already satisfied; what was missing is the evidence. The gate's own header states
-- "`drop trigger if exists` + `create trigger` is the only idiom here, and its absence
-- from the corpus is unambiguous" — that assumption is what 20261003134417 broke, and
-- it is worth knowing before anyone trusts this scanner on a future dynamic creation.
--
-- WHY NOT THE BASELINE: scripts/schema-object-drift-baseline.json is shrink-only and
-- says "Never add." Baselining these would record them as uncodified, which is the
-- opposite of true, and the gate hard-fails on a baseline entry that becomes covered —
-- so an entry added today would have to be deleted again by whoever codified it.
--
-- WHY NOT TEACH THE SCANNER `format()`: its header says TRIGGERS ONLY, deliberately,
-- and "Under-reaching is the correct error". Parsing dynamic SQL to recognise a
-- composed name trades a loud false positive for a quiet false negative on the one
-- object class this gate exists to watch.
--
-- Definitions are the LIVE ones, read from pg_get_triggerdef rather than copied from
-- the loop: all nine are `BEFORE UPDATE … FOR EACH ROW EXECUTE FUNCTION
-- cultural_set_updated_at()`, which agrees with the loop, checked rather than assumed.
--
-- Idempotent and prod-safe in both directions. On prod each trigger is dropped and
-- recreated identically inside this migration's transaction, so no writer ever sees a
-- table without it. On a rebuild from zero the loop in 20261003134417 creates them
-- first and this file replaces them with byte-identical definitions; the
-- `drop trigger if exists` is what keeps that from raising 42710.

drop trigger if exists cultural_sources_updated_at_trg on public.cultural_sources;
create trigger cultural_sources_updated_at_trg
  before update on public.cultural_sources
  for each row execute function public.cultural_set_updated_at();

drop trigger if exists cultural_nodes_updated_at_trg on public.cultural_nodes;
create trigger cultural_nodes_updated_at_trg
  before update on public.cultural_nodes
  for each row execute function public.cultural_set_updated_at();

drop trigger if exists cultural_variants_updated_at_trg on public.cultural_variants;
create trigger cultural_variants_updated_at_trg
  before update on public.cultural_variants
  for each row execute function public.cultural_set_updated_at();

drop trigger if exists cultural_claims_updated_at_trg on public.cultural_claims;
create trigger cultural_claims_updated_at_trg
  before update on public.cultural_claims
  for each row execute function public.cultural_set_updated_at();

drop trigger if exists cultural_edges_updated_at_trg on public.cultural_edges;
create trigger cultural_edges_updated_at_trg
  before update on public.cultural_edges
  for each row execute function public.cultural_set_updated_at();

drop trigger if exists cultural_assignments_updated_at_trg on public.cultural_assignments;
create trigger cultural_assignments_updated_at_trg
  before update on public.cultural_assignments
  for each row execute function public.cultural_set_updated_at();

drop trigger if exists cultural_link_proposals_updated_at_trg on public.cultural_link_proposals;
create trigger cultural_link_proposals_updated_at_trg
  before update on public.cultural_link_proposals
  for each row execute function public.cultural_set_updated_at();

drop trigger if exists user_cultural_preferences_updated_at_trg on public.user_cultural_preferences;
create trigger user_cultural_preferences_updated_at_trg
  before update on public.user_cultural_preferences
  for each row execute function public.cultural_set_updated_at();

drop trigger if exists user_hanky_signals_updated_at_trg on public.user_hanky_signals;
create trigger user_hanky_signals_updated_at_trg
  before update on public.user_hanky_signals
  for each row execute function public.cultural_set_updated_at();

do $verify$
declare
  v_tables text[] := array[
    'cultural_sources', 'cultural_nodes', 'cultural_variants', 'cultural_claims',
    'cultural_edges', 'cultural_assignments', 'cultural_link_proposals',
    'user_cultural_preferences', 'user_hanky_signals'
  ];
  v_found int;
  v_wrong int;
begin
  -- P1. All nine attached. Counted positively rather than as "zero missing", because
  -- zero-missing is equally true of a table list that has gone empty.
  select count(*) into v_found
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and c.relname = any (v_tables)
    and t.tgname = c.relname || '_updated_at_trg';

  if v_found <> 9 then
    raise exception 'P1 failed: expected 9 cultural updated_at triggers, found %', v_found;
  end if;

  -- P2. Each one still fires BEFORE UPDATE FOR EACH ROW on cultural_set_updated_at.
  -- A recreation that silently changed timing or function would satisfy P1.
  select count(*) into v_wrong
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and c.relname = any (v_tables)
    and t.tgname = c.relname || '_updated_at_trg'
    and pg_get_triggerdef(t.oid) !~ 'BEFORE UPDATE ON public\.[a-z_]+ FOR EACH ROW EXECUTE FUNCTION cultural_set_updated_at\(\)';

  if v_wrong <> 0 then
    raise exception 'P2 failed: % cultural updated_at trigger(s) no longer match the recorded definition', v_wrong;
  end if;

  raise notice 'codify cultural updated_at triggers: 9 attached, definitions unchanged';
end
$verify$;
