/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import { SecureFinancialDataViewer } from '../SecureFinancialDataViewer';

describe('SecureFinancialDataViewer', () => {
  it('renders', () => {
    const { container } = render(
      <SecureFinancialDataViewer userId="u1"><div>child</div></SecureFinancialDataViewer>,
    );
    expect(container).toBeTruthy();
  });
});
