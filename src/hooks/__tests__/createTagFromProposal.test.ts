import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
const single = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: unknown) => {
        insert(table, row);
        return { select: () => ({ single }) };
      },
    }),
  },
}));

import { createTagFromProposal } from '../useSearchIntelligence';

beforeEach(() => {
  vi.clearAllMocks();
  single.mockResolvedValue({
    data: { id: 'tag-1', name: 'Bühne', slug: 'buhne' },
    error: null,
  });
});

describe('createTagFromProposal', () => {
  it('inserts into unified_tags with ONLY the name', async () => {
    await createTagFromProposal('Bühne');
    expect(insert).toHaveBeenCalledTimes(1);
    const [table, row] = insert.mock.calls[0];
    expect(table).toBe('unified_tags');
    // Exact equality, not a subset check: the whole point is what is ABSENT.
    expect(row).toEqual({ name: 'Bühne' });
  });

  it('never sends a slug — the DB derives it, and a caller slug beats the 20261128100000 seal', async () => {
    await createTagFromProposal('Bühne');
    expect(Object.keys(insert.mock.calls[0][1])).not.toContain('slug');
  });

  it("never sends a status — it defaults to 'active'; writing it is how deprecated tags get resurrected", async () => {
    await createTagFromProposal('Bühne');
    expect(Object.keys(insert.mock.calls[0][1])).not.toContain('status');
  });

  it('trims the name', async () => {
    await createTagFromProposal('  Bühne  ');
    expect(insert.mock.calls[0][1]).toEqual({ name: 'Bühne' });
  });

  it('refuses a blank name without touching the table', async () => {
    const res = await createTagFromProposal('   ');
    expect(res).toEqual({ success: false, error: 'proposal has no name' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('surfaces a DB error instead of reporting success', async () => {
    single.mockResolvedValue({ data: null, error: { message: 'duplicate key value' } });
    expect(await createTagFromProposal('Bühne')).toEqual({
      success: false,
      error: 'duplicate key value',
    });
  });

  it('returns the row the database actually created', async () => {
    const res = await createTagFromProposal('Bühne');
    expect(res).toEqual({ success: true, data: { id: 'tag-1', name: 'Bühne', slug: 'buhne' } });
  });
});
