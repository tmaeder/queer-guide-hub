import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/99991789934000_production_quality_closeout.sql'),
  'utf8',
);
const alertFollowupSql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/99991789934001_mark_prefixed_inbox_alert_read.sql'),
  'utf8',
);

describe('production quality closeout migration', () => {
  it('grants only the missing messaging presence columns, never table-wide profile reads', () => {
    expect(sql).toMatch(/grant select \(vibe_emoji, vibe_text, vibe_expires_at\)/i);
    expect(sql).not.toMatch(/grant select on (?:table )?public\.profiles/i);
    expect(sql).toMatch(/has_table_privilege[\s\S]*raise exception/i);
  });

  it('marks only alerts owned by the authenticated caller', () => {
    expect(sql).toContain('mark_inbox_alert_read');
    expect(sql.match(/user_id = auth\.uid\(\)/g)).toHaveLength(2);
  });

  it('unwraps the namespaced ids returned by the inbox feed', () => {
    expect(alertFollowupSql).toMatch(
      /drop function if exists public\.mark_inbox_alert_read\(uuid\)/i,
    );
    expect(alertFollowupSql).toMatch(/mark_inbox_alert_read\(p_item text\)/i);
    expect(alertFollowupSql).toContain("p_item like 'notif\\_%'");
    expect(alertFollowupSql).toContain("p_item like 'group\\_%'");
    expect(alertFollowupSql.match(/user_id = auth\.uid\(\)/g)).toHaveLength(2);
  });

  it('reconciles category ids per row and verifies the drift is empty', () => {
    const body =
      sql.match(
        /create or replace function public\.run_tag_category_resync[\s\S]*?\$function\$;/i,
      )?.[0] ?? '';
    expect(body).toMatch(/for r in[\s\S]*update public\.unified_tags/i);
    expect(body).toMatch(/set category_id = r\.category_id/i);
    expect(sql).toMatch(/tag category_id mirrors remain empty/i);
  });
});
