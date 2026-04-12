import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('./ThemeProvider', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
// Fix: mock from correct relative path
vi.mock('../ThemeProvider', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));
import { ThemeToggle } from '../ThemeToggle';
describe('ThemeToggle', () => {
  it('should render toggle button', () => {
    render(<ThemeToggle />);
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
  });
});
