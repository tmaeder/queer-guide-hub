/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GroupPostDialog } from '../GroupPostDialog';

describe('GroupPostDialog', () => {
  it('renders', () => {
    const { container } = render(
      <GroupPostDialog onCreatePost={vi.fn()} isCreating={false} groupMembers={[]} />,
    );
    expect(container).toBeTruthy();
  });
});
