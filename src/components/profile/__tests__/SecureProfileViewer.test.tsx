/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { SecureProfileViewer } from '../SecureProfileViewer';

describe('SecureProfileViewer', () => {
  it('renders', () => {
    const { container } = render(
      <MemoryRouter>
        <SecureProfileViewer profile={{ id: 'p1', user_id: 'u1', display_name: 'X' } as never} isOwnProfile={false} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
