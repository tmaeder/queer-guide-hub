/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CardContainer3D, CardItem } from '../CardContainer3D';

describe('CardContainer3D', () => {
  it('renders', () => {
    const { container } = render(
      <CardContainer3D>
        <CardItem>x</CardItem>
      </CardContainer3D>,
    );
    expect(container).toBeTruthy();
  });
});
