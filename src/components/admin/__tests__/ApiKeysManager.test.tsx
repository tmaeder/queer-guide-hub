/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useApiKeys', () => ({
  useApiKeys: () => ({
    keys: [], requiredKeys: [], loading: false,
    createApiKey: vi.fn(), updateApiKey: vi.fn(), deleteApiKey: vi.fn(),
    toggleApiKey: vi.fn(), refreshKeys: vi.fn(),
  }),
}));
vi.mock('../ChatGPTConnection', () => ({ ChatGPTConnection: () => null }));

import { ApiKeysManager } from '../ApiKeysManager';

describe('ApiKeysManager', () => {
  it('renders without crashing', () => {
    const { container } = render(<ApiKeysManager />);
    expect(container).toBeTruthy();
  });
});
