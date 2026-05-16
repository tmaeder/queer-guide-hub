/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModuleSettingsDialog } from '../ModuleSettingsDialog';

const baseModule = {
  id: 'm1',
  display_name: 'Auto Tagger',
  auto_approve_threshold: 0.9,
  batch_size: 100,
  rate_limit_per_hour: 10,
} as never;

describe('ModuleSettingsDialog', () => {
  it('renders nothing when no module', () => {
    render(<ModuleSettingsDialog module={null} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByText(/Settings/)).toBeNull();
  });

  it('renders all three settings', () => {
    render(<ModuleSettingsDialog module={baseModule} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText(/Auto-Approve Threshold/)).toBeInTheDocument();
    expect(screen.getByText(/Batch Size/)).toBeInTheDocument();
    expect(screen.getByText(/Rate Limit/)).toBeInTheDocument();
  });

  it('Save disabled when no changes', () => {
    render(<ModuleSettingsDialog module={baseModule} open onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Save Settings/ })).toBeDisabled();
  });

  it('Save enables and fires onSave with edited values', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<ModuleSettingsDialog module={baseModule} open onClose={onClose} onSave={onSave} />);
    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/ }));
    expect(onSave).toHaveBeenCalledWith('m1', expect.objectContaining({ batch_size: 200 }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel fires onClose', () => {
    const onClose = vi.fn();
    render(<ModuleSettingsDialog module={baseModule} open onClose={onClose} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
