import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The defect: `supabase.from(...).insert(...)` RESOLVES with `{ error }`
 * instead of throwing, so `try { await insert } catch {}` catches nothing. A
 * CHECK violation or RLS refusal was discarded without a trace, and the
 * resulting absence of rows read as an absence of users
 * (docs/audits/2026-08-21-signup-consent-gap.md).
 *
 * So the mock below RESOLVES an error object. A test that made it THROW would
 * pass against the old broken code too, and would be testing nothing.
 */

const insert = vi.fn();
const captureMessage = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => ({ insert }) },
}));
vi.mock('@sentry/react', () => ({ captureMessage }));

const { insertTelemetry } = await import('../telemetryInsert');

beforeEach(() => {
  insert.mockReset();
  captureMessage.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('insertTelemetry', () => {
  it('reports a RESOLVED error — the shape PostgREST actually returns', async () => {
    insert.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'violates check constraint' },
    });

    const ok = await insertTelemetry('user_events', { event_type: 'nope' });

    expect(ok).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
    // The dynamic import of Sentry resolves on a microtask.
    await vi.waitFor(() => expect(captureMessage).toHaveBeenCalledTimes(1));
    expect(captureMessage.mock.calls[0][0]).toBe('telemetry_insert_rejected');
    expect(captureMessage.mock.calls[0][1].extra).toMatchObject({
      table: 'user_events',
      code: '23514',
    });
  });

  it('reports nothing on a successful insert', async () => {
    insert.mockResolvedValue({ data: [{}], error: null });

    const ok = await insertTelemetry('user_events', { event_type: 'page_view' });

    expect(ok).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('never throws to the caller — analytics must not break the UI', async () => {
    insert.mockRejectedValue(new Error('network down'));
    await expect(insertTelemetry('user_events', {})).resolves.toBe(false);
  });

  it('does NOT raise a Sentry event for a transport failure', async () => {
    // An offline visitor is not a defect. Only a REJECTED ROW is.
    insert.mockRejectedValue(new Error('Failed to fetch'));

    await insertTelemetry('user_events', {});

    expect(captureMessage).not.toHaveBeenCalled();
    expect(console.debug).toHaveBeenCalledTimes(1);
  });

  it('never puts the row itself in the report', async () => {
    insert.mockResolvedValue({ data: null, error: { code: '42501', message: 'RLS' } });

    await insertTelemetry('user_events', { entity_id: 'a-venue-the-user-opened' });

    await vi.waitFor(() => expect(captureMessage).toHaveBeenCalled());
    expect(JSON.stringify(captureMessage.mock.calls[0][1])).not.toContain(
      'a-venue-the-user-opened',
    );
  });
});
