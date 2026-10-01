/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StructuredFieldEditor, StructuredValue } from '../StructuredDataView';

describe('StructuredValue', () => {
  it('renders nested records as labeled content instead of serialized JSON', () => {
    render(
      <StructuredValue value={{ city: 'Zürich', country: 'CH', access: { stepFree: true } }} />,
    );
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('Zürich')).toBeInTheDocument();
    expect(screen.getByText('Step Free')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.queryByText(/\{"city"/)).not.toBeInTheDocument();
  });

  it('renders URLs as links and lists as chips', () => {
    render(
      <StructuredValue value={{ website: 'https://example.org/place', tags: ['cafe', 'queer'] }} />,
    );
    expect(screen.getByRole('link', { name: /example\.org\/place/ })).toHaveAttribute(
      'href',
      'https://example.org/place',
    );
    expect(screen.getByText('cafe')).toBeInTheDocument();
    expect(screen.getByText('queer')).toBeInTheDocument();
  });
});

describe('StructuredFieldEditor', () => {
  it('tracks a correction and sends only changed fields', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onDirtyChange = vi.fn();
    render(
      <StructuredFieldEditor
        data={{ name: 'Old name', description: 'Readable description', active: true }}
        onSave={onSave}
        onDirtyChange={onDirtyChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('Old name'), { target: { value: 'Correct name' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(1));
    fireEvent.click(screen.getByRole('button', { name: 'Save 1' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Correct name' }));
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(0));
  });
});
