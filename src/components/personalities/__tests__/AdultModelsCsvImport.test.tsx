/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AdultModelsCsvImport } from '../AdultModelsCsvImport';

describe('AdultModelsCsvImport', () => {
  it('renders', () => {
    const { container } = render(<AdultModelsCsvImport onImportComplete={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
