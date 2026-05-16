/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Command, CommandInput, CommandList, CommandItem, CommandGroup, CommandEmpty } from '../command';

describe('Command', () => {
  it('renders', () => {
    const { container } = render(
      <Command>
        <CommandInput placeholder="search" />
        <CommandList>
          <CommandEmpty>None</CommandEmpty>
          <CommandGroup heading="Items">
            <CommandItem>A</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );
    expect(container).toBeTruthy();
  });
});
