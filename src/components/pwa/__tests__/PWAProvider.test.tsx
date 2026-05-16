/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PWAProvider, usePWA } from '../PWAProvider';

function Inner() {
  const ctx = usePWA();
  return <span>{ctx?.canInstall ? 'yes' : 'no'}</span>;
}

describe('PWAProvider', () => {
  it('provides context', () => {
    render(<PWAProvider><Inner /></PWAProvider>);
    expect(screen.getByText('no')).toBeInTheDocument();
  });
});
