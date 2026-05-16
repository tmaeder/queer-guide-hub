/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useFeedbackShortcuts', () => ({
  shortcutHelp: [
    { key: 'j', label: 'Next' },
    { key: 'k', label: 'Previous' },
  ],
}));

import { ShortcutHelpDialog } from '../ShortcutHelpDialog';

describe('ShortcutHelpDialog', () => {
  it('renders nothing when closed', () => {
    render(<ShortcutHelpDialog open={false} onClose={() => {}} />);
    expect(screen.queryByText('Keyboard shortcuts')).not.toBeInTheDocument();
  });

  it('renders title + every shortcut row when open', () => {
    render(<ShortcutHelpDialog open onClose={() => {}} />);
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(screen.getByText('j')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('k')).toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();
  });
});
