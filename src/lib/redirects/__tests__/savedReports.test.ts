import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  savedReportInput,
  reportShareInput,
  publicReportResult,
  publicReportDates,
  publicReportRequest,
  type ReportDb,
} from '../../../../supabase/functions/_shared/redirect-reports';
import { hashLinkPassword } from '../../../../supabase/functions/_shared/link-policy';
const id = '00000000-0000-4000-8000-000000000001',
  version = '00000000-0000-4000-8000-000000000002';
const raw = {
  title: 'Public title',
  includeConversions: false,
  linkCount: 1,
  scopeMode: 'snapshot',
  expiresAt: null,
  owner_user_id: 'PRIVATE OWNER',
  filters: { email: 'PRIVATE FILTER' },
  report: {
    snapshot: '2026-10-14T00:00:00Z',
    interval: 'day',
    totals: { clicks: 2, leads: 1, sales: 1, customers: 1 },
    revenue: [{ currency: 'CHF', amount: '49.900000' }],
    series: [{ at: '2026-10-13T00:00:00Z', clicks: 2, leads: 1, sales: 1, raw: 'PRIVATE EVENT' }],
    breakdowns: {
      country: [
        { label: 'CH', count: 1 },
        { label: 'PRIVATE EMAIL', count: 1 },
      ],
      device: [{ label: 'PRIVATE DEVICE', count: 2 }],
      city: [{ label: 'PRIVATE CITY', count: 2 }],
      referrer: [{ label: 'PRIVATE REFERRER', count: 2 }],
    },
    events: [{ customer_key: 'PRIVATE CUSTOMER', destination: 'PRIVATE TARGET' }],
  },
};
function database() {
  return {
    rpc: vi.fn<ReportDb['rpc']>(async (name) => ({
      data: name === 'redirect_public_report_check' ? { id, version, passwordHash: null } : raw,
      error: null,
    })),
  };
}
const request = (password?: string, query = '') =>
  new Request('https://queer.guide/api/redirects/public-report' + query, {
    method: password ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer qg_report_' + id,
      ...(password ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(password ? { body: JSON.stringify({ password }) } : {}),
  });
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
describe('saved reports and aggregate-only publication', () => {
  it('validates owner inputs and rejects caller-supplied access scope or malformed dates', () => {
    expect(
      savedReportInput({ name: ' Saved ', filters: { country: 'CH', event: 'click' } }, true),
    ).toMatchObject({ name: 'Saved' });
    expect(() => savedReportInput({ name: 'Name', filters: { allowedIds: [id] } }, true)).toThrow();
    expect(() => savedReportInput({ name: 'Name', ownerUserId: id, filters: {} }, true)).toThrow();
    expect(() => savedReportInput({ name: 'Changed' }, false)).toThrow('Reload');
    expect(savedReportInput({ visibility: 'team', version }, false)).toEqual({
      visibility: 'team',
      version,
    });
    for (const visibility of [true, null, {}, 'public'])
      expect(() => savedReportInput({ visibility, version }, false)).toThrow('visibility');
    expect(() => savedReportInput({ name: 'Name', filters: { start: 'invalid' } }, true)).toThrow();
  });
  it('accepts only real UTC dates and never caller-supplied scope filters', () => {
    expect(publicReportDates({ start: '2026-01-01T00:00:00Z' })).toEqual({
      start: '2026-01-01T00:00:00.000Z',
    });
    for (const value of [
      { start: '2026-02-30T00:00:00Z' },
      { start: null },
      { event: 'sale' },
      { linkIds: [id] },
      { start: '2026-02-01T00:00:00Z', end: '2026-01-01T00:00:00Z' },
      { start: '2026-01-01' },
    ])
      expect(() => publicReportDates(value)).toThrow();
  });
  it('passes date-only POST bodies through the live gate without enabling conversions', async () => {
    const db = database();
    const response = await publicReportRequest(
      new Request('https://queer.guide/api/redirects/public-report', {
        method: 'POST',
        headers: { Authorization: 'Bearer qg_report_' + id, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: { start: '2026-01-01T00:00:00Z' } }),
      }),
      db,
      'secret',
      {},
    );
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith(
      'redirect_public_report_check',
      expect.objectContaining({ p_password_attempt: false }),
    );
    expect(db.rpc).toHaveBeenCalledWith(
      'redirect_public_report_read',
      expect.objectContaining({
        p_dates: { start: '2026-01-01T00:00:00.000Z' },
        p_password_verified: false,
      }),
    );
    expect((await response.json()).report.totals).toEqual({ clicks: 2 });
    db.rpc.mockImplementation(async (name) =>
      name === 'redirect_public_report_check'
        ? { data: { id, version }, error: null }
        : { data: null, error: { code: '22023', message: 'PRIVATE SQL DETAIL' } },
    );
    const invalid = await publicReportRequest(request(), db, 'secret', {});
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).not.toContain('PRIVATE');
  });
  it('defaults to click-only snapshots and requires explicit share settings', () => {
    const input = reportShareInput({ title: ' Dashboard ', reportVersion: version });
    expect(input.values).toMatchObject({
      title: 'Dashboard',
      includeConversions: false,
      scopeMode: 'snapshot',
      allowIndexing: false,
    });
    expect(() =>
      reportShareInput({ title: 'Name', reportVersion: version, password: '' }),
    ).toThrow();
    expect(() =>
      reportShareInput({ title: 'Name', reportVersion: version, includeConversions: 'true' }),
    ).toThrow();
    expect(() =>
      reportShareInput({ title: 'Name', reportVersion: version, linkIds: [id] }),
    ).toThrow();
  });
  it('requires explicit indexing and rejects combining it with password protection', () => {
    expect(
      reportShareInput({ title: 'Indexed', reportVersion: version, allowIndexing: true }).values
        .allowIndexing,
    ).toBe(true);
    expect(() =>
      reportShareInput({ title: 'Invalid', reportVersion: version, allowIndexing: 'true' }),
    ).toThrow();
    expect(() =>
      reportShareInput({
        title: 'Invalid',
        reportVersion: version,
        allowIndexing: true,
        password: 'secret',
      }),
    ).toThrow('cannot be indexed');
    expect(publicReportResult(raw).allowIndexing).toBe(false);
    expect(publicReportResult({ ...raw, allowIndexing: true }).allowIndexing).toBe(true);
    expect(publicReportResult({ ...raw, allowIndexing: 'true' }).allowIndexing).toBe(false);
  });
  it('drops raw events, customers, URLs and private dimensions, and normalizes untrusted labels', () => {
    const value = publicReportResult(raw);
    expect(JSON.stringify(value)).not.toContain('PRIVATE');
    expect(value.report.totals).toEqual({ clicks: 2 });
    expect(value.report.revenue).toEqual([]);
    expect(value.report.series).toEqual([{ at: '2026-10-13T00:00:00.000Z', clicks: 2 }]);
    expect(value.report.breakdowns.device).toEqual([{ label: 'Unknown', count: 2 }]);
  });
  it('includes exact revenue only after conversion opt-in', () => {
    const value = publicReportResult({ ...raw, includeConversions: true });
    expect(value.report.revenue).toEqual([{ currency: 'CHF', amount: '49.900000' }]);
    expect(value.report.totals.sales).toBe(1);
    expect(() =>
      publicReportResult({
        ...raw,
        includeConversions: true,
        report: { ...raw.report, revenue: [{ currency: 'CHF', amount: 'NaN' }] },
      }),
    ).toThrow();
  });
  it('returns aggregate-only JSON without looking up a user session', async () => {
    const db = database(),
      response = await publicReportRequest(request(), db, 'fixture-secret', {});
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await response.text()).not.toContain('PRIVATE');
  });
  it('verifies the real password hash before aggregation and rechecks the share version', async () => {
    const db = database(),
      hash = await hashLinkPassword('fixture-password');
    db.rpc.mockImplementation(async (name) => ({
      data: name === 'redirect_public_report_check' ? { id, version, passwordHash: hash } : raw,
      error: null,
    }));
    expect((await publicReportRequest(request(), db, 'secret', {})).status).toBe(401);
    expect(db.rpc).not.toHaveBeenCalledWith('redirect_public_report_read', expect.anything());
    expect((await publicReportRequest(request('wrong'), db, 'secret', {})).status).toBe(401);
    expect((await publicReportRequest(request('fixture-password'), db, 'secret', {})).status).toBe(
      200,
    );
    expect(db.rpc).toHaveBeenCalledWith('redirect_public_report_read', {
      p_id: id,
      p_version: version,
      p_password_verified: true,
      p_dates: {},
    });
    db.rpc.mockImplementation(async (name) =>
      name === 'redirect_public_report_check'
        ? { data: { id, version, passwordHash: hash }, error: null }
        : { data: null, error: { code: 'P0002' } },
    );
    expect((await publicReportRequest(request('fixture-password'), db, 'secret', {})).status).toBe(
      404,
    );
  });
  it('reserves work before expensive verification and preserves retry-after', async () => {
    const db = database();
    db.rpc.mockResolvedValue({ data: { retryAfter: 600 }, error: null });
    const result = await publicReportRequest(request('guess'), db, 'secret', {});
    expect(result.status).toBe(429);
    expect(result.headers.get('Retry-After')).toBe('600');
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects public filter widening and never creates budget rows for unavailable shares', async () => {
    const db = database();
    expect(
      (await publicReportRequest(request(undefined, '?folderId=' + id), db, 'secret', {})).status,
    ).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
    db.rpc.mockResolvedValue({ data: null, error: { code: 'P0002' } });
    expect((await publicReportRequest(request(), db, 'secret', {})).status).toBe(404);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
});
