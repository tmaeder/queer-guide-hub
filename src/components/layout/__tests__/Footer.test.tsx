import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
vi.mock('@/components/theme/ThemeToggle', () => ({ ThemeToggle: () => <button>Theme</button> }));
import { Footer } from '../Footer';
describe('Footer', () => {
  it('should render link group titles', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Connect')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
  });
  it('should render venue link', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.getByText('Venues')).toBeInTheDocument();
  });
});
