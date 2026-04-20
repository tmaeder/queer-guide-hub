import { expect } from 'vitest';
import { PLACEHOLDER_PATTERNS } from '@/utils/safeDisplay';

/**
 * Assert that the rendered text inside `root` does not leak any placeholder
 * artifacts (null / undefined / [object Object] / unrendered moustache).
 */
export function expectNoPlaceholderLeaks(root: HTMLElement | null | undefined): void {
  const text = root?.textContent ?? '';
  for (const pattern of PLACEHOLDER_PATTERNS) {
    expect(
      text,
      `rendered text contains forbidden placeholder pattern ${pattern}`,
    ).not.toMatch(pattern);
  }
}
