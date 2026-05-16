/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CreatePostDialog } from '../CreatePostDialog';

describe('CreatePostDialog', () => {
  it('renders', () => {
    const { container } = render(
      <CreatePostDialog onCreatePost={vi.fn()} isCreating={false} groupMembers={[]} />,
    );
    expect(container).toBeTruthy();
  });
});
