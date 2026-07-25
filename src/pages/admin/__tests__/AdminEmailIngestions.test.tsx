/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/admin/EmailIngestionsManager', () => ({
  EmailIngestionsManager: () => <div data-testid="ingestions" />,
}));

import AdminEmailIngestions from '../AdminEmailIngestions';

describe('AdminEmailIngestions', () => {
  it('renders EmailIngestionsManager', () => {
    render(<AdminEmailIngestions />);
    expect(screen.getByTestId('ingestions')).toBeInTheDocument();
  });
});
