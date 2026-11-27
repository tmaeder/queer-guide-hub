import { describe, expect, it } from 'vitest';
import { isKnownAppPath } from './agentHttp';

describe('isKnownAppPath optional segments', () => {
  const id = 'dfec8c70-5b7d-4e31-bf0e-1fc1521a0720';

  it('matches a profile with and without its optional tab', () => {
    expect(isKnownAppPath(`/user/${id}`)).toBe(true);
    expect(isKnownAppPath(`/user/${id}/`)).toBe(true);
    expect(isKnownAppPath(`/user/${id}/travel`)).toBe(true);
  });

  it('still rejects paths the route cannot render', () => {
    expect(isKnownAppPath('/user')).toBe(false);
    expect(isKnownAppPath(`/user/${id}/travel/extra`)).toBe(false);
  });

  it('keeps the root and plain static routes', () => {
    expect(isKnownAppPath('/')).toBe(true);
    expect(isKnownAppPath('/help')).toBe(true);
  });
});
