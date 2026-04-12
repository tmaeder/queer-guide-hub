import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => { const h: ProxyHandler<any> = { get: (_t, p) => (p === 'then' ? undefined : (..._a: any[]) => new Proxy(() => {}, h)), apply: () => new Proxy(() => {}, h) }; return { supabase: { from: () => new Proxy(() => {}, h), functions: { invoke: vi.fn() } } }; });
import { useScrapeSourcesManager } from '../useScrapeSourcesManager';
describe('useScrapeSourcesManager', () => { it('should expose scrape management API', () => { const { result } = renderHook(() => useScrapeSourcesManager()); expect(typeof result.current.fetchSources).toBe('function'); expect(typeof result.current.triggerScrape).toBe('function'); expect(result.current.loading).toBe(false); }); });
