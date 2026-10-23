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
const INVARIANT_SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261023192718_foursquare_quarantine_invariant.sql'),
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

  it('prevents later automation from approving provider-only venues', () => {
    expect(INVARIANT_SQL).toContain('guard_foursquare_provider_only_publication');
    expect(INVARIANT_SQL).toContain('before insert or update on public.venues');
    expect(INVARIANT_SQL).toContain("new.review_status = 'approved'");
    expect(INVARIANT_SQL).toContain("new.review_status := 'archived'");
    expect(INVARIANT_SQL).toContain(
      "lower(new.verification_source) not in ('foursquare', 'foursquare_os')",
    );
    expect(INVARIANT_SQL).toContain("new.verification_evidence, '{}'::jsonb");
  });

  it('keeps review health independent from transient queue lifecycle', () => {
    const health = INVARIANT_SQL.slice(
      INVARIANT_SQL.indexOf('create or replace function public.foursquare_data_health'),
    );
    expect(health).toContain('count(distinct s.target_record_id)');
    expect(health).not.toContain('join public.review_queue');
    expect(INVARIANT_SQL).toContain("select 'venue', v.id, 'foursquare_independent_corroboration'");
    expect(INVARIANT_SQL).toContain('uq_review_queue_foursquare_corroboration_pending');
  });
});
