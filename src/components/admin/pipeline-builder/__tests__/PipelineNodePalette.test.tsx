/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Box } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('../icon-registry', () => ({ resolvePipelineIcon: () => Box }));

import PipelineNodePalette from '../PipelineNodePalette';

const types = {
  source: [{ slug: 'rss', display_name: 'RSS', icon: 'r', color: '#000', description: 'rss feeds' }],
  processor: [{ slug: 'norm', display_name: 'Normalize', icon: 'n', color: '#0f0', description: null }],
} as never;

function wrap(ui: React.ReactNode) {
  return <TooltipProvider>{ui}</TooltipProvider>;
}

describe('PipelineNodePalette', () => {
  it('renders search input + groups + nodes', () => {
    render(wrap(<PipelineNodePalette
      paletteSearch="" setPaletteSearch={vi.fn()}
      nodeTypesByCategory={types}
      onDragStart={vi.fn()} onQuickAdd={vi.fn()}
    />));
    expect(screen.getByPlaceholderText(/Search nodes/)).toBeInTheDocument();
    expect(screen.getByText('Sources')).toBeInTheDocument();
    expect(screen.getByText('RSS')).toBeInTheDocument();
    expect(screen.getByText('Normalize')).toBeInTheDocument();
  });

  it('shows clear button when search filled and clears on click', () => {
    const setSearch = vi.fn();
    render(wrap(<PipelineNodePalette
      paletteSearch="rss" setPaletteSearch={setSearch}
      nodeTypesByCategory={types}
      onDragStart={vi.fn()} onQuickAdd={vi.fn()}
    />));
    fireEvent.click(screen.getByTitle('Clear search'));
    expect(setSearch).toHaveBeenCalledWith('');
  });

  it('shows no-match message when search filtered everything', () => {
    render(wrap(<PipelineNodePalette
      paletteSearch="xyz" setPaletteSearch={vi.fn()}
      nodeTypesByCategory={{ source: [], processor: [] } as never}
      onDragStart={vi.fn()} onQuickAdd={vi.fn()}
    />));
    expect(screen.getByText(/No nodes match "xyz"/)).toBeInTheDocument();
  });

  it('Enter on node fires onQuickAdd', () => {
    const onQuickAdd = vi.fn();
    render(wrap(<PipelineNodePalette
      paletteSearch="" setPaletteSearch={vi.fn()}
      nodeTypesByCategory={types}
      onDragStart={vi.fn()} onQuickAdd={onQuickAdd}
    />));
    const node = screen.getByRole('button', { name: /Add RSS node/ });
    fireEvent.keyDown(node, { key: 'Enter' });
    expect(onQuickAdd).toHaveBeenCalled();
  });
});
