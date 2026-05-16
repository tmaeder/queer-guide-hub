/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCentralizedTags', () => ({
  useCentralizedTags: () => ({ allTags: [], tagsByCategory: {}, searchTags: vi.fn().mockReturnValue([]) }),
}));

import { TagSelector } from '../TagSelector';

describe('TagSelector', () => {
  it('renders', () => {
    const { container } = render(<TagSelector selectedTags={[]} onTagsChange={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
