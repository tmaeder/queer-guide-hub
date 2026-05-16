import { describe, it, expect } from 'vitest';
import * as tabs from '../index';

describe('profile/settings barrel', () => {
  it('re-exports', () => {
    expect(tabs.BasicInfoTab).toBeDefined();
    expect(tabs.IdentityTab).toBeDefined();
    expect(tabs.RelationshipsTab).toBeDefined();
    expect(tabs.PrivacyTab).toBeDefined();
  });
});
