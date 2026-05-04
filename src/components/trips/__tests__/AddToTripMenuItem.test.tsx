import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('./AddToTripDialog', () => ({ AddToTripDialog: () => null }));
vi.mock('../AddToTripDialog', () => ({ AddToTripDialog: () => null }));

import { AddToTripMenuItem } from '../AddToTripMenuItem';

describe('AddToTripMenuItem', () => {
  it('should render Add to Trip when authenticated', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuContent>
          <AddToTripMenuItem entity={{ type: 'venue', id: 'v-1', name: 'Test' } as unknown as React.ComponentProps<typeof AddToTripMenuItem>['entity']} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText('Add to Trip')).toBeInTheDocument();
  });
});
