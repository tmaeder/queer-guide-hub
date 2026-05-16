/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../dialog';

describe('Dialog', () => {
  it('renders closed', () => {
    const { container } = render(
      <Dialog open={false}>
        <DialogContent>
          <DialogHeader><DialogTitle>T</DialogTitle></DialogHeader>
          <DialogDescription>D</DialogDescription>
          <DialogFooter>F</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(container).toBeTruthy();
  });
});
