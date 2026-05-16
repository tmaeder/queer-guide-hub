/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { navigateFn } = vi.hoisted(() => ({ navigateFn: vi.fn() }));

vi.mock('react-router', () => ({ useNavigate: () => navigateFn }));

import { QuickActions } from '../QuickActions';

beforeEach(() => navigateFn.mockReset());

describe('QuickActions', () => {
  it('renders all four quick action buttons', () => {
    render(<QuickActions />);
    expect(screen.getByRole('button', { name: /Add New Event/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add New Venue/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import Data/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manage Users/ })).toBeInTheDocument();
  });

  it('renders all management sections', () => {
    render(<QuickActions />);
    expect(screen.getByText('Content Management')).toBeInTheDocument();
    expect(screen.getByText('System Management')).toBeInTheDocument();
    expect(screen.getByText('Tools & Utilities')).toBeInTheDocument();
  });

  it('Quick action click navigates', () => {
    render(<QuickActions />);
    fireEvent.click(screen.getByRole('button', { name: /Add New Event/ }));
    expect(navigateFn).toHaveBeenCalledWith('/admin/content/events');
  });

  it('Management item click navigates', () => {
    render(<QuickActions />);
    fireEvent.click(screen.getByRole('button', { name: /Marketplace/ }));
    expect(navigateFn).toHaveBeenCalledWith('/admin/content/marketplace_listings');
  });
});
