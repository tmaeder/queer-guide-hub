/** Exercise the real gate process against a local HTTP fixture. */
import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';

const legacy = (failing = 0, other = 0) => [
  { gate: 'person_outing_guard', severity: 'critical', failing, detail: 'Fixture provenance' },
  { gate: 'other_critical', severity: 'critical', failing: other, detail: 'Fixture other gate' },
];
const canonical = (failures: unknown = 0) => [
  { gate: 'person_outing_guard', severity: 'critical', failures },
];

async function run(older: unknown, current: unknown, currentStatus = 200, snapshot: unknown = []) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    const isCurrent = request.url?.endsWith('/release_gate_checks');
    const isSnapshot = request.url?.startsWith('/rest/v1/gate_snapshots?');
    response.statusCode = isCurrent ? currentStatus : 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(isSnapshot ? snapshot : isCurrent ? current : older));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server did not bind');
  try {
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          process.execPath,
          ['scripts/check-trust-safety-gates.mjs'],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              SUPABASE_URL: `http://127.0.0.1:${address.port}`,
              SUPABASE_SERVICE_ROLE_KEY: 'fixture-only-key',
            },
            timeout: 10_000,
          },
          (error, stdout, stderr) => {
            const code = error ? error.code : 0;
            if (typeof code !== 'number') return reject(error);
            resolve({ code, stdout, stderr });
          },
        );
      },
    );
    return { ...result, requests };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe('actual trust gate process uses evaluated current provenance policy', () => {
  it('accepts source-provenanced records rejected by the legacy identifier proxy', async () => {
    const result = await run(legacy(2), canonical(0));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('person_outing_guard = 0');
    expect(result.requests).toContain('/rest/v1/rpc/release_gate_checks');
  });
  it('blocks a real current-policy breach even when the legacy metric is green', async () => {
    const result = await run(legacy(0), canonical(3));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('CRITICAL gate(s) breached');
  });
  it('keeps other critical breaches blocking', async () => {
    expect((await run(legacy(2, 1), canonical(0))).code).toBe(1);
  });
  it.each([
    { report: [] },
    { report: canonical('0') },
    { report: [{ ...canonical(0)[0], severity: 'high' }] },
  ])('fails closed on a missing or malformed canonical count', async ({ report }) => {
    const result = await run(legacy(0), report);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('did not evaluate');
  });
  it('fails closed when the canonical RPC rejects access', async () => {
    const result = await run(legacy(0), { error: 'fixture_access_denied' }, 403);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('HTTP 403');
  });
  it('uses an evaluated fresh snapshot without calling the expensive live RPC', async () => {
    const result = await run(legacy(2), { error: 'must not call live' }, 403, [
      { result: canonical(0), computed_at: new Date().toISOString(), last_error: null },
    ]);
    expect(result.code).toBe(0);
    expect(result.requests).not.toContain('/rest/v1/rpc/release_gate_checks');
  });
  it('still blocks a genuine breach recorded in a fresh snapshot', async () => {
    const result = await run(legacy(0), canonical(0), 200, [
      { result: canonical(3), computed_at: new Date().toISOString(), last_error: null },
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('CRITICAL gate(s) breached');
  });
  it.each([
    { computed_at: new Date(Date.now() - 60 * 60_000).toISOString(), last_error: null },
    { computed_at: new Date().toISOString(), last_error: '57014: fixture timeout' },
    { computed_at: new Date(Date.now() + 60_000).toISOString(), last_error: null },
  ])(
    'rejects stale, failed or future snapshots and evaluates the live result',
    async (metadata) => {
      const result = await run(legacy(0), canonical(3), 200, [
        { result: canonical(0), ...metadata },
      ]);
      expect(result.code).toBe(1);
      expect(result.requests).toContain('/rest/v1/rpc/release_gate_checks');
    },
  );
  it('fails closed on a malformed count in an otherwise fresh snapshot', async () => {
    const result = await run(legacy(0), canonical(0), 200, [
      { result: canonical('0'), computed_at: new Date().toISOString(), last_error: null },
    ]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('did not evaluate');
  });
});
