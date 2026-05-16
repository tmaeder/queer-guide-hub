/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({
  fetchEmailTemplates: vi.fn().mockResolvedValue([]),
  upsertEmailTemplate: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import EmailTemplates from '../EmailTemplates';

describe('EmailTemplates', () => {
  it('renders without crashing', () => {
    const { container } = render(<EmailTemplates />);
    expect(container).toBeTruthy();
  });
});
