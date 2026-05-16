/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../dropdown-menu';

describe('DropdownMenu', () => {
  it('renders closed', () => {
    const { container } = render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>A</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(container).toBeTruthy();
  });
});
