/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Box } from 'lucide-react';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));
vi.mock('../../icon-registry', () => ({
  resolvePipelineIcon: () => Box,
  AlertCircle: () => null,
  ArrowDownToLine: () => null,
  ArrowUpFromLine: () => null,
  Timer: () => null,
}));

import BaseNode from '../BaseNode';

describe('BaseNode', () => {
  it('renders default node with label', () => {
    render(<BaseNode data={{ label: 'My Node' }} selected={false} id="n1" />);
    expect(screen.getByText('My Node')).toBeInTheDocument();
  });

  it('falls back to nodeTypeSlug when no label', () => {
    render(<BaseNode data={{ nodeTypeSlug: 'rss' }} selected={false} id="n1" />);
    expect(screen.getByText('rss')).toBeInTheDocument();
  });

  it('renders status badge when status set', () => {
    render(<BaseNode data={{ label: 'L', status: 'completed' }} selected={false} id="n1" />);
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('renders error message section', () => {
    render(<BaseNode data={{ label: 'L', errorMessage: 'boom' }} selected={false} id="n1" />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders metrics when itemsOut set', () => {
    render(<BaseNode data={{ label: 'L', itemsOut: 42 }} selected={false} id="n1" />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
