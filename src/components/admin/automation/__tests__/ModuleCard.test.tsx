/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ModuleCard } from '../ModuleCard';

const module_ = {
  id: 'm1', slug: 'auto-tag', display_name: 'Auto Tagger',
  description: 'tags stuff',
  is_enabled: true,
  content_types: ['venues', 'events'],
  total_runs: 12,
  total_changes_proposed: 50,
  total_changes_applied: 35,
  auto_approve_threshold: 0.9,
  last_run_at: new Date(Date.now() - 60_000).toISOString(),
  last_run_status: 'success',
} as never;

const inRouter = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

describe('ModuleCard', () => {
  it('renders name + content types + stats', () => {
    render(inRouter(<ModuleCard module={module_} onToggle={vi.fn()} onRun={vi.fn()} onSettings={vi.fn()} isRunning={false} />));
    expect(screen.getByText('Auto Tagger')).toBeInTheDocument();
    expect(screen.getByText('venues')).toBeInTheDocument();
    expect(screen.getByText('events')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('Dry Run + Run Now buttons disabled when disabled module', () => {
    render(inRouter(<ModuleCard module={{ ...module_, is_enabled: false } as never} onToggle={vi.fn()} onRun={vi.fn()} onSettings={vi.fn()} isRunning={false} />));
    expect(screen.getByRole('button', { name: /Dry Run/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Run Now/ })).toBeDisabled();
  });

  it('Run Now fires onRun(slug)', () => {
    const onRun = vi.fn();
    render(inRouter(<ModuleCard module={module_} onToggle={vi.fn()} onRun={onRun} onSettings={vi.fn()} isRunning={false} />));
    fireEvent.click(screen.getByRole('button', { name: /Run Now/ }));
    expect(onRun).toHaveBeenCalledWith('auto-tag');
  });

  it('Dry Run fires onRun with dryRun=true', () => {
    const onRun = vi.fn();
    render(inRouter(<ModuleCard module={module_} onToggle={vi.fn()} onRun={onRun} onSettings={vi.fn()} isRunning={false} />));
    fireEvent.click(screen.getByRole('button', { name: /Dry Run/ }));
    expect(onRun).toHaveBeenCalledWith('auto-tag', true);
  });

  it('shows View pending changes link when proposed > 0', () => {
    render(inRouter(<ModuleCard module={module_} onToggle={vi.fn()} onRun={vi.fn()} onSettings={vi.fn()} isRunning={false} />));
    expect(screen.getByRole('link', { name: /View pending changes/ })).toHaveAttribute('href', '/admin/review?tab=automation');
  });

  it('Toggle switch fires onToggle', () => {
    const onToggle = vi.fn();
    render(inRouter(<ModuleCard module={module_} onToggle={onToggle} onRun={vi.fn()} onSettings={vi.fn()} isRunning={false} />));
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalled();
  });
});
