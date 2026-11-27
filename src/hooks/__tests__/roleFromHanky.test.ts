import { describe, it, expect } from 'vitest';
import { roleFromHanky } from '../useHankySignals';

describe('roleFromHanky', () => {
  it('maps pockets to roles', () => {
    expect(roleFromHanky({ a: 'left' })).toEqual(['top']);
    expect(roleFromHanky({ a: 'right' })).toEqual(['bottom']);
    expect(roleFromHanky({ a: 'left', b: 'right' })).toEqual(['vers']);
    expect(roleFromHanky({ a: 'both' })).toEqual(['vers']);
    expect(roleFromHanky({})).toEqual([]);
  });
});
