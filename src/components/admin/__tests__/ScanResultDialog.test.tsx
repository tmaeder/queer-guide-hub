/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScanResultDialog } from '../ScanResultDialog';

const benignLink = {
  original_url: 'https://x',
  scan_id: 'sc1',
  scan_verdict: 'benign',
  scan_score: 5,
  scan_categories: ['social'],
  scan_brands: [],
  scanned_at: '2026-05-15T00:00:00Z',
  scan_screenshot_url: 'https://shot/1.png',
} as never;

const maliciousLink = {
  original_url: 'https://bad',
  scan_id: 'sc2',
  scan_verdict: 'malicious',
  scan_score: 90,
  scan_categories: ['phishing'],
  scan_brands: ['Booking.com'],
} as never;

describe('ScanResultDialog', () => {
  it('renders nothing when no link', () => {
    render(<ScanResultDialog open link={null} onClose={vi.fn()} onRescan={vi.fn()} />);
    expect(screen.queryByText(/URL Scan Result/)).toBeNull();
  });

  it('shows unscanned state when no scan_id', () => {
    render(<ScanResultDialog open link={{ original_url: 'https://x', scan_id: null } as never} onClose={vi.fn()} onRescan={vi.fn()} />);
    expect(screen.getByText(/not been scanned yet/)).toBeInTheDocument();
  });

  it('shows Safe badge + categories for benign verdict', () => {
    render(<ScanResultDialog open link={benignLink} onClose={vi.fn()} onRescan={vi.fn()} />);
    expect(screen.getByText('Safe')).toBeInTheDocument();
    expect(screen.getByText('social')).toBeInTheDocument();
  });

  it('shows brand impersonation warning when brands present', () => {
    render(<ScanResultDialog open link={maliciousLink} onClose={vi.fn()} onRescan={vi.fn()} />);
    expect(screen.getByText(/Brand Impersonation Detected/)).toBeInTheDocument();
    expect(screen.getByText('Booking.com')).toBeInTheDocument();
  });

  it('Rescan disabled while scanning + label flips to Scanning…', () => {
    render(<ScanResultDialog open link={benignLink} onClose={vi.fn()} onRescan={vi.fn()} scanning />);
    expect(screen.getByRole('button', { name: /Scanning/ })).toBeDisabled();
  });

  it('Rescan button calls onRescan', () => {
    const onRescan = vi.fn();
    render(<ScanResultDialog open link={benignLink} onClose={vi.fn()} onRescan={onRescan} />);
    fireEvent.click(screen.getByRole('button', { name: /Re-scan/ }));
    expect(onRescan).toHaveBeenCalled();
  });
});
