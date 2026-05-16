/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlaceholderTab } from '../PlaceholderTab';

describe('PlaceholderTab', () => {
  it('renders title, description, and bullets', () => {
    render(
      <PlaceholderTab
        title="Coming soon"
        description="More details below"
        bullets={['first thing', 'second thing']}
      />,
    );
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByText('More details below')).toBeInTheDocument();
    expect(screen.getByText('first thing')).toBeInTheDocument();
    expect(screen.getByText('second thing')).toBeInTheDocument();
  });

  it('renders an empty list cleanly when no bullets', () => {
    render(<PlaceholderTab title="x" description="y" bullets={[]} />);
    expect(screen.getByText('x')).toBeInTheDocument();
    const lists = screen.queryAllByRole('listitem');
    expect(lists).toHaveLength(0);
  });
});
