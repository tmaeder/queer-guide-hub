// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { OrganisationRelationshipsField } from '../OrganisationRelationshipsField';
const mocks = vi.hoisted(() => ({
  linked: {
    data: undefined as unknown,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  mutate: vi.fn(),
}));
vi.mock('@/hooks/useBusinessSpine', () => ({
  useOrgLinkedEntities: () => mocks.linked,
  useLinkOrgEntity: () => ({ mutateAsync: mocks.mutate, isPending: false }),
}));
vi.mock('@/components/admin/affiliate/MerchantsManager', () => ({
  MerchantsManager: () => <div>Merchant settings</div>,
}));
vi.mock('@/components/admin/AffiliatePartnersManager', () => ({
  AffiliatePartnersManager: () => <div>Partner settings</div>,
}));
vi.mock('@/components/admin/business/OrgEntityPickerDialog', () => ({
  OrgEntityPickerDialog: ({ onLinked }: { onLinked: () => void }) => (
    <button onClick={onLinked}>Link selected record</button>
  ),
}));
const refresh = vi.fn();
function mount(values: Record<string, unknown>) {
  return render(
    <MemoryRouter>
      <OrganisationRelationshipsField
        field={{
          name: '_relationships',
          label: 'Relationships',
          type: 'organisation_relationships',
          group: 'relationships',
        }}
        value={null}
        onChange={vi.fn()}
        allValues={values}
        onPersistedChange={refresh}
      />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.linked.data = {
    hotel: [{ id: 'h1', name: 'Hotel One', detail: null, editHref: null }],
    venue: [{ id: 'v1', name: 'Owned location' }],
  };
  mocks.linked.error = null;
  mocks.mutate.mockResolvedValue(undefined);
});
describe('Organisation business relationships', () => {
  it('requires a saved Organisation before linking', () => {
    mount({});
    expect(screen.getByText(/Save this Organisation before/)).toBeVisible();
    expect(screen.queryByText('Unlink')).toBeNull();
  });
  it('locks immediate writes while identity changes are pending', () => {
    mount({ id: 'org1', _editor_is_dirty: true });
    expect(screen.getByRole('button', { name: 'Unlink' })).toBeDisabled();
    for (const button of screen.getAllByText('Link existing…')) expect(button).toBeDisabled();
  });
  it('refreshes identity and roles after unlinking and never offers location unlinking', async () => {
    mount({ id: 'org1' });
    expect(screen.queryByText('Owned location')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(mocks.mutate).toHaveBeenCalledWith({
      entityType: 'hotel',
      entityId: 'h1',
      unlink: true,
    });
  });
  it('refreshes the identity after linking', () => {
    mount({ id: 'org1' });
    fireEvent.click(screen.getAllByText('Link existing…')[0]);
    fireEvent.click(screen.getByText('Link selected record'));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('shows failed reads and allows retry', () => {
    mocks.linked.error = new Error('offline');
    mount({ id: 'org1' });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load relationships');
    fireEvent.click(screen.getByText('Retry'));
    expect(mocks.linked.refetch).toHaveBeenCalledOnce();
  });
  it('keeps the editor usable when an unlink fails', async () => {
    mocks.mutate.mockRejectedValue(new Error('permission denied'));
    mount({ id: 'org1' });
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlink' })).not.toBeDisabled());
    expect(refresh).not.toHaveBeenCalled();
  });
});
