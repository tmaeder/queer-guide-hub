/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));
vi.mock('@/components/messaging/MessagingInterface', () => ({
  MessagingInterface: () => <div data-testid="msg-iface" />,
}));
vi.mock('@/components/layout/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: (p: { title: string }) => <h1>{p.title}</h1>,
}));

import Messages from '../Messages';

describe('Messages page', () => {
  it('renders heading and MessagingInterface', () => {
    render(<Messages />);
    expect(screen.getByRole('heading', { name: 'Messages' })).toBeInTheDocument();
    expect(screen.getByTestId('msg-iface')).toBeInTheDocument();
  });
});
