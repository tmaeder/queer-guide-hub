/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSComments', () => ({
  useCMSComments: () => ({
    comments: [], loading: false,
    loadComments: vi.fn(), addComment: vi.fn(), resolveComment: vi.fn(), unresolveComment: vi.fn(),
  }),
}));

import { CommentThread } from '../CommentThread';

describe('CommentThread', () => {
  it('renders empty', () => {
    const { container } = render(<CommentThread sourceTable="venues" sourceId="v1" />);
    expect(container).toBeTruthy();
  });
});
