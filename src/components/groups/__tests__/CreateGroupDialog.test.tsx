/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CreateGroupDialog } from '../CreateGroupDialog';

describe('CreateGroupDialog', () => {
  it('renders', () => {
    const { container } = render(<CreateGroupDialog onCreateGroup={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
