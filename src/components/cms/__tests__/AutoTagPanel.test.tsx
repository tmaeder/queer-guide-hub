/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAutoTag', () => ({
  useAutoTag: () => ({
    loading: false, suggestions: [],
    suggestTags: vi.fn().mockResolvedValue({ tags: [] }),
    applyTags: vi.fn().mockResolvedValue({}),
    clearSuggestions: vi.fn(),
  }),
}));

import { AutoTagPanel } from '../AutoTagPanel';

describe('AutoTagPanel', () => {
  it('renders', () => {
    const { container } = render(<AutoTagPanel contentType="venues" contentId="v1" onTagsApplied={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
