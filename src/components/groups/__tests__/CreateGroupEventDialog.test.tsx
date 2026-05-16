/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CreateGroupEventDialog } from '../CreateGroupEventDialog';

describe('CreateGroupEventDialog', () => {
  it('renders', () => {
    const { container } = render(<CreateGroupEventDialog onCreateEvent={vi.fn()} isCreating={false} />);
    expect(container).toBeTruthy();
  });
});
