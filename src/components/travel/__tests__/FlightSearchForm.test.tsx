/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FlightSearchForm } from '../FlightSearchForm';

describe('FlightSearchForm', () => {
  it('renders', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(<MemoryRouter><QueryClientProvider client={qc}><FlightSearchForm /></QueryClientProvider></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
