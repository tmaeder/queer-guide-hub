/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => ({ currency: 'USD', formatPriceCents: (n: number) => `$${n / 100}` }) }));
vi.mock('@/hooks/useDonations', () => ({
  useDonations: () => ({ createDonation: vi.fn(), loading: false }),
  useCreateCheckoutSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { DonationForm } from '../DonationForm';

describe('DonationForm', () => {
  it('renders', () => {
    const { container } = render(<DonationForm />);
    expect(container).toBeTruthy();
  });
});
