import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TagsEditor } from '../TagsEditor';
import type { FieldConfig } from '@/types/cms';

const FIELD: FieldConfig = { name: 'tags', label: 'Tags', type: 'tags', group: 'details' };

describe('TagsEditor', () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    onSave.mockReset();
    onCancel.mockReset();
  });

  it('renders existing tags as chips', () => {
    render(
      <TagsEditor
        field={FIELD}
        initialValue={['gay', 'drag']}
        onSave={onSave}
        onCancel={onCancel}
        saving={false}
      />,
    );
    expect(screen.getByText('gay')).toBeInTheDocument();
    expect(screen.getByText('drag')).toBeInTheDocument();
  });

  it('adds a tag on Enter when input has content', () => {
    render(
      <TagsEditor
        field={FIELD}
        initialValue={[]}
        onSave={onSave}
        onCancel={onCancel}
        saving={false}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Tags' });
    fireEvent.change(input, { target: { value: 'new-tag' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('new-tag')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves with current list on Enter when input is empty', () => {
    render(
      <TagsEditor
        field={FIELD}
        initialValue={['a', 'b']}
        onSave={onSave}
        onCancel={onCancel}
        saving={false}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Tags' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith(['a', 'b']);
  });

  it('removes last tag on Backspace when input is empty', () => {
    render(
      <TagsEditor
        field={FIELD}
        initialValue={['a', 'b']}
        onSave={onSave}
        onCancel={onCancel}
        saving={false}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Tags' });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.queryByText('b')).toBeNull();
    expect(screen.getByText('a')).toBeInTheDocument();
  });

  it('cancels on Escape', () => {
    render(
      <TagsEditor
        field={FIELD}
        initialValue={['a']}
        onSave={onSave}
        onCancel={onCancel}
        saving={false}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Tags' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('lowercases and dedupes tags', () => {
    render(
      <TagsEditor
        field={FIELD}
        initialValue={['gay']}
        onSave={onSave}
        onCancel={onCancel}
        saving={false}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Tags' });
    fireEvent.change(input, { target: { value: 'GAY' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Should not have added a duplicate
    expect(screen.getAllByText('gay').length).toBe(1);
  });
});
