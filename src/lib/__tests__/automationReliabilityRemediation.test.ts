import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/99991794376266_automation_reliability_remediation.sql',
  'utf8',
);

describe('automation reliability remediation', () => {
  it('authenticates the watched URL cron with a bounded timeout', () => {
    expect(migration).toContain("where slug = 'refresh_watched_urls'");
    expect(migration).toContain("where name = 'internal_invoke_secret'");
    expect(migration).toContain('timeout_milliseconds := 55000');
  });

  it('tracks partial streaks independently from hard failures', () => {
    expect(migration).toContain('consecutive_partials integer not null default 0');
    expect(migration).toContain('consecutive_partials = consecutive_partials + 1');
    expect(migration).toContain('consecutive_partials = 0');
  });

  it('consolidates only the duplicate category resync lane', () => {
    expect(migration).toContain("where slug = 'tag_category_text_resync'");
    expect(migration).toContain("lifecycle_state = 'consolidated'");
    expect(migration).not.toMatch(
      /where slug = 'tag_category_resync'[\s\S]{0,200}lifecycle_state = 'consolidated'/,
    );
  });

  it('preserves feedback_auto_merge as an external-runner feature flag', () => {
    expect(migration).toContain(
      'Feature flag consumed by the local feedback runner; no cron or manual action is expected',
    );
    expect(migration).not.toMatch(/where slug = 'feedback_auto_merge'[\s\S]{0,120}enabled = false/);
  });
});
