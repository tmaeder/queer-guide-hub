/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NodeConfigPanel from '../NodeConfigPanel';

const nodeTypes = [
  {
    slug: 'rss', display_name: 'RSS', description: 'fetch RSS', color: '#000', category: 'source',
    config_schema: { type: 'object', properties: { url: { type: 'string', description: 'feed URL' } } },
  },
] as never;

describe('NodeConfigPanel', () => {
  it('renders nothing when node is null', () => {
    const { container } = render(<NodeConfigPanel node={null} nodeTypes={nodeTypes} onUpdate={vi.fn()} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders label input populated from node data', () => {
    const node = { id: 'n1', data: { label: 'My RSS', nodeTypeSlug: 'rss', config: {} } } as never;
    render(<NodeConfigPanel node={node} nodeTypes={nodeTypes} onUpdate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByDisplayValue('My RSS')).toBeInTheDocument();
  });

  it('Close button fires onClose', () => {
    const node = { id: 'n1', data: { label: 'X', nodeTypeSlug: 'rss', config: {} } } as never;
    const onClose = vi.fn();
    render(<NodeConfigPanel node={node} nodeTypes={nodeTypes} onUpdate={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('Label edit fires onUpdate', () => {
    const node = { id: 'n1', data: { label: 'X', nodeTypeSlug: 'rss', config: {} } } as never;
    const onUpdate = vi.fn();
    render(<NodeConfigPanel node={node} nodeTypes={nodeTypes} onUpdate={onUpdate} onClose={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('X'), { target: { value: 'Y' } });
    expect(onUpdate).toHaveBeenCalledWith('n1', expect.objectContaining({ label: 'Y' }));
  });
});
