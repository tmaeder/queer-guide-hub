/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '../carousel';

describe('Carousel', () => {
  it('renders', () => {
    const { container } = render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>A</CarouselItem>
          <CarouselItem>B</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );
    expect(container).toBeTruthy();
  });
});
