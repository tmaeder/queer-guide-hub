import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991789915000_retire_awin_marketplace_dag_node.sql'),
  'utf8',
);
const healthCheck = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');
const newsChainRepair = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991789915010_prevent_news_duplicate_chains.sql'),
  'utf8',
);

describe('AWIN DAG retirement', () => {
  it('removes the source node and every attached edge while preserving the dedicated automation', () => {
    expect(migration).toMatch(/n->>'id' <> 'src-awin'/);
    expect(migration).toMatch(/e->>'source' <> 'src-awin'/);
    expect(migration).toMatch(/e->>'target' <> 'src-awin'/);
    expect(migration).toMatch(/slug = 'mp_fill_awin'/);
  });

  it('documents the repaired disposition instead of accepting an unfixed caller', () => {
    const awinDisposition = healthCheck.slice(
      healthCheck.indexOf('awin:'),
      healthCheck.indexOf('\n    }', healthCheck.indexOf('awin:')),
    );
    expect(awinDisposition).toContain('RETIRED FROM THE DAG 2026-09-20');
    expect(awinDisposition).not.toContain('UNFIXED');
  });

  it('prevents news duplicate chains and records enough state to undo the reparenting', () => {
    expect(newsChainRepair).toMatch(/where duplicate_of_id = p_drop_id and id <> p_keep_id/);
    expect(newsChainRepair).toContain("jsonb_build_object('news_dup_children', v_ids)");
    expect(newsChainRepair).toContain("v_moved->'news_dup_children'");
    expect(newsChainRepair).toContain("collapse_entity_dup_chains('news')");
  });
});
