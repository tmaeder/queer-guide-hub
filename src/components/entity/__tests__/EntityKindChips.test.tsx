/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EntityKindChips } from '../EntityKindChips';

function renderChips(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('EntityKindChips', () => {
  it('names both kinds and links only the other page', () => {
    renderChips(
      <EntityKindChips
        kinds={[{ kind: 'venue' }, { kind: 'organization', href: '/organizations/acme' }]}
      />,
    );
    expect(screen.getByText('Venue').closest('a')).toBeNull();
    expect(screen.getByText('Organization').closest('a')?.getAttribute('href')).toContain(
      '/organizations/acme',
    );
  });

  it('does not repeat the venue role or show spine-internal roles', () => {
    renderChips(
      <EntityKindChips
        kinds={[{ kind: 'organization' }, { kind: 'venue' }]}
        roles={['venue', 'seller', 'brand', 'hotel']}
      />,
    );
    expect(screen.getByText('Shop')).toBeTruthy();
    expect(screen.queryByText('Physical venue')).toBeNull();
    expect(screen.queryByText('brand')).toBeNull();
    expect(screen.queryByText('hotel')).toBeNull();
  });

  it('dedupes a kind passed twice', () => {
    renderChips(<EntityKindChips kinds={[{ kind: 'venue' }, { kind: 'venue' }]} />);
    expect(screen.getAllByText('Venue')).toHaveLength(1);
  });
});
