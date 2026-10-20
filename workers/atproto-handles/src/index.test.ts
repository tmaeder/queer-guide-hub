import { describe, expect, it, vi } from 'vitest';
import { handleRequest, subdomainOf } from './index';

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon' };
const rpc = (did: string | null) => vi.fn(async () => new Response(JSON.stringify(did)));
const req = (u: string) => new Request(u);

describe('subdomainOf', () => {
  it('accepts one alphanumeric label only', () => {
    expect(subdomainOf('alice.queer.guide')).toBe('alice');
    expect(subdomainOf('Alice.Queer.Guide')).toBe('alice');
    expect(subdomainOf('a.b.queer.guide')).toBeNull();
    expect(subdomainOf('al_ice.queer.guide')).toBeNull();
    expect(subdomainOf('alice.evil.test')).toBeNull();
    expect(subdomainOf('queer.guide')).toBeNull();
  });
});

describe('handleRequest', () => {
  it('serves the bare DID as text/plain', async () => {
    const res = await handleRequest(
      req('https://alice.queer.guide/.well-known/atproto-did'),
      env,
      rpc('did:plc:abc123'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('did:plc:abc123');
  });

  it('404s when not opted in, and never calls the DB for other paths', async () => {
    expect(
      (
        await handleRequest(
          req('https://alice.queer.guide/.well-known/atproto-did'),
          env,
          rpc(null),
        )
      ).status,
    ).toBe(404);
    const f = rpc('did:plc:abc');
    expect((await handleRequest(req('https://alice.queer.guide/'), env, f)).status).toBe(404);
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses a malformed DID from upstream', async () => {
    const res = await handleRequest(
      req('https://alice.queer.guide/.well-known/atproto-did'),
      env,
      rpc('<script>'),
    );
    expect(res.status).toBe(404);
  });
});
