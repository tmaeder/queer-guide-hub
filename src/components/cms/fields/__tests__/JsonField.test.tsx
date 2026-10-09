/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JsonField } from '../JsonField';
import { summarizeStructured, humanizeKey } from '../structured/structuredValue';

const field = { name: 'meta', label: 'Meta', type: 'json' } as never;

/** No JSON syntax may reach the editor's screen. */
function expectNoJsonSyntax(container: HTMLElement) {
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/[{}[\]]|":/);
  for (const el of container.querySelectorAll('input, textarea')) {
    expect((el as HTMLInputElement).value).not.toMatch(/[{}[\]]|":/);
  }
}

describe('JsonField', () => {
  it('offers to start structure when empty, never a JSON textarea', () => {
    const onChange = vi.fn();
    const { container } = render(<JsonField field={field} value={null} onChange={onChange} />);
    expect(screen.getByText('Meta')).toBeInTheDocument();
    expect(container.querySelector('textarea')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start with fields' }));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('edits an object as named fields', () => {
    const onChange = vi.fn();
    const { container } = render(
      <JsonField field={field} value={{ open: '09:00', closed: false, seats: 4 }} onChange={onChange} />,
    );
    expectNoJsonSyntax(container);
    fireEvent.change(screen.getByLabelText('Meta › Open'), { target: { value: '10:00' } });
    expect(onChange).toHaveBeenLastCalledWith({ open: '10:00', closed: false, seats: 4 });
    fireEvent.change(screen.getByLabelText('Meta › Seats'), { target: { value: '6' } });
    expect(onChange).toHaveBeenLastCalledWith({ open: '09:00', closed: false, seats: 6 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Closed' }));
    expect(onChange).toHaveBeenLastCalledWith({ open: '09:00', seats: 4 });
  });

  it('renames a field on blur and keeps order', () => {
    const onChange = vi.fn();
    render(<JsonField field={field} value={{ a: 1, b: 2 }} onChange={onChange} />);
    const key = screen.getByLabelText('Name of field A');
    fireEvent.change(key, { target: { value: 'z' } });
    fireEvent.blur(key);
    expect(Object.keys(onChange.mock.calls.at(-1)![0])).toEqual(['z', 'b']);
  });

  it('refuses a duplicate field name', () => {
    const onChange = vi.fn();
    render(<JsonField field={field} value={{ a: 1, b: 2 }} onChange={onChange} />);
    const key = screen.getByLabelText('Name of field A') as HTMLInputElement;
    fireEvent.change(key, { target: { value: 'b' } });
    fireEvent.blur(key);
    expect(onChange).not.toHaveBeenCalled();
    expect(key.value).toBe('a');
  });

  it('edits lists and adds an item shaped like the last one', () => {
    const onChange = vi.fn();
    render(
      <JsonField field={field} value={[{ day: 1, open: '09:00' }]} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(onChange).toHaveBeenLastCalledWith([
      { day: 1, open: '09:00' },
      { day: 0, open: '' },
    ]);
  });

  it('decodes a legacy JSON string into structure', () => {
    const { container } = render(
      <JsonField field={field} value={'{"legal":true}'} onChange={vi.fn()} />,
    );
    expectNoJsonSyntax(container);
    expect(screen.getByLabelText('Meta › Legal')).toBeInTheDocument();
  });

  it('renders read-only values as labelled rows', () => {
    const { container } = render(
      <JsonField
        field={field}
        value={{ death_penalty: 'No', penalty: { min_years: 2, notes: ['a', 'b'] } }}
        onChange={vi.fn()}
        disabled
      />,
    );
    expectNoJsonSyntax(container);
    expect(screen.getByText('Death penalty')).toBeInTheDocument();
    expect(screen.getByText('Min years')).toBeInTheDocument();
    expect(container.querySelector('input, textarea')).toBeNull();
  });
});

describe('structuredValue helpers', () => {
  it('humanizes keys', () => {
    expect(humanizeKey('hate_crime_law')).toBe('Hate crime law');
    expect(humanizeKey('gpsLatitude')).toBe('Gps latitude');
    expect(humanizeKey('ISO_code')).toBe('ISO code');
  });
  it('summarizes for table cells without JSON', () => {
    expect(summarizeStructured({ open: '09:00', close: '17:00' })).toBe('Open: 09:00 · Close: 17:00');
    expect(summarizeStructured(['x', 'y'])).toBe('x, y');
    expect(summarizeStructured([{ a: 1 }, { a: 2 }])).toBe('2 items');
    expect(summarizeStructured({})).toBe('—');
  });
});
