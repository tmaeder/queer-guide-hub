/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Box } from 'lucide-react';

const { setCenterFn, getNodeFn } = vi.hoisted(() => ({
  setCenterFn: vi.fn(),
  getNodeFn: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ setCenter: setCenterFn, getNode: getNodeFn }),
}));
vi.mock('../../icon-registry', () => ({ resolvePipelineIcon: () => Box }));

import FindNodePalette from '../FindNodePalette';

const nodes = [
  { id: 'n1', data: { label: 'First Node', nodeTypeSlug: 'rss' }, position: { x: 0, y: 0 }, width: 200, height: 80 },
  { id: 'n2', data: { label: 'Second Node', nodeTypeSlug: 'wand', status: 'completed' } },
] as never;

describe('FindNodePalette', () => {
  it('renders nothing until Cmd-F pressed', () => {
    render(<FindNodePalette nodes={nodes} onSelect={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/Find node on canvas/i)).toBeNull();
  });

  it('opens on Cmd-F and lists nodes with count', () => {
    render(<FindNodePalette nodes={nodes} onSelect={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(screen.getByPlaceholderText(/Find node on canvas/)).toBeInTheDocument();
    expect(screen.getByText(/2 nodes on canvas/)).toBeInTheDocument();
    expect(screen.getByText('First Node')).toBeInTheDocument();
  });

  it('selecting node calls onSelect + setCenter', () => {
    getNodeFn.mockReturnValue({ position: { x: 100, y: 50 }, width: 200, height: 80 });
    const onSelect = vi.fn();
    render(<FindNodePalette nodes={nodes} onSelect={onSelect} />);
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    fireEvent.click(screen.getByText('First Node'));
    expect(setCenterFn).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('n1');
  });

  it('shows status badge for nodes with status', () => {
    render(<FindNodePalette nodes={nodes} onSelect={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(screen.getByText('completed')).toBeInTheDocument();
  });
});
