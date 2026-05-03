import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { EntityDetailLayout, type EntityDetailTab } from '../EntityDetailLayout';

const tabs: EntityDetailTab[] = [
  { id: 'overview', label: 'Overview', content: <div>Overview body</div> },
  { id: 'details', label: 'Details', content: <div>Details body</div> },
];

const renderLayout = (props: Partial<React.ComponentProps<typeof EntityDetailLayout>> = {}) =>
  render(
    <MemoryRouter>
      <EntityDetailLayout
        loading={false}
        error={null}
        hero={<div>Hero content</div>}
        tabs={tabs}
        entityType="venue"
        {...props}
      />
    </MemoryRouter>,
  );

describe('EntityDetailLayout', () => {
  it('renders hero and tabs when not loading', () => {
    renderLayout();
    expect(screen.getByTestId('entity-detail-layout')).toBeInTheDocument();
    expect(screen.getByText('Hero content')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    // First tab content is visible by default
    expect(screen.getByText('Overview body')).toBeInTheDocument();
  });

  it('shows skeleton state when loading', () => {
    renderLayout({ loading: true });
    expect(screen.getByTestId('entity-detail-loading')).toBeInTheDocument();
    expect(screen.queryByText('Hero content')).not.toBeInTheDocument();
  });

  it('renders error message when error is provided', () => {
    renderLayout({ error: new Error('Boom') });
    expect(screen.getByTestId('entity-detail-error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('switches tab content when active tab changes', async () => {
    renderLayout();
    expect(screen.getByText('Overview body')).toBeInTheDocument();
    const detailsTab = screen.getByRole('tab', { name: 'Details' });
    detailsTab.focus();
    fireEvent.keyDown(detailsTab, { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getByText('Details body')).toBeInTheDocument(),
    );
  });

  it('renders breadcrumbs when provided', () => {
    renderLayout({
      breadcrumbs: [
        { label: 'Venues', href: '/venues' },
        { label: 'My Venue' },
      ],
    });
    expect(screen.getByText('Venues')).toBeInTheDocument();
    expect(screen.getByText('My Venue')).toBeInTheDocument();
  });
});
