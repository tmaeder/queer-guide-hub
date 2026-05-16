/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

import PresenceIndicator from '../PresenceIndicator';

describe('PresenceIndicator', () => {
  it('renders nothing when no pipelineId', () => {
    const { container } = render(<PresenceIndicator pipelineId={undefined} isDirty={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing initially when others list empty', () => {
    const { container } = render(<PresenceIndicator pipelineId="p1" isDirty={false} />);
    expect(container.firstChild).toBeNull();
  });
});
