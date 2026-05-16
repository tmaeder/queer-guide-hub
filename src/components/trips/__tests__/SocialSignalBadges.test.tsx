/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, opts: { defaultValue?: string; count?: number }) => {
    const d = opts?.defaultValue ?? _k;
    return d.replace('{{count}}', String(opts?.count ?? ''));
  } }),
}));

import { SocialSignalBadges } from '../SocialSignalBadges';

describe('SocialSignalBadges', () => {
  it('renders nothing when signal undefined', () => {
    const { container } = render(<SocialSignalBadges signal={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no friends and trip_usage below threshold', () => {
    const { container } = render(
      <SocialSignalBadges signal={{ friends_saved: 0, trip_usage: 1 } as never} tripUsageThreshold={3} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders friends badge when friends_saved > 0', () => {
    render(<SocialSignalBadges signal={{ friends_saved: 2, trip_usage: 0 } as never} />);
    expect(screen.getByText(/2 friend\(s\) saved/i)).toBeInTheDocument();
  });

  it('renders trips badge when trip_usage >= threshold', () => {
    render(<SocialSignalBadges signal={{ friends_saved: 0, trip_usage: 5 } as never} tripUsageThreshold={3} />);
    expect(screen.getByText(/in 5 trip\(s\)/i)).toBeInTheDocument();
  });

  it('renders both badges when both conditions met', () => {
    render(<SocialSignalBadges signal={{ friends_saved: 1, trip_usage: 4 } as never} tripUsageThreshold={3} />);
    expect(screen.getByText(/1 friend/i)).toBeInTheDocument();
    expect(screen.getByText(/in 4 trip/i)).toBeInTheDocument();
  });
});
