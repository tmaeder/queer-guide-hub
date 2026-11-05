import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({
  selected: null as Record<string, unknown> | null,
  rows: [] as Record<string, unknown>[],
  error: false,
  retry: vi.fn(),
  verify: vi.fn(),
  editor: vi.fn(),
}));
vi.mock('@/components/admin/GeographyLandmarks', () => ({ GeographyLandmarks: () => null }));
vi.mock('@/hooks/useGeoPlaces', () => ({
  useGeoIntegrityViolations: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useGeographyCMS', async (load) => {
  const original = await load<Record<string, unknown>>();
  return {
    ...original,
    useGeographyRows: (parentId: string | null) => ({
      data: {
        pages: [{ rows: parentId ? [] : mocks.rows, total: parentId ? 0 : mocks.rows.length }],
      },
      isLoading: false,
      isError: mocks.error,
      error: new Error('Offline'),
      refetch: mocks.retry,
    }),
    useGeographyRecord: () => ({ data: mocks.selected, isLoading: false }),
    useGeographyFilters: () => ({ data: { continents: [], regions: [] } }),
    useVerifyGeography: () => ({ mutate: mocks.verify }),
  };
});
vi.mock('@/components/cms/editor/CMSEditorLayout', () => ({
  CMSEditorLayout: (props: Record<string, unknown>) => {
    mocks.editor(props);
    return <div>CMS record editor</div>;
  },
}));
import AdminGeography from '../AdminGeography';
const country = {
  id: 'country-1',
  place_type: 'country',
  name: 'Spain',
  path: 'Spain',
  source_table: 'countries',
  country_id: 'country-1',
  country_name: 'Spain',
  verification_status: 'missing',
  child_count: 1,
  latitude: 40,
  longitude: -3,
  seo_indexable: true,
};
function view(url = '/admin/geography') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[url]}>
        <AdminGeography />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.selected = null;
  mocks.rows = [country];
  mocks.error = false;
});
describe('Unified geography workspace', () => {
  it('starts at countries and provides one set of type filters', () => {
    view();
    expect(screen.getByRole('button', { name: /Spain.*Country/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Geography type' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Expand Spain' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
  it('keeps subitems expandable within search results', () => {
    view('/admin/geography?q=Spain');
    expect(screen.getByRole('button', { name: 'Expand Spain' })).not.toBeDisabled();
  });
  it('closes the inspector without losing the active filters and restores list focus', () => {
    mocks.selected = country;
    view('/admin/geography?q=Spain&type=country&selected=country-1');
    fireEvent.click(screen.getByRole('button', { name: 'Close record details' }));
    expect(screen.queryByRole('region', { name: 'Selected geography' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search geography' })).toHaveValue('Spain');
    expect(screen.getByRole('combobox', { name: 'Geography type' })).toHaveValue('country');
    expect(screen.getByRole('region', { name: 'Geography hierarchy' })).toHaveFocus();
  });
  it('collapses expanded branches while preserving filters', () => {
    view('/admin/geography?q=Spain&expanded=country-1');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.getByRole('button', { name: 'Expand Spain' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('textbox', { name: 'Search geography' })).toHaveValue('Spain');
    expect(screen.queryByRole('button', { name: 'Collapse all' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Geography hierarchy' })).toHaveFocus();
  });
  it('opens the selected canonical record instead of its entire list', () => {
    mocks.selected = country;
    view('/admin/geography?selected=country-1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit record' }));
    expect(mocks.editor).toHaveBeenLastCalledWith(
      expect.objectContaining({ contentType: 'countries', itemId: 'country-1' }),
    );
  });
  it('prefills the real country FK when adding a city', () => {
    mocks.selected = country;
    view('/admin/geography?selected=country-1');
    fireEvent.click(screen.getByRole('button', { name: 'Add city' }));
    expect(mocks.editor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentType: 'cities',
        itemId: null,
        initialValues: { country_id: 'country-1' },
      }),
    );
  });
  it('prefills both actual FKs when adding a queer village', () => {
    mocks.selected = {
      ...country,
      id: 'city-1',
      place_type: 'city',
      source_table: 'cities',
      name: 'Madrid',
    };
    view('/admin/geography?selected=city-1');
    fireEvent.click(screen.getByRole('button', { name: 'Add queer village' }));
    expect(mocks.editor).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentType: 'queer_villages',
        initialValues: { city_id: 'city-1', country_id: 'country-1' },
      }),
    );
  });
  it('shows a retryable error instead of an empty hierarchy on query failure', () => {
    mocks.error = true;
    view();
    expect(screen.getByRole('alert')).toHaveTextContent('Offline');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.retry).toHaveBeenCalled();
  });
  it('does not label a country check as full verification', () => {
    mocks.selected = { ...country, verification_status: 'country_checked' };
    view('/admin/geography?selected=country-1');
    const detail = within(screen.getByRole('region', { name: 'Selected geography' }));
    expect(detail.getByText('Country checked')).toBeInTheDocument();
    expect(detail.queryByText('Verified')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check geography' }));
    expect(mocks.verify).toHaveBeenCalledWith('country-1');
  });

  it('links each linked-content count to the CMS list filtered to this place', () => {
    mocks.selected = {
      ...country,
      id: 'city-1',
      place_type: 'city',
      source_table: 'cities',
      name: 'Berlin',
      venue_count: 1,
      event_count: 3,
      hotel_count: 0,
    };
    view('/admin/geography?selected=city-1');
    const detail = within(screen.getByRole('region', { name: 'Selected geography' }));
    expect(detail.getByRole('link', { name: 'Show 1 venues in Berlin' })).toHaveAttribute(
      'href',
      '/admin/content/organizations?venue_city_id=city-1&venue_city_id_label=Berlin',
    );
    expect(detail.getByRole('link', { name: 'Show 3 events in Berlin' })).toHaveAttribute(
      'href',
      '/admin/content/events?city_id=city-1&city_id_label=Berlin',
    );
    // A zero count is text: a link to an empty list is a dead end.
    expect(detail.queryByRole('link', { name: /hotels in Berlin/ })).not.toBeInTheDocument();
    expect(detail.getByText(/0 hotels/)).toBeInTheDocument();
  });

  it('filters a village by queer_village_id and a country by country_id', () => {
    mocks.selected = {
      ...country,
      id: 'village-1',
      place_type: 'village',
      source_table: 'queer_villages',
      name: 'Schoeneberg',
      venue_count: 2,
      event_count: 0,
      hotel_count: 0,
    };
    const { unmount } = view('/admin/geography?selected=village-1');
    expect(screen.getByRole('link', { name: 'Show 2 venues in Schoeneberg' })).toHaveAttribute(
      'href',
      '/admin/content/organizations?venue_village_id=village-1&venue_village_id_label=Schoeneberg',
    );
    unmount();
    mocks.selected = { ...country, venue_count: 5, event_count: 0, hotel_count: 0 };
    view('/admin/geography?selected=country-1');
    expect(screen.getByRole('link', { name: 'Show 5 venues in Spain' })).toHaveAttribute(
      'href',
      '/admin/content/organizations?venue_country_id=country-1&venue_country_id_label=Spain',
    );
  });
});
