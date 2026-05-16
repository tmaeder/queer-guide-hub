/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useSearchIntelligence', () => ({
  callSearchIntelligence: vi.fn().mockResolvedValue({ success: true, data: { score: 0.7, axes: {} } }),
}));
vi.mock('@/lib/visibilityScore', () => ({
  assertVisibilityResult: (x: unknown) => x,
  recomputeVisibilityScore: (x: unknown) => x,
  scoreLabel: () => 'medium',
  VISIBILITY_AXES: ['tags', 'geo', 'images', 'dates', 'text', 'synonyms', 'queries'],
}));

import { IngestionQualityTab } from '../IngestionQualityTab';

describe('IngestionQualityTab', () => {
  it('renders without crashing', () => {
    const { container } = render(<IngestionQualityTab />);
    expect(container).toBeTruthy();
  });
});
