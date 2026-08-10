import { describe, it, expect } from 'vitest';
import { RIGHT_TOPICS } from '../rightsCatalog';
import { RIGHTS_SELECT_COLUMNS } from '@/hooks/useIntentData';

/**
 * useIntentData deliberately does NOT import rightsCatalog — doing so dragged
 * its 14 lucide icon modules into every intent page and pushed the full-router
 * test past its timeout. This test restores the guarantee the import gave:
 * add a right to the catalog without adding its column here and /rights will
 * silently under-report it forever, because the column is simply never fetched.
 */
describe('rights select stays in step with the catalog', () => {
  // Guards the WIDE select (useAllCountriesRightsFull). The narrow one is
  // deliberately smaller — /travel and /rights/sources must not pay for the
  // 22-column payload — so it is not checked here.
  const selected = new Set(RIGHTS_SELECT_COLUMNS.split(',').map((c) => c.trim()));

  it('fetches every column named by RIGHT_TOPICS', () => {
    const missing = [...new Set(RIGHT_TOPICS.map((t) => t.column))].filter(
      (c) => !selected.has(c),
    );
    expect(missing, `not fetched, so /rights cannot count them: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not fetch rights columns no topic asks for', () => {
    const known = new Set(RIGHT_TOPICS.map((t) => t.column));
    const extra = [...selected].filter((c) => c.startsWith('lgbti_') && !known.has(c));
    expect(extra, `fetched but unused: ${extra.join(', ')}`).toEqual([]);
  });
});
