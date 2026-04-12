import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));
import { vi } from 'vitest';
import { DonationSuccess } from '../DonationSuccess';
describe('DonationSuccess', () => {
  it('should render thank you message', () => {
    render(<MemoryRouter><DonationSuccess /></MemoryRouter>);
    expect(screen.getByText('Thank you!')).toBeInTheDocument();
  });
  it('should render back home link', () => {
    render(<MemoryRouter><DonationSuccess /></MemoryRouter>);
    expect(screen.getByText('Back to home')).toBeInTheDocument();
  });
});
