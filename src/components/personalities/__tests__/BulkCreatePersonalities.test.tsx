/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

import { BulkCreatePersonalities } from '../BulkCreatePersonalities';

describe('BulkCreatePersonalities', () => {
  it('renders', () => {
    const { container } = render(<BulkCreatePersonalities />);
    expect(container).toBeTruthy();
  });
});
