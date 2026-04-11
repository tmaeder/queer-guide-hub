import { describe, expect, it } from 'vitest';
import { useTheme } from '@mui/material/styles';
import { useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { renderWithProviders, screen } from '../test-utils';

function Probe() {
  const theme = useTheme();
  const location = useLocation();
  const client = useQueryClient();
  return (
    <div>
      <span data-testid="brand">{theme.palette.brand?.main ?? 'no-brand'}</span>
      <span data-testid="route">{location.pathname}</span>
      <span data-testid="client">{client ? 'client-ok' : 'no-client'}</span>
    </div>
  );
}

describe('renderWithProviders', () => {
  it('provides the brand palette from MUI theme', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('brand')).toHaveTextContent('#DB2777');
  });

  it('wraps the tree in a MemoryRouter at "/" by default', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('route')).toHaveTextContent('/');
  });

  it('honours a custom initial route', () => {
    renderWithProviders(<Probe />, { route: '/trips' });
    expect(screen.getByTestId('route')).toHaveTextContent('/trips');
  });

  it('provides a QueryClient', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('client')).toHaveTextContent('client-ok');
  });
});
