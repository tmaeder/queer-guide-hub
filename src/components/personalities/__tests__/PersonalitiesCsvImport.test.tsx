/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { PersonalitiesCsvImport } from '../PersonalitiesCsvImport';

describe('PersonalitiesCsvImport', () => {
  it('renders', () => {
    const { container } = render(<PersonalitiesCsvImport onImportComplete={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
