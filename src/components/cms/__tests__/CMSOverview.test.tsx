/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({
  listFrom: vi.fn().mockResolvedValue([]),
  listFromIn: vi.fn().mockResolvedValue([]),
  countRows: vi.fn().mockResolvedValue(0),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { CMSOverview } from '../CMSOverview';

describe('CMSOverview', () => {
  it('renders without crashing', () => {
    const { container } = render(<CMSOverview onNavigate={vi.fn()} onEdit={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
