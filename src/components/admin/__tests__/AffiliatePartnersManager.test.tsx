/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useAffiliateMock } = vi.hoisted(() => ({ useAffiliateMock: vi.fn() }));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('@/hooks/useAffiliateLinks', () => ({ useAffiliateLinks: useAffiliateMock }));

import { AffiliatePartnersManager } from '../AffiliatePartnersManager';

beforeEach(() => {
  useAffiliateMock.mockReset();
  useAffiliateMock.mockReturnValue({
    partners: [
      { id: 'p1', partner_name: 'Booking.com', domains: ['booking.com'], url_patterns: [], parameters: {}, redirect_template: '', enabled: true },
    ],
    loading: false, error: null,
    fetchPartners: vi.fn(), createPartner: vi.fn(), updatePartner: vi.fn(), deletePartner: vi.fn(),
  });
});

describe('AffiliatePartnersManager', () => {
  it('renders partner rows', () => {
    render(<AffiliatePartnersManager />);
    expect(screen.getByText('Booking.com')).toBeInTheDocument();
  });

  it('opens dialog on Add', () => {
    render(<AffiliatePartnersManager />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
  });
});
