/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../sheet';

/**
 * This file previously contained one test that rendered the sheet CLOSED and
 * asserted the container was truthy. `SheetContent` returns `null` when closed,
 * so it asserted nothing about the sheet at all — which is how a `role="dialog"`
 * with no accessible name survived across all 32 sheets in the app.
 */
describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false}>
        <SheetContent>
          <SheetTitle>Filters</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a modal dialog when open', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow the list</SheetDescription>
          </SheetHeader>
          <SheetFooter>Done</SheetFooter>
        </SheetContent>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('takes its accessible name from SheetTitle', () => {
    // The defect this replaces: SheetTitle was an id-less <h2> and SheetContent
    // set no aria-labelledby, so a sheet WITH a title was still an unnamed
    // dialog (axe aria-dialog-name, serious). Unlike DialogTitle, this Sheet is
    // hand-rolled rather than Radix, so nothing wired the two together.
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Version history</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Version history' })).toBeInTheDocument();
  });

  it('omits aria-labelledby entirely when there is no title', () => {
    // Pointing at an id that never renders is worse than omitting the attribute:
    // AT resolves the name to nothing while the markup looks satisfied.
    render(
      <Sheet open>
        <SheetContent>
          <p>No heading here</p>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-labelledby');
  });

  it('lets a caller name the sheet with aria-label when it has no visible heading', () => {
    render(
      <Sheet open>
        <SheetContent aria-label="Admin navigation">
          <nav>links</nav>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Admin navigation' })).toBeInTheDocument();
  });

  it('honours a caller-supplied id on the title', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle id="custom-title">Kept</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('heading', { name: 'Kept' })).toHaveAttribute('id', 'custom-title');
  });

  it('always offers a named close control', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>T</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
