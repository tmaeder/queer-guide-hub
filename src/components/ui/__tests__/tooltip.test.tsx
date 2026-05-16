/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../tooltip';

describe('Tooltip', () => {
  it('renders', () => {
    const { container } = render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover</TooltipTrigger>
          <TooltipContent>Tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(container).toBeTruthy();
  });
});
