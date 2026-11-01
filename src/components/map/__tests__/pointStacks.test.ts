import { describe, it, expect } from 'vitest';
import { collapseColocated } from '@/components/map/pointStacks';

const f = (id: string, lng: number, lat: number, extra: Record<string, unknown> = {}) => ({
  geometry: { coordinates: [lng, lat] },
  properties: { id, ...extra },
});

describe('collapseColocated', () => {
  it('leaves places at distinct spots alone, each with stack_count 1', () => {
    const { features, members } = collapseColocated([f('a', 8.54, 47.37), f('b', 8.55, 47.37)]);
    expect(features.map((x) => x.properties.stack_count)).toEqual([1, 1]);
    expect(members.size).toBe(0);
  });

  it('collapses one exact spot into one feature that counts every place', () => {
    const stack = Array.from({ length: 88 }, (_, i) => f(`p${i}`, 13.405, 52.52));
    const { features, members } = collapseColocated([...stack, f('far', 13.5, 52.5)]);
    expect(features).toHaveLength(2);
    const rep = features.find((x) => x.properties.stack_count === 88)!;
    expect(members.get(rep.properties.id)).toHaveLength(88);
  });

  it('picks a featured, then live, place to represent the stack', () => {
    const { features } = collapseColocated([
      f('a', 1, 1),
      f('b', 1, 1, { live: true }),
      f('c', 1, 1, { featured: true }),
    ]);
    expect(features[0].properties.id).toBe('c');
  });

  it('treats places ~1 m apart as one spot, ~100 m apart as two', () => {
    expect(collapseColocated([f('a', 1, 1), f('b', 1.000001, 1)]).features).toHaveLength(1);
    expect(collapseColocated([f('a', 1, 1), f('b', 1.001, 1)]).features).toHaveLength(2);
  });

  it('does not mutate the input features', () => {
    const input = [f('a', 1, 1), f('b', 1, 1)];
    collapseColocated(input);
    expect('stack_count' in input[0].properties).toBe(false);
  });
});
