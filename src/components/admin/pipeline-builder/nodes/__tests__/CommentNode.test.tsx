/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@xyflow/react', () => ({
  NodeResizer: () => null,
}));

import CommentNode from '../CommentNode';

describe('CommentNode', () => {
  it('shows placeholder when no text', () => {
    render(<CommentNode data={{}} selected={false} id="c1" />);
    expect(screen.getByText(/Double-click to edit/)).toBeInTheDocument();
  });

  it('renders text when provided', () => {
    render(<CommentNode data={{ text: 'Hello' }} selected={false} id="c1" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('double-click enters edit mode + blur commits via event', () => {
    const spy = vi.fn();
    window.addEventListener('pipeline-comment-update', spy);
    render(<CommentNode data={{ text: 'X' }} selected={false} id="c1" />);
    fireEvent.doubleClick(screen.getByText('X'));
    const ta = screen.getByDisplayValue('X');
    fireEvent.change(ta, { target: { value: 'Y' } });
    fireEvent.blur(ta);
    expect(spy).toHaveBeenCalled();
    window.removeEventListener('pipeline-comment-update', spy);
  });
});
