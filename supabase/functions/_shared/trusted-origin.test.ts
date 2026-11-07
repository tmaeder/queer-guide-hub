import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { trustedOrigin } from './supabase-client.ts'

const withOrigin = (origin?: string) =>
  new Request('https://fn.example/create-checkout-session', {
    method: 'POST',
    headers: origin === undefined ? {} : { Origin: origin },
  })

Deno.test('trustedOrigin keeps our own origins', () => {
  assertEquals(trustedOrigin(withOrigin('https://queer.guide')), 'https://queer.guide')
  assertEquals(trustedOrigin(withOrigin('https://www.queer.guide')), 'https://www.queer.guide')
  assertEquals(trustedOrigin(withOrigin('http://localhost:8080')), 'http://localhost:8080')
})

Deno.test('trustedOrigin replaces a foreign or forged Origin with the fallback', () => {
  // A direct request can send any Origin; CORS does not stop it. Returning it
  // would send a donor to that site after a genuine Stripe payment.
  for (const forged of [
    'https://evil.example',
    'https://queer.guide.evil.example',
    'https://evilqueer.guide',
    'null',
    'javascript:alert(1)',
    '',
  ]) {
    assertEquals(trustedOrigin(withOrigin(forged)), 'https://queer.guide', forged)
  }
  assertEquals(trustedOrigin(withOrigin()), 'https://queer.guide')
})
