/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EdgeConditionPopover from '../EdgeConditionPopover';

const edge = { id: 'e1', data: { condition: 'items_count > 0' } } as never;

describe('EdgeConditionPopover', () => {
  it('renders nothing when edge is null', () => {
    render(<EdgeConditionPopover edge={null} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} anchorX={0} anchorY={0} />);
    expect(screen.queryByText(/Edge Condition/)).toBeNull();
  });

  it('renders condition input with existing value', () => {
    render(<EdgeConditionPopover edge={edge} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} anchorX={0} anchorY={0} />);
    expect(screen.getByDisplayValue('items_count > 0')).toBeInTheDocument();
  });

  it('Save calls onUpdate', () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    render(<EdgeConditionPopover edge={edge} onClose={onClose} onUpdate={onUpdate} onDelete={vi.fn()} anchorX={0} anchorY={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(onUpdate).toHaveBeenCalledWith('e1', 'items_count > 0');
    expect(onClose).toHaveBeenCalled();
  });

  it('Clear empties condition + closes', () => {
    const onUpdate = vi.fn();
    render(<EdgeConditionPopover edge={edge} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn()} anchorX={0} anchorY={0} />);
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(onUpdate).toHaveBeenCalledWith('e1', '');
  });

  it('Delete edge fires onDelete', () => {
    const onDelete = vi.fn();
    render(<EdgeConditionPopover edge={edge} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} anchorX={0} anchorY={0} />);
    fireEvent.click(screen.getByRole('button', { name: /Delete edge/ }));
    expect(onDelete).toHaveBeenCalledWith('e1');
  });

  it('Clicking example sets condition', () => {
    const edgeEmpty = { id: 'e2', data: {} } as never;
    render(<EdgeConditionPopover edge={edgeEmpty} onClose={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} anchorX={0} anchorY={0} />);
    fireEvent.click(screen.getByText('items_count > 0'));
    expect(screen.getByDisplayValue('items_count > 0')).toBeInTheDocument();
  });
});
