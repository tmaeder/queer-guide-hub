import { describe, it, expect, vi } from 'vitest';
import { run } from '../../../public/cli.mjs';

const output = (fetch = vi.fn()) => ({ fetch, write: vi.fn(), error: vi.fn() });

describe('official public read-only CLI', () => {
  it('reports deadlines with a stable string error code', async () => {
    const io = output(
      vi.fn().mockRejectedValue(new DOMException('Request deadline exceeded', 'TimeoutError')),
    );
    expect(await run(['pages', '--json'], io)).toBe(1);
    expect(JSON.parse(io.error.mock.calls[0][0]).error.code).toBe('TIMEOUT');
  });
  it('keeps useful search references when the service does not supply a URL', async () => {
    const io = output(
      vi.fn().mockResolvedValue(
        Response.json({
          hits: [{ title: 'Zurich', type: 'city', slug: 'zurich', objectID: '123' }],
        }),
      ),
    );
    expect(await run(['search', 'Zurich'], io)).toBe(0);
    expect(io.write.mock.calls[0][0]).toContain('Zurich\tcity\tzurich');
  });
  it('shows help and version without credentials or network access', async () => {
    const io = output();
    expect(await run(['--help'], io)).toBe(0);
    expect(await run(['--version'], io)).toBe(0);
    expect(io.fetch).not.toHaveBeenCalled();
  });
  it('filters the catalog and preserves the original JSON for scripts', async () => {
    const body = {
      pages: [{ slug: 'travel', title: 'Travel', url: 'https://queer.guide/travel' }],
    };
    const io = output(vi.fn().mockResolvedValue(Response.json(body)));
    expect(await run(['pages', '--prefix', 'travel', '--json'], io)).toBe(0);
    expect(io.fetch.mock.calls[0][0]).toBe('https://queer.guide/api/v1/pages?prefix=travel');
    expect(JSON.parse(io.write.mock.calls[0][0])).toEqual(body);
    expect(io.fetch.mock.calls[0][1].redirect).toBe('error');
    expect(io.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it('reads an encoded category slug and prints safe human-readable text', async () => {
    const io = output(
      vi.fn().mockResolvedValue(
        Response.json({
          title: 'Guide\u001b[31m',
          paragraphs: ['Text'],
          url: 'https://queer.guide/venues',
        }),
      ),
    );
    expect(await run(['page', 'venues/guides'], io)).toBe(0);
    expect(io.fetch.mock.calls[0][0]).toContain('venues%2Fguides');
    expect(io.write.mock.calls[0][0]).not.toContain('\u001b');
  });
  it('uses only the public search boundary for live queries', async () => {
    const io = output(vi.fn().mockResolvedValue(Response.json({ hits: [] })));
    expect(await run(['search', 'Zurich', '--json'], io)).toBe(0);
    expect(io.fetch.mock.calls[0][0]).toBe('https://search.queer.guide/search');
    expect(JSON.parse(io.fetch.mock.calls[0][1].body)).toEqual({
      query: 'Zurich',
      filters: {},
      hitsPerPage: 5,
      page: 0,
    });
  });
  it.each([
    ['pages', '--unknown'],
    ['page'],
    ['pages', '--prefix'],
    ['page', 'home', '--prefix', 'x'],
    ['search', 'x'.repeat(201)],
    ['pages', '--base-url', 'http://example.com'],
    ['pages', '--base-url', 'https://user:password@example.com'],
    ['pages', '--base-url', 'https://example.com/path'],
  ])('rejects invalid arguments before making a request: %s', async (...args) => {
    const io = output();
    expect(await run(args, io)).toBe(1);
    expect(io.fetch).not.toHaveBeenCalled();
  });
  it('supports loopback origins for local, side-effect-free testing', async () => {
    const io = output(vi.fn().mockResolvedValue(Response.json({ pages: [] })));
    expect(await run(['pages', '--base-url', 'http://127.0.0.1:8980'], io)).toBe(0);
    expect(io.fetch.mock.calls[0][0]).toBe('http://127.0.0.1:8980/api/v1/pages');
  });
  it('returns a nonzero exit and structured throttle hint without reflecting upstream content', async () => {
    const io = output(
      vi
        .fn()
        .mockResolvedValue(
          new Response('private upstream error', { status: 429, headers: { 'Retry-After': '30' } }),
        ),
    );
    expect(await run(['pages', '--json'], io)).toBe(1);
    const body = JSON.parse(io.error.mock.calls[0][0]);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toContain('30 seconds');
    expect(io.error.mock.calls[0][0]).not.toContain('private');
  });
  it.each([
    () => new Response('<html>App shell</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('bad json', { headers: { 'Content-Type': 'application/json' } }),
    () => Response.json({ pages: 'invalid' }),
    () =>
      new Response('x'.repeat(2 * 1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
  ])('rejects wrong types, malformed payloads and oversized responses', async (response) => {
    const io = output(vi.fn().mockResolvedValue(response()));
    expect(await run(['pages', '--json'], io)).toBe(1);
    expect(io.write).not.toHaveBeenCalled();
  });
});
