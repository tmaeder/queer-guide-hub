import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards 99991789851492 + 99991789851494 — ROUND EIGHTEEN.
 *
 * A band headed "Diagnostic codes" published SNOMED geography (Australia, Spain,
 * California), SNOMED occupations (nurse, medical doctor, jurist,
 * anthropologist), a SNOMED kinship relation (nephew), ICD-11 object/place
 * extension codes (jockstrap, prison) and the ICPC-2 social chapter (poverty) —
 * fifteen tags, eight of them indexable. Every identifier is CORRECT; the code
 * systems simply are not diagnosis-only vocabularies.
 *
 * Two identifiers were genuinely wrong and are repaired in the sibling:
 * justice -> Q16533 (judge) and infidelity -> Q157833 (embezzlement), the
 * latter publishing "Infidelity, also known as embezzlement" as its body.
 */

const GATE = 'supabase/migrations/99991789851492_tag_medical_codes_nonclinical_entities.sql';
const WRONG = 'supabase/migrations/99991789851494_tag_justice_infidelity_wrong_entity.sql';
const HEALTH = 'scripts/check-pipeline-health.mjs';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** Source with `--` comment lines removed, so no guard can be satisfied by the
 *  header prose that describes it. Line-anchored: a mid-line `--` inside a
 *  string literal is not a comment. */
const strip = (s: string) =>
  s
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const gate = strip(read(GATE));
const wrong = strip(read(WRONG));

/** Statements vs postconditions, kept apart: every defect string appears in
 *  BOTH an UPDATE's content guard and the verify block, so an assertion over
 *  the whole file passes while the half it is about has been gutted. */
const gateStatements = gate.slice(0, gate.indexOf('do $verify$'));
const gateVerify = gate.slice(gate.indexOf('do $verify$'));
const wrongStatements = wrong.slice(0, wrong.indexOf('do $verify$'));
const wrongVerify = wrong.slice(wrong.indexOf('do $verify$'));

/** The vocabulary function alone. */
const verdictFn = gateStatements.slice(
  gateStatements.indexOf('function public.medical_code_entity_class_verdict'),
  gateStatements.indexOf('create table if not exists public.tag_entity_class_probe'),
);

/** The recurring reaper alone. */
const reaper = gateStatements.slice(
  gateStatements.indexOf('function public.run_tag_medical_codes_reap_nonclinical'),
  gateStatements.indexOf('create or replace function public.tag_medical_code_signals'),
);

const health = read(HEALTH);

describe('the class vocabulary', () => {
  it('tests CLINICAL before the denylist — the order IS the override', () => {
    const clinicalAt = verdictFn.indexOf("then 'clinical'");
    const refusedAt = verdictFn.indexOf("then 'refused'");
    expect(clinicalAt).toBeGreaterThan(-1);
    expect(refusedAt).toBeGreaterThan(-1);
    // `substance abuse` carries `social issue` AND `type of disease`. If the
    // deny arm ran first it would lose its real ICD codes.
    expect(clinicalAt).toBeLessThan(refusedAt);
  });

  it('falls through to unknown, never to refused', () => {
    // A denylist. An unrecognised class must be ALLOWED: over-refusal deletes a
    // real clinical code from a health page, under-refusal leaves one odd row.
    expect(verdictFn).toMatch(/else\s+'unknown'\s*\n?\s*end;/);
    expect(verdictFn).not.toMatch(/else\s+'refused'/);
  });

  it('treats a null or empty class list as unknown', () => {
    expect(verdictFn).toMatch(/p_classes is null or cardinality\(p_classes\) = 0 then 'unknown'/);
  });

  it('carries the classes that produced the measured fifteen', () => {
    for (const qid of [
      'Q6256', // country            -> australia, south-africa, espana, estonia
      'Q35657', // U.S. state         -> california
      'Q5107', // continent          -> south-america
      'Q41176', // building           -> bakery
      'Q11460', // clothing           -> jockstrap
      'Q137864285', // prison facility     -> prison
      'Q12737077', // occupation         -> nurses, doctor
      'Q15987302', // legal profession   -> jurist, justice
      'Q28640', // profession         -> anthropologist
      'Q171318', // kinship            -> nephew
      'Q1920219', // social issue       -> poverty
    ]) {
      expect(verdictFn).toContain(`'${qid}'`);
    }
  });

  it('carries the clinical classes that rescue the two false positives', () => {
    // substance abuse (Q3184856) and substance dependence (Q3378593) are classed
    // `social issue` and would be refused without these.
    expect(verdictFn).toContain("'Q112193867'"); // type of disease
    expect(verdictFn).toContain("'Q2057971'"); // health problem
  });

  it('does NOT carry a crime class', () => {
    // Measured and rejected: this platform documents spiking, sexual-assault
    // and stealthing, and an abuse concept that legitimately carries an ICD
    // code is classed a crime with no clinical sibling. Under-reaching is the
    // correct error. Q157833 (embezzlement) is handled as a WRONG IDENTIFIER.
    for (const qid of ['Q83267', 'Q130583773', 'Q5449702', 'Q1456832']) {
      expect(verdictFn).not.toContain(`'${qid}'`);
    }
  });

  it('is IMMUTABLE so it can be used in a stored verdict and a delete predicate', () => {
    expect(verdictFn).toMatch(/language sql\s*\n\s*immutable/);
  });
});

describe('the recurring reaper', () => {
  it('only reaps entities it fetched successfully this run', () => {
    // A chunk that failed contributes no _cls rows, so its tags keep their
    // codes. A Wikidata outage must retract nothing.
    expect(reaper).toMatch(/join _cls c on c\.qid = t\.wikidata_id/);
    expect(reaper).toMatch(
      /if v_raw is null then v_fetch_errors := v_fetch_errors \+ 1; continue; end if;|v_raw is null then[\s\S]{0,120}continue;/,
    );
  });

  it('refuses to record a `missing` entity as having no classes', () => {
    // Absence of evidence recorded as evidence of absence is how 6,498 venues
    // were written off when logo.dev's token was dead.
    expect(reaper).toContain("where not (e.value ? 'missing')");
  });

  it('exempts the editorial lane in BOTH the work list and the delete', () => {
    // Asserted by COUNT. The exemption appears twice — once building _want and
    // once in the delete — so matching it once is satisfied by the surviving
    // copy while the delete has lost it (the haversine-cast rule).
    expect((reaper.match(/m\.source is distinct from 'editorial'/g) ?? []).length).toBe(2);
    const del = reaper.slice(reaper.indexOf('with doomed as ('));
    expect(del).toContain("m.source is distinct from 'editorial'");
  });

  it('deletes only on a `refused` verdict', () => {
    expect(reaper).toMatch(/medical_code_entity_class_verdict\(c\.classes\) = 'refused'/);
    expect(reaper).not.toMatch(/medical_code_entity_class_verdict\(c\.classes\) <> 'clinical'/);
  });

  it('reports fetch errors and the vocabulary gap, so silence is not success', () => {
    // Whitespace-tolerant: the return object is column-aligned, so a literal
    // single space is an assertion about formatting rather than about content.
    expect(reaper).toMatch(/'fetch_errors',\s*v_fetch_errors/);
    expect(reaper).toContain("'unknown_classes'");
    expect(reaper).toMatch(/'refused',\s*coalesce\(v_refused/);
  });

  it('is service_role only', () => {
    expect(gateStatements).toMatch(
      /revoke all on function public\.run_tag_medical_codes_reap_nonclinical\(integer\) from public, anon, authenticated;/,
    );
    expect(gateStatements).toMatch(
      /grant execute on function public\.run_tag_medical_codes_reap_nonclinical\(integer\) to service_role;/,
    );
  });
});

describe('the seed and the one-shot repair', () => {
  it('casts the VALUES literal to text[] explicitly', () => {
    // A bare '{...}' in a VALUES list resolves to `text`, not `text[]`, so the
    // verdict call fails 42883 and aborts the whole push. Found by dry-running
    // the seed on prod, not by reading it.
    expect(gateStatements).toContain('s.classes::text[]');
    expect(gateStatements).toContain('public.medical_code_entity_class_verdict(s.classes::text[])');
  });

  it('seeds every code-bearing entity, so the invariant has coverage from day one', () => {
    const seeded = (gateStatements.match(/\n\s{4}\('Q\d+','\{/g) ?? []).length;
    expect(seeded).toBeGreaterThanOrEqual(130);
  });

  it('drives the deletion from the verdict function, never from a slug list', () => {
    const del = gateStatements.slice(
      gateStatements.indexOf('delete from public.tag_medical_codes m'),
    );
    expect(del).toContain("medical_code_entity_class_verdict(p.classes) = 'refused'");
    // If the vocabulary is wrong the seeded rows do not refuse and this deletes
    // nothing — the self-check a frozen id list cannot give.
    expect(del).not.toMatch(/t\.slug in \(/);
    expect(del).not.toMatch(/m\.code in \(/);
  });

  it('never writes to tag_wikidata_repair_audit', () => {
    // That table is the INPUT to tag_disowned_prose_signals(); a row there would
    // perturb a live metric to record what these files already record.
    expect(gate).not.toContain('insert into public.tag_wikidata_repair_audit');
    expect(wrong).not.toContain('insert into public.tag_wikidata_repair_audit');
  });
});

describe('the cron', () => {
  it('chains sync then BOTH reapers, on the original schedule', () => {
    const cron = gateStatements.slice(gateStatements.indexOf('select cron.schedule('));
    expect(cron).toContain('run_tag_medical_codes_sync()');
    // Round seventeen's reaper is restated so this rewrite cannot drop it.
    expect(cron).toContain('run_tag_medical_codes_reap_orphans()');
    expect(cron).toContain('run_tag_medical_codes_reap_nonclinical()');
    expect(cron).toContain("'30 5 * * 1'");
  });
});

describe('the sentinel', () => {
  it('reports coverage separately from the invariant', () => {
    // nonclinical_code_rows = 0 over an unprobed corpus is vacuous, not clean.
    expect(gateStatements).toContain("'nonclinical_code_rows'");
    expect(gateStatements).toContain("'unprobed_qids'");
    expect(gateStatements).toContain("'probe_rows'");
    expect(gateStatements).toContain("'unknown_verdict_qids'");
  });

  it("keeps round seventeen's orphan keys", () => {
    expect(gateStatements).toContain("'orphan_code_rows'");
    expect(gateStatements).toContain("'orphan_examples'");
    expect(gateStatements).toContain("'editorial_rows'");
  });

  it('is service_role only', () => {
    expect(gateStatements).toMatch(
      /revoke all on function public\.tag_medical_code_signals\(\) from public, anon, authenticated;/,
    );
  });
});

describe('the gate migration postconditions', () => {
  it("asserts the verdict function's own behaviour, in both orders", () => {
    expect(gateVerify).toContain("array['Q1920219', 'Q112193867']");
    expect(gateVerify).toContain("array['Q112193867', 'Q1920219']");
  });

  it('names the fifteen bands plus justice, rather than counting them', () => {
    for (const slug of [
      'anthropologist',
      'australia',
      'bakery',
      'california',
      'doctor',
      'espana',
      'estonia',
      'jockstrap',
      'jurist',
      'justice',
      'nephew',
      'nurses',
      'poverty',
      'prison',
      'south-africa',
      'south-america',
    ]) {
      expect(gateVerify).toContain(`'${slug}'`);
    }
  });

  it('asserts the MIRROR — the clinical override kept its rescued rows', () => {
    // Without this, turning the gate into a blanket deny on `social issue`
    // passes every "zero non-clinical rows" check above.
    expect(gateVerify).toContain("'Q3184856'");
    expect(gateVerify).toContain("'Q3378593'");
  });

  it('asserts the corpus survived and the sentinel has coverage', () => {
    expect(gateVerify).toMatch(/v_healthy < 370/);
    expect(gateVerify).toMatch(/unprobed_qids/);
    expect(gateVerify).toMatch(/probe_rows/);
  });

  it('does not loosen any comparison', () => {
    expect(gateVerify).not.toMatch(/if v_bad < 0/);
    expect(gateVerify).not.toMatch(/\bwhere false\b/);
  });
});

describe('the wrong-entity sibling', () => {
  it('nulls both identifiers and never repoints them', () => {
    expect(wrongStatements).toMatch(/set wikidata_id\s+= null,\s*\n\s*wikipedia_url\s+= null/);
    // A plausible-but-wrong QID regenerates wrong data weekly; a null one
    // regenerates nothing.
    expect(wrongStatements).not.toMatch(/set wikidata_id\s*=\s*'Q/);
    expect(wrongStatements).not.toMatch(/wikipedia_url\s*=\s*'http/);
  });

  it('content-guards each UPDATE on the text it removes', () => {
    const justice = wrongStatements.slice(
      wrongStatements.indexOf("where slug = 'justice'"),
      wrongStatements.indexOf("where slug = 'infidelity'"),
    );
    expect(justice).toContain("short_description ilike '%presiding over court proceedings%'");
    const infidelity = wrongStatements.slice(wrongStatements.indexOf("where slug = 'infidelity'"));
    expect(infidelity).toContain("short_description ilike '%theft of entrusted assets%'");
  });

  it('REPLACES the summary and NULLS the body', () => {
    // Both rows are active and rendering, so nulling the summary would leave a
    // live page thinner instead of correct. The body goes because each row's
    // description is one line — enough to state what the tag is, not enough to
    // write a body from, and minting one is the guess this class came from.
    expect(wrongStatements).toContain(
      "short_description = 'Fair treatment, and what people are owed.'",
    );
    expect(wrongStatements).toContain(
      "short_description = 'A kink built on the fantasy or consensual enactment of unfaithfulness.'",
    );
    expect((wrongStatements.match(/long_description = null/g) ?? []).length).toBe(2);
  });

  it('declares an attributed actor — load-bearing for the human_reviewed row', () => {
    // infidelity is human_reviewed; verified live, an undeclared write returns
    // "cannot be modified by system:trigger".
    expect(wrongStatements).toMatch(/set_config\('app\.actor', 'migration:99991789851494/);
  });

  it("lets round seventeen's reaper remove the codes rather than deleting them by hand", () => {
    expect(wrongStatements).toContain('select public.run_tag_medical_codes_reap_orphans();');
    expect(wrongStatements).not.toContain('delete from public.tag_medical_codes');
  });

  it('asserts the reached state, and that the rows stay publishable', () => {
    expect(wrongVerify).toContain('tag_has_prose(description, short_description)');
    expect(wrongVerify).toMatch(/still carries a wrong identifier/);
    expect(wrongVerify).toMatch(/still publishes a wrong-subject body/);
    expect(wrongVerify).toMatch(/lost the description that is the evidence/);
  });

  it('asserts the wrong SUBJECT is gone, tested on the text rather than on its own wording', () => {
    expect(wrongVerify).toContain("ilike '%presiding over court%'");
    expect(wrongVerify).toContain("ilike '%entrusted assets%'");
    expect(wrongVerify).toContain("ilike '%embezzlement%'");
    expect(wrongVerify).toContain("ilike '%judicial panel%'");
  });

  it('asserts the MIRROR — two identifiers nulled did not take the corpus', () => {
    expect(wrongVerify).toMatch(/v_bad < 1500/);
    expect(wrongVerify).toMatch(/code_rows_total.*370|370/s);
  });
});

describe('the health gate', () => {
  /** One `} else if (` branch of the round-eighteen block, sliced by structure
   *  rather than by a character budget — a distance bound silently passes when
   *  a message grows and silently fails when it shrinks. */
  const branch = (head: string) => {
    const block = health.slice(health.indexOf("if (!('nonclinical_code_rows' in mc))"));
    const from = block.indexOf(head);
    expect(from).toBeGreaterThan(-1);
    const rest = block.slice(from);
    const to = rest.indexOf('} else');
    return to === -1 ? rest : rest.slice(0, to);
  };

  it('reads the non-clinical invariant and hard-fails on it', () => {
    expect(health).toContain('nonclinical_code_rows');
    expect(branch('nonclinical > 0')).toContain('FAILED = true');
  });

  it('hard-fails on an EMPTY probe rather than reading it as clean', () => {
    expect(branch('probeRows === 0')).toContain('FAILED = true');
  });

  it('only WARNS on incomplete coverage — that is a schedule gap, not a defect', () => {
    const b = branch('unprobed > 0');
    expect(b).toContain('console.warn');
    expect(b).not.toContain('FAILED = true');
  });

  it('warns rather than fails when the key is absent', () => {
    // The nightly run checks out main and calls the LIVE backend, so a hard
    // fail here would be red for an unapplied migration, not for a defect.
    const block = health.slice(health.indexOf("if (!('nonclinical_code_rows' in mc))"));
    const firstBranch = block.slice(0, block.indexOf('} else {'));
    expect(firstBranch).toContain('console.warn');
    expect(firstBranch).not.toContain('FAILED = true');
  });
});
