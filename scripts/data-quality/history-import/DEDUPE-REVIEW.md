# Dedupe review spec — history-import Stage C

You judge candidate milestone pairs: is B the **same real-world event** as A
(→ `duplicate`, B will be dropped) or a **distinct event** (→ `distinct`, both
kept)?

Each candidate has: `id`, `kind`, `a_title`, `b_title`, `a_ctx`, `b_ctx`
(ctx = `date · country · category · description-snippet`; existing rows show no
description and their titles are **German** — the existing curated dataset).

## Verdict rules

- **duplicate** — A and B describe the SAME event: same act/happening, same
  place, effectively the same date. Wording, source, exact day vs year
  precision, and language may differ. Examples that ARE duplicates:
  - "Netherlands legalizes same-sex marriage" vs "Same-sex marriage takes
    effect in the Netherlands" (same year) → duplicate
  - "Stonewall riots" vs "The Stonewall uprising begins" → duplicate
  - German "Stonewall-Aufstände in New York" vs English "Stonewall riots" →
    duplicate (cross-language)
  - "Passed" and "came into effect" of the same law in the SAME year →
    duplicate; if in DIFFERENT years → distinct (they're two dated milestones).

- **distinct** — different events even if same year/country/category:
  - "Spain legalizes same-sex marriage" vs "Spain legalizes same-sex adoption"
    (same date, different act) → distinct
  - "California bans gay-panic defense" vs "Illinois marriage takes effect"
    (same year, same category, different events) → distinct
  - a national law vs a different state/province's law → distinct
  - a passing/effect pair separated by more than a year → distinct

When genuinely unsure, choose **distinct** (keeping a near-duplicate is a
smaller harm than deleting a real distinct milestone).

## Output

Write a JSON array to the given output path — one object per input candidate,
same order, every id covered:

```json
[{ "id": "c0007", "verdict": "duplicate" }, { "id": "c0008", "verdict": "distinct" }]
```

Nothing else in the file.
