/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePageFetchers', () => ({
  listFromWhere: vi.fn().mockResolvedValue([]),
  insertInto: vi.fn().mockResolvedValue({}),
  updateRow: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { TranslationPanel } from '../TranslationPanel';

describe('TranslationPanel', () => {
  it('renders', () => {
    const { container } = render(<TranslationPanel tableName="venues" recordId="v1" originalData={{ name: 'X' }} />);
    expect(container).toBeTruthy();
  });
});
