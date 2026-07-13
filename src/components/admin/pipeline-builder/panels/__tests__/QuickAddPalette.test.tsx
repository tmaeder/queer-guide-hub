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
  it('renders nothing while closed', () => {
    render(<QuickAddPalette nodeTypes={nodeTypes} onAdd={vi.fn()} open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/search nodes/i)).toBeNull();
  });

  it('lists nodes by category when open', () => {
    render(<QuickAddPalette nodeTypes={nodeTypes} onAdd={vi.fn()} open onOpenChange={vi.fn()} />);
    expect(screen.getByPlaceholderText(/search nodes/i)).toBeInTheDocument();
    expect(screen.getByText('RSS Source')).toBeInTheDocument();
    expect(screen.getByText('Normalize')).toBeInTheDocument();
  });

  it('selecting a node fires onAdd and closes', () => {
    const onAdd = vi.fn();
    const onOpenChange = vi.fn();
    render(<QuickAddPalette nodeTypes={nodeTypes} onAdd={onAdd} open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText('Normalize'));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ slug: 'normalize' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
