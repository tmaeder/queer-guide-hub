/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { HotelBookingFlow } from '../HotelBookingFlow';

describe('HotelBookingFlow', () => {
  it('renders closed', () => {
    const { container } = render(
      <HotelBookingFlow hotel={{ id: 'h1', name: 'X' } as never} open={false} onClose={vi.fn()} tripId={null} onBooked={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
