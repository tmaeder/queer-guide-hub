/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { HANKY_CODE } from '@/lib/flags';

const [a, b, c] = HANKY_CODE;
vi.mock('@/hooks/useHankySignals', () => ({
  useHankyVariants: () => ({
    data: [
      { variantId: 'va', colorId: a.id },
      { variantId: 'vb', colorId: b.id },
      { variantId: 'vc', colorId: c.id },
    ],
  }),
}));

import { HankyWorn } from '../HankyWorn';

describe('HankyWorn', () => {
  it('groups worn colours by pocket, top first, and states the side once per group', () => {
    render(<HankyWorn signals={{ va: 'right', vb: 'left', vc: 'both' }} />);
    const groups = screen.getAllByRole('region').map((g) => g.getAttribute('aria-label'));
    expect(groups).toEqual([
      'Top · left pocket',
      'Either way · both pockets',
      'Bottom · right pocket',
    ]);
    const top = screen.getByRole('region', { name: 'Top · left pocket' });
    expect(within(top).getByText(b.meaningEn)).toBeTruthy();
    expect(within(top).queryByText(/left · top/)).toBeNull();
  });
});
