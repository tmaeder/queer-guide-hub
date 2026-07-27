import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { TagChipRow } from '../TagChipRow';

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

describe('TagChipRow', () => {
  it('renders one link per tag by default', () => {
    render(wrap(<TagChipRow tags={['bear-bar', 'drag-show']} />));
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('renders no links at all when linkless', () => {
    const { container } = render(wrap(<TagChipRow tags={['bear-bar', 'drag-show']} linkless />));
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelectorAll('[data-tag-slug]')).toHaveLength(2);
  });

  // `linkless` exists so the row is safe inside a card-level link — the "+N more"
  // overflow affordance must honour it too, or it reintroduces a nested anchor.
  it('renders the overflow affordance as inert text when linkless', () => {
    render(wrap(<TagChipRow tags={['a', 'b', 'c']} max={1} more="/tags" linkless />));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('links the overflow affordance when not linkless', () => {
    render(wrap(<TagChipRow tags={['a', 'b', 'c']} max={1} more="/tags" />));
    expect(screen.getByRole('link', { name: '+2 more' })).toHaveAttribute('href', '/tags');
  });
});
