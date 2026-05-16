/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/icons/brand', () => ({ Github: () => <svg /> }));

import { DrawerActionFooter } from '../DrawerActionFooter';

const baseProps = {
  isSpam: false,
  isForwarded: false,
  isForwarding: false,
  githubIssueUrl: null,
  githubIssueNumber: null,
  notifySubmitter: false,
  hasContactEmail: true,
  onToggleSpam: vi.fn(),
  onToggleNotify: vi.fn(),
  onCopyPrompt: vi.fn(),
  onForward: vi.fn(),
};

describe('DrawerActionFooter', () => {
  it('renders Spam, Copy, GitHub buttons by default', () => {
    render(<DrawerActionFooter {...baseProps} />);
    expect(screen.getByRole('button', { name: /Spam/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GitHub/i })).toBeInTheDocument();
  });

  it('shows Restore when isSpam=true', () => {
    render(<DrawerActionFooter {...baseProps} isSpam />);
    expect(screen.getByRole('button', { name: /Restore/i })).toBeInTheDocument();
  });

  it('Spam click toggles onToggleSpam(true)', () => {
    const onToggleSpam = vi.fn();
    render(<DrawerActionFooter {...baseProps} onToggleSpam={onToggleSpam} />);
    fireEvent.click(screen.getByRole('button', { name: /Spam/i }));
    expect(onToggleSpam).toHaveBeenCalledWith(true);
  });

  it('Copy click fires onCopyPrompt', () => {
    const onCopy = vi.fn();
    render(<DrawerActionFooter {...baseProps} onCopyPrompt={onCopy} />);
    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));
    expect(onCopy).toHaveBeenCalled();
  });

  it('shows issue number link when isForwarded', () => {
    render(<DrawerActionFooter {...baseProps} isForwarded githubIssueUrl="https://x" githubIssueNumber={42} />);
    expect(screen.getByRole('button', { name: /#42/i })).toBeInTheDocument();
  });

  it('shows Forwarding label while forwarding', () => {
    render(<DrawerActionFooter {...baseProps} isForwarding />);
    expect(screen.getByText(/Forwarding/i)).toBeInTheDocument();
  });

  it('shows (no email) hint when hasContactEmail=false', () => {
    render(<DrawerActionFooter {...baseProps} hasContactEmail={false} />);
    expect(screen.getByText(/no email/i)).toBeInTheDocument();
  });

  it('Notify checkbox toggles onToggleNotify', () => {
    const onNotify = vi.fn();
    render(<DrawerActionFooter {...baseProps} onToggleNotify={onNotify} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onNotify).toHaveBeenCalledWith(true);
  });
});
