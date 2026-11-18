import { assertEquals, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { overpassEndpoint } from './endpoint.ts'

Deno.test('OSM keeps the default and supports a hosted public interpreter with a path key', () => {
  assertEquals(overpassEndpoint(), 'https://overpass-api.de/api/interpreter')
  assertEquals(overpassEndpoint(' https://provider.example/demo-key/api/interpreter '), 'https://provider.example/demo-key/api/interpreter')
})
Deno.test('invalid OSM configuration rejects private targets without disclosing its path key', () => {
  for (const value of ['http://provider.example/demo-key', 'https://127.0.0.1/demo-key', 'https://user:demo-key@provider.example/api/interpreter', 'https://provider.example/demo-key#fragment']) {
    const error = assertThrows(() => overpassEndpoint(value))
    assertEquals(error instanceof Error && !error.message.includes('demo-key'), true)
  }
})
