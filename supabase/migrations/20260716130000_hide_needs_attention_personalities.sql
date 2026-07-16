-- Ungeprüfte Personen (needs_attention) aus der Öffentlichkeit nehmen.
-- Problem: needs_attention gated die Sichtbarkeit NICHT — Website/Suche filtern
-- nur auf visibility='public'. Dadurch sind aktuell 632 zur Prüfung markierte
-- Personen öffentlich online. Weg A: einmalig public → draft (zurück in die
-- Redaktion), reversibel via Snapshot. Konzept: tools/person-db/docs/needs-attention-gating.md
--
-- ⚠️ Redaktioneller Live-Effekt: nimmt ~632 Profile aus Suche + Website.
--    Vor Merge bestätigen. Reversibel über die Snapshot-Tabelle unten.

begin;

-- 1) Snapshot für Rückrollung: welche waren public + needs_attention?
create table if not exists public.needs_attention_hidden_20260716 (
  id uuid primary key,
  prev_visibility text not null,
  hidden_at timestamptz not null default now()
);

insert into public.needs_attention_hidden_20260716 (id, prev_visibility)
select id, visibility
from public.personalities
where needs_attention is true
  and visibility = 'public'
  and duplicate_of_id is null
on conflict (id) do nothing;

-- 2) Offline nehmen → zurück in die Redaktion.
-- Feuert trg_search_documents_personality pro Zeile (≈632) → aus dem Suchindex.
update public.personalities
set visibility = 'draft'
where needs_attention is true
  and visibility = 'public'
  and duplicate_of_id is null;

commit;

-- Rückrollung (falls nötig), separat ausführen:
--   update public.personalities p
--   set visibility = h.prev_visibility
--   from public.needs_attention_hidden_20260716 h
--   where p.id = h.id;
--
-- Kontrolle (erwartet 0):
--   select count(*) from personalities
--   where needs_attention and visibility='public' and duplicate_of_id is null;
