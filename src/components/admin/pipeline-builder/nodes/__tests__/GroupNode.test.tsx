/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@xyflow/react', () => ({
  NodeResizer: () => null,
}));

import GroupNode from '../GroupNode';

describe('GroupNode', () => {
  it('renders default label when none provided', () => {
    render(<GroupNode data={{}} selected={false} id="g1" />);
    expect(screen.getByText('Group')).toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(<GroupNode data={{ label: 'My Group' }} selected={false} id="g1" />);
    expect(screen.getByText('My Group')).toBeInTheDocument();
  });

  it('enters edit mode on double click + commits via custom event', () => {
    const spy = vi.fn();
    window.addEventListener('pipeline-group-update', spy);
    render(<GroupNode data={{ label: 'L' }} selected={false} id="g1" />);
    fireEvent.doubleClick(screen.getByText('L'));
    const input = screen.getByDisplayValue('L');
    fireEvent.change(input, { target: { value: 'L2' } });
    fireEvent.blur(input);
    expect(spy).toHaveBeenCalled();
    window.removeEventListener('pipeline-group-update', spy);
  });

  it('Enter / Space on the label triggers edit mode', () => {
    render(<GroupNode data={{ label: 'L' }} selected={false} id="g1" />);
    const label = screen.getByText('L');
    fireEvent.keyDown(label, { key: 'Enter' });
    expect(screen.getByDisplayValue('L')).toBeInTheDocument();
  });
});
