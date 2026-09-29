import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the change that turned `coord_unswept` from a number that could never move
// into a real, self-draining work list.
//
// 99991790359075 shipped `city_wikidata_signals().coord_unswept`, counted from
// `enrichment_status.wikidata_link.coord_swept_at`. NOTHING EVER WROTE THAT KEY —
// measured on prod, 0 of 3,032 rows — so the metric read 3,031 forever, which is
// indistinguishable from "nothing is verified" whether or not anything is, and the
// ~156 rows that genuinely hold another place's identifier were invisible inside it.
//
// Dry-run on prod in a rolled-back transaction: verify block passed, mutation-tested
// 3/3 (re-reporting the retired key, auto-clearing a held qid, stamping under a
// typo'd key are all caught).

const MIGRATION = '99991790619179_city_coord_verdict_persisted.sql';
const FN = 'supabase/functions/city-factual-backfill/index.ts';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const producer = readFileSync(join(process.cwd(), FN), 'utf8');

// Comment-stripped. This migration's header explains the key move, the exclusions and
// the self-draining predicate in prose, so a whole-file `toContain` would be
// satisfiable by the comments with the statement deleted.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const stmt = sql.split('do $verify$')[0];
const verify = sql.slice(sql.indexOf('do $verify$'));
// The function body, excluding the verify block, which echoes every key name.
const fnBody = stmt.slice(stmt.indexOf('create or replace function'));
const stampStmt = stmt.slice(0, stmt.indexOf('create or replace function'));

/** The statement that computes one counter, so an assertion cannot match a sibling. */
const intoStmt = (name: string) => {
  const i = fnBody.indexOf(`into ${name}`);
  if (i < 0) return '';
  return fnBody.slice(fnBody.lastIndexOf('select', i), fnBody.indexOf(';', i));
};

describe('the producer persists its coordinate verdict', () => {
  it('writes its OWN top-level key, not a sub-key of wikidata_link', () => {
    // `bumpMiss` and `markResolved` both REPLACE state.wikidata_link wholesale, so a
    // sub-key there is erased by the very next pass — which is exactly how the
    // original metric came to have no writer at all.
    expect(producer).toMatch(/state\.wikidata_coords\s*=/);
    expect(producer).not.toMatch(/wikidata_link\.coord/);
    expect(producer).not.toMatch(/coord_swept_at/);
  });

  it('stamps only a REACHED verdict, never `unchecked`', () => {
    // No P625 on the entity, or no coordinates on the row, is absence of evidence.
    // Recording it as a verdict is how 6,498 venues were written off as logo-less.
    const guard = producer.slice(
      producer.indexOf('state.wikidata_coords'),
      producer.indexOf('state.wikidata_coords') + 40,
    );
    expect(guard).not.toBe('');
    const before = producer.slice(0, producer.indexOf('state.wikidata_coords'));
    const cond = before.slice(before.lastIndexOf('if ('));
    expect(cond).toMatch(/geo\.verdict === 'agree'/);
    expect(cond).toMatch(/geo\.verdict === 'disagree'/);
    expect(cond).not.toMatch(/unchecked/);
  });

  it('does NOT auto-clear a held identifier on disagreement', () => {
    // Distance cannot tell a wrong IDENTIFIER from wrong COORDINATES. Burj Hammoud
    // sits at longitude exactly 0.000000, measures 3,264 km from an entity that is
    // genuinely its own, and an auto-clear would destroy a correct answer.
    const branch = producer.slice(
      producer.indexOf("cls.verdict === 'settlement' && geo.verdict === 'disagree'"),
      producer.indexOf("} else if (cls.verdict === 'settlement')"),
    );
    expect(branch).not.toBe('');
    expect(branch).toMatch(/needs_attention = true/);
    // It may null the LOCAL candidate (to refuse adoption) but must never write the
    // column.
    expect(branch).not.toMatch(/update\.wikidata_qid\s*=\s*null/);
  });

  it('flags only when the row already holds the very id that disagreed', () => {
    // Flagging on a refused ADOPTION would raise needs_attention on rows that never
    // held anything wrong.
    expect(producer).toMatch(/c\.wikidata_qid && c\.wikidata_qid === qid/);
  });

  it('does not publish from the vetoed entity\'s cached Wikipedia title', () => {
    const branch = producer.slice(
      producer.indexOf("cls.verdict === 'settlement' && geo.verdict === 'disagree'"),
      producer.indexOf("} else if (cls.verdict === 'settlement')"),
    );
    expect(branch).toMatch(/qid\s*=\s*null/);
    expect(branch).toMatch(/enwikiTitle\s*=\s*null/);
  });

  it('is shaped like capital_scope, the precedent for a probe finding', () => {
    const block = producer.slice(
      producer.indexOf('state.wikidata_coords'),
      producer.indexOf('state.wikidata_coords') + 340,
    );
    expect(block).toMatch(/state:\s*'resolved'/);
    expect(block).toMatch(/detail:\s*\{[^}]*verdict/);
    expect(block).toMatch(/km:\s*geo\.distanceKm/);
  });
});

describe('the one-shot stamp', () => {
  it('stamps the 156 measured disagreements and nothing wider', () => {
    const rows = stampStmt.match(/^\s{4}\('[^']*',\s*'Q\d+',\s*[\d.]+\)/gm) ?? [];
    expect(rows).toHaveLength(156);
    expect(stampStmt).toMatch(/'verdict',\s*'disagree'/);
  });

  it('records the distance, so a human can triage without re-querying Wikidata', () => {
    expect(stampStmt).toMatch(/'km',\s*v\.km/);
  });

  it('raises needs_attention but writes no identifier column', () => {
    expect(stampStmt).toMatch(/needs_attention = true/);
    expect(stampStmt).not.toMatch(/wikidata_qid\s*=\s*null/);
    expect(stampStmt).not.toMatch(/wikipedia_title\s*=\s*null/);
    expect(stampStmt).not.toMatch(/description\s*=\s*null/);
  });

  it('builds enrichment_status with || and never jsonb_set', () => {
    expect(stampStmt).not.toMatch(/jsonb_set/);
    expect(stampStmt).toMatch(/coalesce\(c\.enrichment_status,\s*'\{\}'::jsonb\)\s*\n?\s*\|\|/);
  });

  it('is soft on preconditions so a concurrent repair cannot abort db push', () => {
    expect(stampStmt).toMatch(/c\.wikidata_qid is not distinct from v\.qid/);
    expect(stampStmt).not.toMatch(/get diagnostics/);
  });
});

describe('the sentinel', () => {
  it('retires coord_unswept entirely', () => {
    expect(fnBody).not.toMatch(/coord_unswept/);
    // And refuses to let it come back.
    expect(verify).toMatch(/v \? 'coord_unswept'/);
  });

  it('counts coord_disagree SELF-DRAINING, scoped to the id the verdict was about', () => {
    // Without the second clause a row stays counted after a human clears the id, so
    // the work list could never reach zero and would be re-baselined away.
    const s = intoStmt('v_coord_disagree');
    expect(s).not.toBe('');
    expect(s).toMatch(/'wikidata_coords'->'detail'->>'verdict' = 'disagree'/);
    expect(s).toMatch(/wikidata_qid = enrichment_status->'wikidata_coords'->>'qid'/);
  });

  it('carries coord_checked, which tells a clean corpus from a stamp that never landed', () => {
    const s = intoStmt('v_coord_checked');
    expect(s).not.toBe('');
    expect(s).toMatch(/'verdict' is not null/);
    // It must NOT be scoped to disagreements, or it cannot serve as the control.
    expect(s).not.toMatch(/= 'disagree'/);
  });

  it('keeps the three zero-invariants', () => {
    for (const k of ['qid_regressed', 'wrong_title_back', 'retracted_desc_back']) {
      expect(fnBody).toContain(`'${k}'`);
      expect(verify).toMatch(new RegExp(`${k}'\\)::int <> 0`));
    }
  });

  it('never gates on the work list', () => {
    expect(verify).not.toMatch(/coord_disagree'\)::int\s*>\s*\d/);
  });

  it('revokes before granting', () => {
    for (const r of ['public', 'anon', 'authenticated']) {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.city_wikidata_signals\\(\\) from ${r}`),
      );
    }
    expect(sql).toMatch(
      /grant execute on function public\.city_wikidata_signals\(\) to service_role/,
    );
  });

  it('asserts the hand-excluded row keeps its correct identifier', () => {
    expect(verify).toContain("slug = 'burj-hammoud'");
    expect(verify).toContain("'Q895235'");
    expect(verify).toMatch(/v_burj\s*<>\s*1/);
  });
});

describe('the health script consumes the new keys', () => {
  const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');
  const cityBlock = (() => {
    const i = health.indexOf('rpc/city_wikidata_signals');
    return i < 0 ? '' : health.slice(i, health.indexOf('// 5b.', i));
  })();

  it('reports the work list and no longer reads the retired key', () => {
    expect(cityBlock).not.toBe('');
    expect(cityBlock).toContain('coord_disagree');
    expect(cityBlock).not.toContain('coord_unswept');
  });

  it('hard-fails when the stamp is not landing', () => {
    // A clean corpus and an absent stamp both give coord_disagree: 0.
    expect(cityBlock).toMatch(/coord_checked\s*\?\?\s*0\)\s*<\s*100/);
    const branch = cityBlock.slice(cityBlock.indexOf('coord_checked ?? 0'));
    expect(branch).toMatch(/FAILED\s*=\s*true/);
  });

  it('still only prints the work list, never gates on it', () => {
    expect(cityBlock).not.toMatch(/coord_disagree[^\n]*>\s*0\)\s*\{[\s\S]{0,80}FAILED/);
  });
});
