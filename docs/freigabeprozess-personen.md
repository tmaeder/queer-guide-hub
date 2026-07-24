# Freigabeprozess für neue Personen — Anleitung

*Queer.Guide · Stand 2026-07-23*

Diese Anleitung erklärt, wie eine neue Person von der Erfassung bis zur
Veröffentlichung kommt, was die Ampel bedeutet und wie du die Freigabe-Queue
abarbeitest. Zum in Ruhe durchlesen — der praktische Teil steht in Abschnitt 6.

---

## 1. Wozu das Ganze?

Personen (Aktivist:innen, Künstler:innen, historische Figuren) tauchen aus vielen
Quellen im Queer.Guide auf. Nicht jede ist sofort öffentlich richtig: mal fehlt ein
Bild, mal ist es gar keine Person (sondern ein Verein), mal ist es eine lebende
Person, deren Outing echten Schaden anrichten würde.

Der Freigabeprozess sorgt dafür, dass **nichts ungeprüft öffentlich wird**. Sichere
Fälle laufen automatisch durch, unsichere landen bei dir zur Entscheidung.

---

## 2. Der Weg einer Person (Überblick)

```
Quelle → Staging → Pipeline → Entwurf → AMPEL → veröffentlicht / abgelehnt
```

1. **Erfassung.** Eine Person kommt aus einer von fünf Quellen:
   Scraper, Admin-Eingabe, CSV-Import, Chrome-Extension oder Wikidata-Bulk.
   Alle schreiben in **eine** Zwischentabelle (`ingestion_staging`) — niemand
   schreibt direkt in den Live-Bestand.

2. **Pipeline.** Acht automatische Schritte prüfen und bereinigen jede Person:
   Normalisieren → Anreichern (Bio/Bild/Wikidata) → Validieren → Duplikate suchen →
   Qualität bewerten → Review-Gate → Commit.

3. **Entwurf.** Nach dem Commit ist die Person im Live-Bestand, aber als **Entwurf**
   (`draft`) — also **noch nicht öffentlich**.

4. **Ampel.** Ab hier zeigt eine Ampel, wo die Person steht (siehe Abschnitt 3).

> **Wichtig:** Ob eine Person öffentlich ist, entscheidet allein die *Sichtbarkeit*
> (`visibility`), nicht der interne Prüf-Status. Frisch erfasste Personen tragen aus
> technischen Gründen oft schon „approved" im Status, sind aber trotzdem nur Entwurf.
> Die Ampel richtet sich deshalb nach der Sichtbarkeit.

---

## 3. Die Ampel — fünf Stufen

| Ampel | Stufe | Was es heißt | Was zu tun ist |
|:---:|---|---|---|
| ⚪ grau | **Erfasst** | Entwurf, noch unvollständig (Bio/Bild fehlt) | Nichts — wartet auf automatische Anreicherung |
| 🟡 gelb | **In Prüfung** | Braucht eine menschliche Entscheidung | **Dein Job** — freigeben oder ablehnen |
| 🟢 grün | **Freigabe bereit** | Erfüllt alle Auto-Kriterien | Nichts — wird nächtlich automatisch veröffentlicht |
| 🟢 grün | **Veröffentlicht** | Öffentlich auf queer.guide | Fertig |
| 🔴 rot | **Abgelehnt** | Archiviert, abgelehnt oder Duplikat | Nichts (reversibel, falls Fehler) |

Die vier ersten Stufen sind der Weg nach vorn; **Abgelehnt** ist die Ablage daneben.

---

## 4. Hybrid: automatisch + manuell

Es gibt **zwei Wege** zur Veröffentlichung.

### Automatisch (läuft nächtlich, ca. 03:50)
Eine Person wird **ohne dein Zutun** veröffentlicht, wenn sie **alle** Kriterien
erfüllt:

- Relevanz-Score ≥ 0,7
- Bio **und** Bild vorhanden
- echte Wikidata-ID
- **keine** Adult-Kohorte, **keine** Nicht-Person

Solche Personen stehen auf Stufe **Freigabe bereit** — du musst nichts tun.

### Manuell (deine Freigabe-Queue)
Alles, was das Auto-Gate **nicht** erfüllt oder geflaggt ist, landet auf Stufe
**In Prüfung**. Dort entscheidest du (siehe Abschnitt 6).

---

## 5. Harte Sperren — was NIE geht

Vier Fälle lassen sich **nie** freigeben, auch nicht per Override. Das System
verweigert die Veröffentlichung und zeigt eine Meldung:

| Sperre | Bedeutung | Was stattdessen tun |
|---|---|---|
| **Nicht-Person** | Organisation/Team/Ort im Personen-Bestand | Nicht freigeben — gehört archiviert |
| **Adult-Kohorte** | Adult-Profil | Nur über den separaten **Consent-Pfad** (unten auf der Seite) |
| **Outing-Schutz** | Lebende Person mit sensibler LGBTQ+-Verbindung | Nicht freigeben — Schutz vor Outing |
| **Duplikat** | Zeigt auf eine andere Person | Erst zusammenführen, dann die Hauptperson freigeben |

Diese Sperren sind der Kern des Prozesses: Sie schützen vor realem Schaden.

---

## 6. So arbeitest du die Queue ab (Schritt für Schritt)

1. **Öffne** im Admin die Seite **`/admin/content/personality-quality`**.

2. **Oben** siehst du den Funnel: eine Karte je Ampel-Stufe mit der Anzahl.
   Ein Klick auf eine Stufe filtert die Liste darunter.

3. **Klick auf „In Prüfung"** (gelb). Das ist deine Arbeitsliste.

4. **Je Zeile** siehst du: Ampel-Punkt, Name, Bild, Relevanz und **Gründe**
   (warum die Person hier liegt — siehe Abschnitt 7).

5. **Entscheide:**
   - **Freigeben** → Person wird öffentlich.
     - Ist das Auto-Gate erfüllt: sofort veröffentlicht.
     - Ist es **nicht** erfüllt (z. B. Bild fehlt), zeigt der Knopf ein
       **🔒 Schloss-Symbol**. Dann fragt das System nach: Du bestätigst den
       **Override** bewusst.
   - **Ablehnen** → Person geht in die Ablage. **Reversibel.**

6. **Rote Sperren** (Abschnitt 5) lassen sich nicht freigeben — du bekommst eine
   klare Meldung, was zu tun ist.

7. **Etwas versehentlich freigegeben oder abgelehnt?** Wechsle auf die Stufe
   **Veröffentlicht** bzw. **Abgelehnt** und klick **Zurücknehmen** — der vorherige
   Zustand wird wiederhergestellt.

---

## 7. Die Gründe („reasons") lesen

Jede Zeile zeigt, warum sie geprüft werden muss oder was fehlt:

| Grund | Bedeutung |
|---|---|
| **Zu prüfen markiert** | Wurde aktiv geflaggt |
| **Offene Feld-Prüfung** | Ein KI-Vorschlag (z. B. LGBTQ+-Verbindung) wartet auf Freigabe |
| **Kein Bild** | Bild fehlt |
| **Keine Bio** | Keine ausreichende Beschreibung |
| **Relevanz < 0,7** | LGBTQ+-Bezug zu schwach für Auto-Freigabe |
| **Kein Wikidata** | Keine echte Wikidata-ID |
| **Duplikat** | Zeigt auf eine andere Person |
| **Nicht-Person** | Als Organisation/Team eingestuft (gesperrt) |

Faustregel: Gründe wie *Kein Bild* / *Keine Bio* sind **behebbar** (anreichern, dann
freigeben). Gründe wie *Nicht-Person* / *Duplikat* bedeuten **nicht freigeben**.

---

## 8. Häufige Fragen

**Muss ich jede Person einzeln freigeben?**
Nein. Nur die auf **In Prüfung**. Sichere Personen laufen automatisch (Stufe
Freigabe bereit).

**Ist Ablehnen endgültig?**
Nein — reversibel über **Zurücknehmen**. Nichts wird gelöscht, nur archiviert.

**Warum ist eine Person grün, aber nicht öffentlich?**
Grün „Freigabe bereit" heißt: erfüllt die Kriterien, wird bei nächster Nacht-Runde
veröffentlicht. Erst „Veröffentlicht" ist tatsächlich online.

**Ich sehe ein Schloss am Freigeben-Knopf — was heißt das?**
Das Auto-Gate ist nicht erfüllt (etwas fehlt). Du kannst trotzdem freigeben, musst
den Override aber bewusst bestätigen.

**Kann ich eine Adult-Person hier freigeben?**
Nein — die reguläre Freigabe verweigert das. Adult-Profile laufen über den separaten
**Consent-Pfad** (eigener Abschnitt weiter unten auf derselben Seite).

---

## 9. Für Technik-Interessierte (optional)

- **Admin-Oberfläche:** `/admin/content/personality-quality`
  (Funnel + Freigabe-Queue + Qualitäts-Panel + Feld-Review).
- **Stufen** werden aus vorhandenen Feldern abgeleitet (`visibility`,
  `review_status`, `needs_attention`, `duplicate_of_id` + Auto-Gate). Keine neue
  Spalte.
- **Aktionen** (Datenbank-Funktionen):
  `freigabe_personality` (Freigeben, mit Guards),
  `reject_personality_capture` (Ablehnen),
  `unfreigabe_personality` (Zurücknehmen),
  `personality_freigabe_funnel` (Zähler),
  `personalities_freigabe_queue` (Arbeitsliste).
- **Automatik:** nächtlicher Lauf `run_personality_auto_promote` (03:50) über das
  Auto-Gate `personalities_promotable`.

---

*Fragen oder Änderungswünsche an der Oberfläche? → im Team melden.*
