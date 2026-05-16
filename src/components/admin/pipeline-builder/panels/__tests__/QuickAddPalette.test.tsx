/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sparkles } from 'lucide-react';

vi.mock('../../icon-registry', () => ({
  resolvePipelineIcon: () => Sparkles,
}));

import QuickAddPalette from '../QuickAddPalette';

const nodeTypes = [
  { slug: 'rss', display_name: 'RSS Source', category: 'source', color: '#0ff', icon: 'rss', description: 'fetch RSS' },
  { slug: 'normalize', display_name: 'Normalize', category: 'processor', color: '#f0f', icon: 'wand', description: null },
] as never;

describe('QuickAddPalette', () => {
  it('renders nothing until Cmd/Ctrl-K pressed', () => {
    render(<QuickAddPalette nodeTypes={nodeTypes} onAdd={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/search nodes/i)).toBeNull();
  });

  it('opens on Cmd-K and lists nodes by category', () => {
    render(<QuickAddPalette nodeTypes={nodeTypes} onAdd={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByPlaceholderText(/search nodes/i)).toBeInTheDocument();
    expect(screen.getByText('RSS Source')).toBeInTheDocument();
    expect(screen.getByText('Normalize')).toBeInTheDocument();
  });

  it('selecting a node fires onAdd', () => {
    const onAdd = vi.fn();
    render(<QuickAddPalette nodeTypes={nodeTypes} onAdd={onAdd} />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    fireEvent.click(screen.getByText('Normalize'));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ slug: 'normalize' }));
  });
});
