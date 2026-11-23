import { describe, it, expect } from 'vitest';
import { modeFromLookingFor } from '../useUserIntent';

describe('modeFromLookingFor', () => {
  // user_mode === 'dating' unlocks dating surfaces; picking Dating among
  // others must never lose it.
  it('prefers dating whenever it is selected', () => {
    expect(modeFromLookingFor(['friends', 'dating'])).toBe('dating');
  });
  it('maps the other options', () => {
    expect(modeFromLookingFor(['travel_buddies'])).toBe('exploration');
    expect(modeFromLookingFor(['locals'])).toBe('community');
  });
  it('leaves mode alone when nothing is selected', () => {
    expect(modeFromLookingFor([])).toBeNull();
  });
});
