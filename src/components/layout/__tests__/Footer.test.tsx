import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
vi.mock('@/components/theme/ThemeToggle', () => ({ ThemeToggle: () => <button>Theme</button> }));
import { Footer } from '../Footer';
describe('Footer', () => {
  it('should render footer links', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });
  it('should render copyright', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.getByText(/Queer Guide/)).toBeInTheDocument();
  });
});
