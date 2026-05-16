/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { YearInReview } from '../YearInReview';

describe('YearInReview', () => {
  it('renders', () => {
    const { container } = render(
      <YearInReview data={{ year: 2025, countries: 3, topCity: 'Berlin', venues: 10, events: 5 }} />,
    );
    expect(container).toBeTruthy();
  });
});
