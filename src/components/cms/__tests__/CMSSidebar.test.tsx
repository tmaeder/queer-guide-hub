/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({ countRows: vi.fn().mockResolvedValue(0) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { CMSSidebar } from '../CMSSidebar';

describe('CMSSidebar', () => {
  it('renders without crashing', () => {
    const { container } = render(<CMSSidebar activeView="overview" activeContentType={null} onNavigate={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
