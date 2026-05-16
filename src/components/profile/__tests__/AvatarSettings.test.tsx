/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ updateRowsBy: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { AvatarSettings } from '../AvatarSettings';

describe('AvatarSettings', () => {
  it('renders', () => {
    const { container } = render(<AvatarSettings initialData={{ avatar_url: null } as never} onSave={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
