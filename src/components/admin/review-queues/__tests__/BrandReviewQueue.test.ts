import { describe, it, expect } from 'vitest';
import {
  sensitiveConfirmMessage,
  OWNERSHIP_VOCAB,
  SENSITIVE_TAGS,
} from '../BrandReviewQueue';

// Mirrors approve_marketplace_brand's p_confirm contract: asserting
// queer/trans/BIPOC ownership must go through the explicit confirm; the other
// vocabulary tags approve directly.
describe('sensitiveConfirmMessage', () => {
  it('returns null for no tags', () => {
    expect(sensitiveConfirmMessage([], 'Acme')).toBeNull();
  });

  it('returns null for non-sensitive tags only', () => {
    expect(sensitiveConfirmMessage(['women_owned', 'nonprofit'], 'Acme')).toBeNull();
  });

  it.each([...SENSITIVE_TAGS])('requires confirm for %s', (tag) => {
    const msg = sensitiveConfirmMessage([tag], 'Acme');
    expect(msg).toBeTruthy();
    expect(msg).toContain('Acme');
  });

  it('names every sensitive tag in the confirm message', () => {
    const msg = sensitiveConfirmMessage(['queer_owned', 'trans_owned', 'women_owned'], 'Acme');
    expect(msg).toContain('Queer Owned');
    expect(msg).toContain('Trans Owned');
    expect(msg).not.toContain('Women Owned');
  });

  it('sensitive tags are a subset of the vocabulary', () => {
    for (const tag of SENSITIVE_TAGS) {
      expect(OWNERSHIP_VOCAB).toContain(tag);
    }
  });
});
