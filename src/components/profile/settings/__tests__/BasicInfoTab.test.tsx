/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePageFetchers', () => ({ updateRowsBy: vi.fn() }));
vi.mock('@/hooks/useProfessions', () => ({
  useProfessions: () => ({ professions: ['Activist'], loading: false }),
}));

import { BasicInfoTab } from '../BasicInfoTab';

describe('BasicInfoTab', () => {
  it('renders', () => {
    const { container } = render(
      <BasicInfoTab
        formData={
          {
            first_name: '',
            last_name: '',
            chosen_name: '',
            display_name: '',
            pronouns: '',
            pronoun_tags: [],
            name_pronunciation: '',
            bio: '',
            location: '',
            date_of_birth: '',
            occupation: '',
            education: '',
            privacy_settings: { profile_visibility: 'public', email_visible: false, phone_visible: false },
            social_links: {},
          } as never
        }
        profile={{} as never}
        user={{ id: 'u1', email: 'x@y.z' } as never}
        onChange={vi.fn()}
        onPronounTagsChange={vi.fn()}
        onPrivacyChange={vi.fn()}
      />,
    );
    expect(container).toBeTruthy();
  });
});
