# Beruf vs. Tätigkeit/Rolle — Datenmodell-Konzept

**Status:** Entwurf (v2 / Hauptseiten-Anbindung). Nicht angewandt.
**Problem:** „Aktivist:in" ist kein Beruf, sondern eine Tätigkeit/Rolle — steckt aktuell fälschlich in `profession`.

## Ist-Zustand (live geprüft, 2026-07-16)

`activist` liegt **dreifach redundant** vor:

| Ort | Typ | Rolle im Modell |
|---|---|---|
| `personalities.profession` | text (frei) | Beruf **+ Tätigkeit gemischt** — z. B. „LGBTQ+ rights activist" |
| `personalities.lgbti_connection` | text (3 Werte: `unclear`/`community_member`/`activist`) | *Art* des LGBTQ+-Bezugs — **Klassifikator**, kein Job |
| `personalities.tags` | text[] (frei) | Schlagwort-Suppe (`activist`, `aktivist`, `lgbtq-rights`) |
| `personalities.fields` | jsonb | Alt-Müll (mal `["Drag"]`, mal Pornhub-Link) — nicht nutzen |

**Schon vorhanden:** `public.professions` = Vokabeltabelle (34 Einträge): `slug/name/category/aliases[]/is_active/sort_order`.
Darin ist `activist` als **Beruf** in Kategorie „Activism" modelliert, mit Aliassen
`lgbtq rights activist`, `civil rights activist`, `hiv/aids activist`, `campaigner`, …
→ Genau die Beruf/Tätigkeit-Vermischung, die getrennt werden soll.

Kennzahlen: 15 832 Personen · profession gefüllt 11 974 · tags 7 014 · lgbti_connection 11 477 (davon `activist` 484).

## Begriffs-Trennung

- **Beruf (`occupation`)** — Erwerb/Handwerk: Schauspieler:in, Autorin, Ärztin, Politiker:in.
  „Womit verdient(e) sie."
- **Tätigkeit/Rolle (`role`)** — Engagement/Bekanntheit, oft unbezahlt: **Aktivist:in**,
  Community-Organizer:in, Advocate, Bürgerrechtler:in. Meist **der Grund**, warum die Person in dieser DB steht.
- **LGBTQ+-Bezug (`lgbti_connection`)** — *warum* LGBTQ+-relevant. Bleibt unverändert (nicht überladen).

## Kernprinzip: der Eimer entscheidet sich pro Person, nicht am Vokabel-Wort

Dasselbe Wort kann für die eine Person **Beruf**, für die andere nur **Tätigkeit** sein:
„Musiker" = Beruf beim Berufsmusiker, bloße Tätigkeit bei der Politikerin, die nebenbei Musik macht.
→ Das Vokabel-Wort wird **nicht** fest auf Beruf oder Tätigkeit gelockt (kein `kind` auf `professions`).
Die Zuordnung entsteht **pro Person**, dadurch **in welches Feld** der Begriff gesetzt wird.

## Lösung — geteilte Vokabel, zwei Felder

1. **`professions` bleibt eine gemeinsame, ungelockte Begriffsliste** (Beruf-oder-Tätigkeit-neutral).
   Kein `kind`. Neue Tätigkeits-Begriffe ergänzen (`community-organizer`, `advocate`, `civil-rights-activist`);
   `activist` bleibt normaler Begriff, in beiden Feldern nutzbar.
2. **`personalities.roles text[]`** — Tätigkeits-Slugs (weicher Verweis auf `professions`, kein FK →
   bricht Ingestion nicht). GIN-Index für Filter.
3. `profession` bleibt das **Beruf-Feld** (Text unverändert). `lgbti_connection` bleibt Klassifikator.
4. Backfill: nur sicheres `activist` → in `roles`. `profession`-Text **nicht** anfassen (kann die einzige
   Info sein); Bereinigung von „LGBTQ+ rights activist" aus `profession` = **separater, reversibler** Pass.

Derselbe Begriff, zwei Personen:
```
Person A  Beruf (profession):  Musiker        Rolle(n) (roles[]):  —
Person B  Beruf (profession):  Politikerin    Rolle(n) (roles[]):  musician, activist
```

## Freitextsuche: alle erscheinen

Egal in welchem Feld ein Begriff steht — die Person muss auffindbar sein. Beide Felder in den Suchindex:

- **Hauptapp (`search_documents`):** Personen-Indexer/Trigger muss `roles` (als Labels aus `professions`)
  **zusätzlich zu** `profession` in den tsvector aufnehmen. Sonst findet „Musiker" nur die, wo es Beruf ist.
- **Tool-Freitext (`fetchAlpha`):** ilike bereits über `profession` — `roles` mit aufnehmen
  (`.overlaps`/`.cs` auf `roles`), damit Treffer aus beiden Feldern kommen.

Sauberes Endziel (später): auch `profession` auf Slugs aus derselben Vokabel normalisieren
(die `aliases` in `professions` sind genau dafür da) → „gleicher Begriff, egal welches Feld" wird **exakt**
statt nur textnah. Bis dahin: profession = Text, roles = Slugs; Suche deckt beide ab.

## Warum `roles` mehrwertig

Real: „Schauspielerin **+** Aktivistin **+** Autorin". Ein Beruf-Feld, mehrere Tätigkeiten → `roles` ist `text[]`.
`profession` bleibt vorerst einwertig (Haupterwerb); Zweitberufe später über die Slug-Normalisierung.

## Rollout-Schritte

1. **DB:** Migration liegt bereits: `supabase/migrations/20260716120000_person_roles_field.sql`
   (Spalte `roles`, Vokabel-Ergänzung, Backfill `activist`, **Suchindexer `search_documents_index_personalities`
   nimmt `roles` in tsvector + facets auf**). Wird bei Merge → CI `db push` live.
   ⚠️ Backfill-UPDATE feuert den Personen→`search_documents`-Trigger pro Zeile (934, überschaubar).
   Reihenfolge in der Migration: Funktion ZUERST ersetzt, DANN Backfill → berührte Zeilen reindexieren
   direkt mit `roles` im Index.
2. **Hauptapp — GEBAUT (staged, greift nach Deploy):**
   - Feld `roles` (`type: 'roles_autocomplete'`) in `src/config/contentTypes/personality.ts`.
   - Neuer CMS-Feldtyp: `src/components/cms/fields/RolesAutocompleteField.tsx` (Multi-Chips gegen die
     **ganze** `professions`-Vokabel, speichert **Slugs**, Freitext wird slugifiziert) +
     `src/hooks/useProfessionOptions.ts` (slug/name/category) + Registrierung in
     `FieldRenderer.tsx`/`types/cms.ts`/`buildSubmissionSchema.ts`.
   - Öffentliche Anzeige: `src/pages/PersonalityDetail.parts.tsx` rendert Tätigkeiten als Badges,
     getrennt vom Beruf.
   - Suchindex: `search_documents_index_personalities` nimmt `roles` auf (in der Migration).
   - ⏳ Offen: nach Live-Migration `types` regenerieren (Cast in PersonalityDetail entfernbar);
     Freitext der Website greift automatisch über den erweiterten Indexer.
3. **Tool (`tools/person-db`) — GEBAUT hinter `ROLES_ENABLED`:** Type + `PERSONALITY_COLUMNS`
   (roles nur wenn Flag), Edit-Maske Feld „Tätigkeit(en)" (Chips), Detail-Feld, Freitext `fetchAlpha`
   trifft Beruf+Tätigkeit. **Nach Migration `ROLES_ENABLED = true` in `config.ts`.**

## Offene Entscheidungen

- **Kein `kind` auf der Vokabel** — bewusst. Jedes Wort ist in beiden Feldern nutzbar; der Eimer entsteht
  pro Person. Falls die UI eine Vorsortierung braucht („welche Wörter typisch Tätigkeit?"), höchstens ein
  **weicher Hinweis** (`suggested_as text[]`), nie eine Sperre.
- **profession-Normalisierung auf Slugs** — später, damit „gleicher Begriff, egal welches Feld" exakt matcht.
- **Doppelnennung erlauben?** Person mit Beruf `musician` UND Tätigkeit `musician` — technisch möglich,
  redundant. Vorschlag: in der Maske sanft warnen, nicht hart verbieten.
- **Profession-Bereinigung**: eigener Pass, der bei reinen Aktivist:innen `profession` leert oder auf den
  echten Zweitberuf setzt. Reversibel, LLM-gestützt, separat vom obigen Backfill.
