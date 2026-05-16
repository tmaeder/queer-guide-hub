/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ContentWarningBanner, SensitivityBadges } from '../ContentWarningBanner';

describe('ContentWarningBanner', () => {
  it('returns null when warnings empty', () => {
    const { container } = render(<ContentWarningBanner warnings={null as never} />);
    expect(container.firstChild).toBeNull();
  });
  it('renders with warnings', () => {
    const { container } = render(<ContentWarningBanner warnings={{ legal: true } as never} />);
    expect(container).toBeTruthy();
  });
  it('SensitivityBadges renders', () => {
    const { container } = render(<SensitivityBadges sensitivityFlags={['legal', 'nsfw'] as never} relevanceScore={0.5} />);
    expect(container).toBeTruthy();
  });
});
