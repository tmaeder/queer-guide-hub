import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/useMailbox', () => ({ useMailbox: () => ({ emails: [], unreadCount: 0, loading: false }) }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ notifications: [], unreadCount: 0 }) }));
import { useUnifiedInbox } from '../useUnifiedInbox';
describe('useUnifiedInbox', () => { it('should merge empty inboxes', () => { const { result } = renderHook(() => useUnifiedInbox()); expect(result.current.items).toEqual([]); expect(result.current.totalUnread).toBe(0); }); it('should expose mailbox', () => { const { result } = renderHook(() => useUnifiedInbox()); expect(result.current).toHaveProperty('mailbox'); }); });
