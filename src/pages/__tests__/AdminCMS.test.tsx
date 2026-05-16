/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/cms/CMSShell', () => ({
  CMSShell: () => <div data-testid="cms" />,
}));

import AdminCMS from '../AdminCMS';

describe('AdminCMS', () => {
  it('renders CMSShell', () => {
    render(<AdminCMS />);
    expect(screen.getByTestId('cms')).toBeInTheDocument();
  });
});
