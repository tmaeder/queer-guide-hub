import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('./AddToTripDialog', () => ({ AddToTripDialog: () => null }));
vi.mock('../AddToTripDialog', () => ({ AddToTripDialog: () => null }));

import { AddToTripMenuItem } from '../AddToTripMenuItem';

describe('AddToTripMenuItem', () => {
  it('should render Add to Trip when authenticated', () => {
    render(<AddToTripMenuItem entity={{ type: 'venue', id: 'v-1', name: 'Test' } as any} />);
    expect(screen.getByText('Add to Trip')).toBeInTheDocument();
  });
});
