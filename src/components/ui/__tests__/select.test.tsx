/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';

describe('Select', () => {
  it('renders trigger', () => {
    const { container } = render(
      <Select>
        <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(container).toBeTruthy();
  });
});
