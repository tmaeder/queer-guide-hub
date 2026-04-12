import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('should render title as h1', () => {
    render(<PageHeader title="Venues" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Venues');
  });

  it('should render subtitle when provided', () => {
    render(<PageHeader title="Events" subtitle="Discover events worldwide" />);
    expect(screen.getByText('Discover events worldwide')).toBeInTheDocument();
  });

  it('should not render subtitle when not provided', () => {
    render(<PageHeader title="Test" />);
    expect(screen.queryByText('text.secondary')).not.toBeInTheDocument();
  });

  it('should render actions slot', () => {
    render(<PageHeader title="Test" actions={<button>Create</button>} />);
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('should render children', () => {
    render(<PageHeader title="Test"><div>Filters here</div></PageHeader>);
    expect(screen.getByText('Filters here')).toBeInTheDocument();
  });
});
