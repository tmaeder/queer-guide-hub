/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../accordion';

describe('Accordion', () => {
  it('renders', () => {
    render(
      <Accordion type="single">
        <AccordionItem value="x">
          <AccordionTrigger>Trigger</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.getByText('Trigger')).toBeInTheDocument();
  });
});
