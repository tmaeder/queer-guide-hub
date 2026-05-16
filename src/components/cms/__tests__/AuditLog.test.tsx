/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useCMSAudit', () => ({
  useCMSAudit: () => ({
    entries: [], loading: false, error: null, totalCount: 0,
    loadForContent: vi.fn(), loadGlobal: vi.fn(),
  }),
}));

import { AuditLog } from '../AuditLog';

describe('AuditLog', () => {
  it('renders', () => {
    const { container } = render(<AuditLog sourceTable="venues" sourceId="v1" />);
    expect(container).toBeTruthy();
  });
});
