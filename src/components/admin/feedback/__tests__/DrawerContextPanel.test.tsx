/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/utils/timezone', () => ({ timeAgo: () => '1h ago' }));

import { DrawerContextPanel } from '../DrawerContextPanel';

describe('DrawerContextPanel', () => {
  it('renders nothing when no content', () => {
    const { container } = render(<DrawerContextPanel ctx={{}} screenshotUrl={null} voteCount={0} submittedAt="now" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders trigger when content present', () => {
    render(<DrawerContextPanel
      ctx={{ url: 'https://x', user_agent: 'UA', viewport: { width: 1024, height: 768 }, color_scheme: 'dark' }}
      screenshotUrl="https://shot/1.png"
      voteCount={5}
      submittedAt="2026-05-15T00:00:00Z"
    />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
