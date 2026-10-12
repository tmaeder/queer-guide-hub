import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import QualityHub from '../QualityHub';
vi.mock('../AdminOperationalOverview', () => ({
  default: () => <h1>Operational overview fixture</h1>,
}));
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="diagnostics-location">{location.pathname + location.search}</output>;
}
describe('engine diagnostics', () => {
  it('offers measurements and a return to the one queue, without another approval surface', () => {
    render(
      <MemoryRouter initialEntries={['/admin/diagnostics?view=engines']}>
        <QualityHub />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: 'Engine diagnostics', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Review queue' })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
  });
  it('keeps the operational overview and engines at one canonical diagnostics route', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/diagnostics']}>
        <QualityHub />
        <LocationProbe />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Operational overview fixture' });
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'Engines' }));
    expect(screen.getByRole('heading', { name: 'Engine diagnostics' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Operational overview fixture' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('diagnostics-location')).toHaveTextContent(
      '/admin/diagnostics?view=engines',
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    await screen.findByRole('heading', { name: 'Operational overview fixture' });
    expect(screen.getByTestId('diagnostics-location').textContent).toBe('/admin/diagnostics');
  });
});
