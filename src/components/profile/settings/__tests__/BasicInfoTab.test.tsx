/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ updateRowsBy: vi.fn() }));

import { BasicInfoTab } from '../BasicInfoTab';

describe('BasicInfoTab', () => {
  it('renders', () => {
    const { container } = render(
      <BasicInfoTab formData={{ first_name: '', last_name: '', chosen_name: '', display_name: '', pronouns: '', name_pronunciation: '', bio: '', location: '', date_of_birth: '', social_links: {} } as never} profile={{} as never} user={{ id: 'u1', email: 'x@y.z' } as never} onChange={vi.fn()} onAvatarSave={vi.fn()} />,
    );
    expect(container).toBeTruthy();
  });
});
