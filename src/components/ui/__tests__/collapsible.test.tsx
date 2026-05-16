/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../collapsible';

describe('Collapsible', () => {
  it('renders', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Body</CollapsibleContent>
      </Collapsible>,
    );
    expect(screen.getByText('Toggle')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});
