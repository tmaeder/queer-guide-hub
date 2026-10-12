/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';

let effectiveRole = 'moderator';
vi.mock('@/hooks/useGranularRoles', () => ({ useGranularRoles: () => ({ effectiveRole }) }));
vi.mock('@/components/cms/ContentListPanel', () => ({
  ContentListPanel: () => <h1>Canonical tag list</h1>,
}));
vi.mock('@/components/admin/TagCollectionTools', () => ({
  default: () => <div>Collection tools loaded</div>,
}));
import AdminTags from '../AdminTags';
function Probe() {
  const location = useLocation();
  return <output data-testid="url">{location.search}</output>;
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <AdminTags />
    </MemoryRouter>,
  );
}

describe('the consolidated tag workspace', () => {
  it('starts with the canonical list and defers collection tools', async () => {
    effectiveRole = 'moderator';
    renderAt('/admin/content/unified_tags?category=Health');
    expect(screen.getByRole('heading', { name: 'Canonical tag list' })).toBeInTheDocument();
    expect(screen.queryByText('Collection tools loaded')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Categories & tools' }));
    expect(await screen.findByText('Collection tools loaded')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('category=Health');
    expect(screen.getByTestId('url')).toHaveTextContent('section=tools');
  });
  it('links all controlled vocabularies directly to their canonical lists', () => {
    effectiveRole = 'moderator';
    renderAt('/admin/content/unified_tags?section=vocabularies');
    expect(screen.getByRole('link', { name: 'Venue services' })).toHaveAttribute(
      'href',
      '/admin/content/venue_services',
    );
    expect(screen.getByRole('link', { name: 'Professions' })).toHaveAttribute(
      'href',
      '/admin/content/professions',
    );
    expect(screen.queryByRole('heading', { name: 'Canonical tag list' })).not.toBeInTheDocument();
  });
  it('does not expose former moderator tools to an editor through a deep link', () => {
    effectiveRole = 'editor';
    renderAt('/admin/content/unified_tags?section=tools');
    expect(screen.getByRole('heading', { name: 'Canonical tag list' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Categories & tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tag governance' })).not.toBeInTheDocument();
  });
});
