/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useAccessibility', () => ({
  useAccessibility: () => ({
    settings: { high_contrast: false, reduce_motion: false, large_text: false, dyslexia_font: false, focus_outline: false },
    updateSetting: vi.fn(),
  }),
}));

import { AccessibilityControls } from '../AccessibilityControls';

describe('AccessibilityControls', () => {
  it('renders', () => {
    const { container } = render(<AccessibilityControls />);
    expect(container).toBeTruthy();
  });
});
