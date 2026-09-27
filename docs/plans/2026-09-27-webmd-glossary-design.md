# WebMD sex and relationship glossary pass

## Goal

Compare the seventeen supplied WebMD articles with the glossary's final migrated state, improve existing entries only where the comparison exposes a concrete defect or omission, and create genuinely missing canonical concepts.

## Editorial approach

Use a conservative, concept-led pass rather than mirroring one glossary page per article. WebMD is an input to the audit, not the glossary's information architecture.

- Retain and improve established anatomy, masturbation, erectile-function, sperm/semen, STI, and safer-sex entries where needed.
- Consider new canonical entries for sexual response cycle, refractory period, vaginal self-exam, fear of intimacy, commitment phobia, possessiveness, and the PDE5-inhibitor drug class.
- Do not create broad or misleading umbrella entries for “sex and health,” “male reproductive system,” “female reproductive system,” or “risky sex.”
- Prefer anatomy-first, trans-inclusive wording over WebMD's binary gender framing.
- Describe specific acts, transmission routes, and protections rather than labelling people or whole classes of sex as risky.
- Treat fear of intimacy and commitment phobia as descriptive, non-diagnostic terms. Frame possessiveness around autonomy and safety without diagnosing a partner.

## Data changes

Implement the pass as a new, forward-only Supabase migration. All updates to existing rows will be content-guarded so later or concurrent editorial improvements are preserved. New rows will be active but non-indexable until the repository's existing publication-readiness process approves them, with all category representations kept consistent.

Clinical or safety claims will have reference records. WebMD may be recorded as the supplied secondary source; consequential claims will be checked against suitable authoritative sources already used by the repository or newly added for the concept.

## Verification

Add a focused Vitest regression file that checks the executable SQL rather than relying on comments. It will cover:

- guarded updates and duplicate/alias protection;
- active, reviewed, non-indexable creation state;
- agreement among category ID, category text, and primary category assignment;
- inclusive and non-diagnostic wording;
- source coverage for medical and safety-sensitive concepts;
- explicit refusal to create the rejected umbrella terms;
- positive postconditions proving the reached state.
