/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NodeContextMenu from '../NodeContextMenu';

const baseProps = {
  x: 100, y: 100, nodeId: 'n1',
  onClose: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
  onConfigure: vi.fn(),
  onCopyConfig: vi.fn(),
  onPasteConfig: vi.fn(),
  canPaste: true,
};

describe('NodeContextMenu', () => {
  it('renders all menu items', () => {
    render(<NodeContextMenu {...baseProps} />);
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('Copy config')).toBeInTheDocument();
    expect(screen.getByText('Paste config')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('disables Paste config when canPaste=false', () => {
    render(<NodeContextMenu {...baseProps} canPaste={false} />);
    expect(screen.getByRole('menuitem', { name: /Paste config/ })).toBeDisabled();
  });

  it('Configure fires onConfigure + onClose', () => {
    const onConfigure = vi.fn();
    const onClose = vi.fn();
    render(<NodeContextMenu {...baseProps} onConfigure={onConfigure} onClose={onClose} />);
    fireEvent.click(screen.getByText('Configure'));
    expect(onConfigure).toHaveBeenCalledWith('n1');
    expect(onClose).toHaveBeenCalled();
  });

  it('Delete fires onDelete', () => {
    const onDelete = vi.fn();
    render(<NodeContextMenu {...baseProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('n1');
  });

  it('Esc key closes menu', () => {
    const onClose = vi.fn();
    render(<NodeContextMenu {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
