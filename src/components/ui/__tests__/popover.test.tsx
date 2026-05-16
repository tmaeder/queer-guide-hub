/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Popover, PopoverTrigger, PopoverContent } from '../popover';

describe('Popover', () => {
  it('renders closed', () => {
    const { container } = render(
      <Popover open={false}>
        <PopoverTrigger>Trigger</PopoverTrigger>
        <PopoverContent>Body</PopoverContent>
      </Popover>,
    );
    expect(container).toBeTruthy();
  });
});
