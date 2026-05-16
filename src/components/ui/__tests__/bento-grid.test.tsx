/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BentoGrid, BentoCell } from '../bento-grid';

describe('BentoGrid', () => {
  it('renders cells', () => {
    render(
      <BentoGrid>
        <BentoCell title="A">body</BentoCell>
      </BentoGrid>,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});
