import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20261001205743_foursquare_quarantine_public_visibility.sql',
  ),
  'utf8',
);

describe('Foursquare quarantine public visibility', () => {
  it('archives only unresolved provider-only discoveries while retaining attention state', () => {
    expect(SQL).toContain("s.source_name in ('foursquare', 'foursquare_os')");
    expect(SQL).toContain("q.review_type = 'foursquare_independent_corroboration'");
    expect(SQL).toContain("q.status = 'pending'");
    expect(SQL).toContain("s.normalized_data #>> '{metadata,requires_editorial_review}' = 'true'");
    expect(SQL).toContain("set review_status = 'archived'");
    expect(SQL).toContain('needs_attention = true');
    expect(SQL).toContain("v.review_status = 'pending'");
  });
});
