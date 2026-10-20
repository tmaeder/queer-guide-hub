import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { StatLine } from '@/components/transit/StatLine';
import { MapInset } from '@/components/transit/MapInset';

describe('StatLine', () => {
  it('drops empty stats', () => {
    render(
      <StatLine
        stats={[
          { label: 'Capacity', value: 240 },
          { label: 'Door', value: null },
        ]}
      />,
    );
    expect(screen.getByText('240')).toBeInTheDocument();
    expect(screen.queryByText('Door')).toBeNull();
  });
});

describe('MapInset', () => {
  it("frames the caller's map rather than building a second one", () => {
    render(
      <MemoryRouter>
        <MapInset caption="Kottbusser Tor · U1, U8">
          <div data-testid="the-real-map" />
        </MapInset>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('the-real-map')).toBeInTheDocument();
    expect(screen.getByText(/Kottbusser Tor/)).toBeInTheDocument();
  });
});
