/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({
  listFromWhere: vi.fn().mockResolvedValue([]),
  updateRow: vi.fn().mockResolvedValue({}),
}));

import { ModerationQueue } from '../ModerationQueue';

describe('cms/ModerationQueue', () => {
  it('renders', () => {
    const { container } = render(<ModerationQueue />);
    expect(container).toBeTruthy();
  });
});
