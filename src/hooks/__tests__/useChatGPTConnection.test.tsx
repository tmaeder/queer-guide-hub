import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) } } }));
import { useChatGPTConnection } from '../useChatGPTConnection';
describe('useChatGPTConnection', () => { it('should expose connection API', () => { const { result } = renderHook(() => useChatGPTConnection()); expect(typeof result.current.connect).toBe('function'); expect(typeof result.current.disconnect).toBe('function'); expect(typeof result.current.testConnection).toBe('function'); expect(result.current.loading).toBe(true); }); });
