/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../select';

describe('Select', () => {
  it('renders trigger', () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(container).toBeTruthy();
  });

  it('shows an item aside in the open list but not in the closed trigger', () => {
    render(
      <Select defaultOpen value="uk">
        <SelectTrigger aria-label="Competition">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="uk" aside="39">
            Drag Race UK
          </SelectItem>
        </SelectContent>
      </Select>,
    );
    const option = screen.getByRole('option', { name: /Drag Race UK/ });
    expect(option.textContent).toContain('39');
    // Radix mirrors ItemText into the trigger; the aside must not travel with it.
    const trigger = screen.getByRole('combobox', { name: 'Competition', hidden: true });
    expect(trigger.textContent).toContain('Drag Race UK');
    expect(trigger.textContent).not.toContain('39');
  });
});
