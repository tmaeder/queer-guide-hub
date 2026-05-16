/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '../sheet';

describe('Sheet', () => {
  it('renders closed', () => {
    const { container } = render(
      <Sheet open={false}>
        <SheetContent>
          <SheetHeader><SheetTitle>T</SheetTitle></SheetHeader>
          <SheetDescription>D</SheetDescription>
          <SheetFooter>F</SheetFooter>
        </SheetContent>
      </Sheet>,
    );
    expect(container).toBeTruthy();
  });
});
