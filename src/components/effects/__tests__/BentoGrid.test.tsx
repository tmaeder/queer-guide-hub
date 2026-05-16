/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BentoGrid, BentoGridItem } from '../BentoGrid';

describe('effects/BentoGrid', () => {
  it('renders', () => {
    const { container } = render(
      <BentoGrid>
        <BentoGridItem title="A" description="d" />
      </BentoGrid>,
    );
    expect(container).toBeTruthy();
  });
});
