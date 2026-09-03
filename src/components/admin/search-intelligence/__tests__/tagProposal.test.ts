import { describe, it, expect } from 'vitest';
import { parseTagProposal } from '../tagProposal';

describe('parseTagProposal', () => {
  const base = { suggestion_type: 'tag', entity_id: null, proposed_value: { name: 'Bühne' } };

  it('accepts a tag suggestion with no entity', () => {
    expect(parseTagProposal(base)?.name).toBe('Bühne');
  });

  it('rejects a tag suggestion that DOES carry an entity (the assign-to-entity shape)', () => {
    expect(parseTagProposal({ ...base, entity_id: 'e-1' })).toBeNull();
  });

  it('rejects other suggestion types', () => {
    expect(parseTagProposal({ ...base, suggestion_type: 'synonym' })).toBeNull();
  });

  it('normalizes seen_in whether the producer wrote an array or a joined string', () => {
    expect(
      parseTagProposal({
        ...base,
        proposed_value: { name: 'X', seen_in: ['events', 'venues'] },
      })?.seenIn,
    ).toEqual(['events', 'venues']);
    expect(
      parseTagProposal({
        ...base,
        proposed_value: { name: 'X', seen_in: 'events, venues' },
      })?.seenIn,
    ).toEqual(['events', 'venues']);
  });

  it('survives a malformed collides_with instead of rendering a half-warning', () => {
    expect(
      parseTagProposal({
        ...base,
        proposed_value: { name: 'X', collides_with: { kind: 'nonsense' } },
      })?.collidesWith,
    ).toBeNull();
  });
});
