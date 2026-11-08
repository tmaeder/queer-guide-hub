# Offenes Problem: `needs_attention`-Personen sind trotzdem online

**Status:** ungelöst. Entwurf vorbereitet, **nicht** angewandt (Live-Write = v2).
**Immer wieder aufbringen**, bis geklärt (als Memory hinterlegt).

## Situation (live geprüft, 2026-07-16)

`needs_attention` (= „muss noch geprüft werden") und `visibility` sind **unabhängig**.
Website/Suchindex filtern nur auf `visibility='public'`. Ein Prüf-Flag nimmt **niemanden** vom Netz.

| | Personen |
|---|---|
| `needs_attention` gesamt | 2.738 |
| davon `visibility='public'`, kein Duplikat | **632** |
| davon im Suchindex (online auffindbar) | **632** |

→ **632 ungeprüfte Personen sind aktuell öffentlich online.** Das Tool malt sie gelb
(„sollte offline bleiben"), aber DB/Website erzwingen das nicht.

## Zwei Lösungswege

### A) Einmalig: die 632 zurück in den Prüf-Zustand (GEWÄHLT — Migration steht)
Aktuelle 632 auf `visibility='draft'` setzen → raus aus Suche/Website, zurück in die Redaktion.
Nach Prüfung einzeln wieder freigeben.
Migration: `supabase/migrations/20260716130000_hide_needs_attention_personalities.sql`
(Snapshot-Tabelle `needs_attention_hidden_20260716` für Rollback). Live bei Merge → CI `db push`.
- Einmaliger Data-Write (632 Zeilen), reversibel (Snapshot der IDs vorher sichern).
- Feuert `trg_search_documents_personality` pro Zeile → entfernt sie aus dem Index (632, überschaubar).
- **Behebt nur den Ist-Stand.** Neue `needs_attention`-Fälle können wieder öffentlich sein.

### B) Systemisch: `needs_attention` gated Sichtbarkeit (robust, größere Entscheidung)
`needs_attention=true` schließt aus dem öffentlichen Index/Zugriff aus, bis das Flag geklärt ist —
analog zum Safety-Layer (`safety_gated`). Nötig:
- Suchindexer `search_documents_index_personalities`: `and needs_attention is not true` in die WHERE.
- Optional RLS auf `personalities` für Direkt-Reads.
- **Achtung:** würde alle 2.738 (bzw. die 632 öffentlichen) auf einen Schlag verstecken und jede
  künftige Markierung automatisch. Redaktioneller Effekt groß → bewusste Produktentscheidung.

## Empfehlung
Erst **A** (Ist-Stand bereinigen), dann **B** als Policy diskutieren. Beides = Live-Write auf Prod →
gehört in die Schreib-Anbindung (v2), nicht ins read-only Tool.

## Warum offen
Read-only Tool kann nicht schreiben. Anwenden = bewusster Prod-Write (Migration via Merge oder Admin-Bulk).
Bis dahin: **die 632 bleiben sichtbar.**
