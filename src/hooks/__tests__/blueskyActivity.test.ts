import { beforeEach, describe, expect, it, vi } from 'vitest';

const identity = vi.fn();
const rpc = vi.fn();
const write = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ maybeSingle: () => identity() }) }),
    rpc: (...a: unknown[]) => rpc(...a),
  },
}));
vi.mock('@/lib/atprotoClient', async (orig) => ({
  ...(await orig<typeof import('@/lib/atprotoClient')>()),
  writeActivityRecord: (...a: unknown[]) => write(...a),
}));

import { mirrorActivity, mirrorRsvp } from '../blueskyActivity';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  identity.mockReset();
  rpc.mockReset();
  write.mockReset();
});

describe('mirrorActivity', () => {
  it('writes nothing unless the user opted in', async () => {
    identity.mockResolvedValue({ data: { did: 'did:plc:a', publish_activity: false } });
    mirrorActivity({ kind: 'save', entityType: 'venue', entityId: 'v1' });
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('writes nothing when the server gate refuses the subject', async () => {
    identity.mockResolvedValue({ data: { did: 'did:plc:a', publish_activity: true } });
    rpc.mockResolvedValue({ data: null });
    mirrorActivity({ kind: 'checkin', entityType: 'venue', entityId: 'v1' });
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    await flush();
    expect(rpc).toHaveBeenCalledWith('bluesky_activity_subject', {
      p_entity_type: 'venue',
      p_entity_id: 'v1',
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('writes the record when opted in and allowed', async () => {
    identity.mockResolvedValue({ data: { did: 'did:plc:a', publish_activity: true } });
    rpc.mockResolvedValue({ data: { uri: 'https://queer.guide/venues/x', title: 'X' } });
    mirrorActivity({ kind: 'review', entityType: 'venue', entityId: 'v1', rating: 5 });
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    expect(write).toHaveBeenCalledWith(
      'did:plc:a',
      'review',
      'venue',
      'v1',
      expect.objectContaining({ $type: 'guide.queer.review', rating: 5 }),
    );
  });

  it('a removal deletes without consulting the gate', async () => {
    identity.mockResolvedValue({ data: { did: 'did:plc:a', publish_activity: true } });
    mirrorRsvp('e1', 'not_going');
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    expect(rpc).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith('did:plc:a', 'rsvp', 'event', 'e1', null);
  });

  it('never throws into the caller', async () => {
    identity.mockRejectedValue(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      mirrorActivity({ kind: 'save', entityType: 'city', entityId: 'c1' }),
    ).not.toThrow();
    await flush();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
