/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

vi.mock('@/components/admin/AffiliatePartnersManager', () => ({
  AffiliatePartnersManager: () => <div />,
}));
vi.mock('@/components/admin/affiliate/MerchantsManager', () => ({
  MerchantsManager: () => <div />,
}));
vi.mock('@/components/admin/business/HotelsManager', () => ({ HotelsManager: () => <div /> }));
vi.mock('@/components/admin/review-queues/BrandReviewQueue', () => ({
  BrandReviewQueue: () => <div />,
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedSupabase: { rpc: vi.fn() },
}));
vi.mock('@/hooks/useBusinessSpine', () => ({
  ORG_ROLE_LABELS: {},
  useAdminOrgList: () => ({ data: [], isLoading: false }),
  useOrgSpineDrift: () => ({ data: { organizations_total: 12, suggestions_open: 50 } }),
}));

import AdminBusiness from '../AdminBusiness';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/business" element={<AdminBusiness />} />
        <Route path="/admin/quality" element={<div>Quality hub</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminBusiness — link review moved to Quality', () => {
  it('redirects the legacy ?tab=review deep link to the Quality hub', () => {
    renderAt('/admin/business?tab=review');
    expect(screen.getByText('Quality hub')).toBeTruthy();
  });

  it('no longer offers a Link review tab', () => {
    renderAt('/admin/business');
    expect(screen.queryByRole('tab', { name: /Link review/i })).toBeNull();
  });

  it('keeps the remaining tabs', () => {
    renderAt('/admin/business');
    for (const name of [/Directory/i, /Hotels/i, /Merchants/i, /Brands/i, /Partners/i]) {
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    }
  });

  it('still renders an unknown tab param as the directory', () => {
    renderAt('/admin/business?tab=nonsense');
    expect(screen.getByRole('tab', { name: /Directory/i })).toHaveAttribute(
      'data-state',
      'active',
    );
  });
});
