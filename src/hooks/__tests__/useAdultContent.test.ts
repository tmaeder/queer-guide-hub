/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useAdultAcknowledgement } from '@/hooks/useAdultContent';

const KEY = 'qg.marketplace.ageAck';

describe('useAdultAcknowledgement same-tab sync', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it('propagates acknowledge() to a separate hook instance in the same tab', () => {
    // Mirrors AdultContentGate + a sibling component (e.g. DepartmentBento,
    // MarketplaceCategory) each calling the hook independently — a storage
    // event alone never fires for the tab that made the change, so without
    // the same-tab broadcast the sibling instance stays stuck reporting
    // acknowledged=false until a full reload.
    const gate = renderHook(() => useAdultAcknowledgement());
    const sibling = renderHook(() => useAdultAcknowledgement());

    expect(gate.result.current.acknowledged).toBe(false);
    expect(sibling.result.current.acknowledged).toBe(false);

    act(() => {
      gate.result.current.acknowledge();
    });

    expect(gate.result.current.acknowledged).toBe(true);
    expect(sibling.result.current.acknowledged).toBe(true);
  });

  it('propagates reset() to a separate hook instance in the same tab', () => {
    localStorage.setItem(KEY, new Date().toISOString());
    const a = renderHook(() => useAdultAcknowledgement());
    const b = renderHook(() => useAdultAcknowledgement());

    expect(a.result.current.acknowledged).toBe(true);
    expect(b.result.current.acknowledged).toBe(true);

    act(() => {
      a.result.current.reset();
    });

    expect(a.result.current.acknowledged).toBe(false);
    expect(b.result.current.acknowledged).toBe(false);
  });
});
