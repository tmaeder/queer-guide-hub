// Unit tests for AI Gateway URL helpers.
// Run with: cd supabase/functions && deno test --allow-env _shared/ai-gateway.test.ts
import { assertEquals } from 'jsr:@std/assert'
import { gatewayBaseUrl, gatewayHeaders, aiGatewayName } from './ai-gateway.ts'

const ENV_KEYS = ['AI_GATEWAY_NAME', 'AI_GATEWAY_TOKEN', 'CF_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID']
function clearEnv() {
  for (const k of ENV_KEYS) Deno.env.delete(k)
}

Deno.test('gatewayBaseUrl returns null when gateway not configured', () => {
  clearEnv()
  Deno.env.set('CF_ACCOUNT_ID', 'acct123') // account set, but no gateway name
  assertEquals(gatewayBaseUrl('openai'), null)
  assertEquals(gatewayBaseUrl('workers-ai'), null)
  assertEquals(aiGatewayName(), undefined)
})

Deno.test('gatewayBaseUrl returns null when account id missing', () => {
  clearEnv()
  Deno.env.set('AI_GATEWAY_NAME', 'qg-ai')
  assertEquals(gatewayBaseUrl('openai'), null)
})

Deno.test('builds provider-specific gateway URLs', () => {
  clearEnv()
  Deno.env.set('AI_GATEWAY_NAME', 'qg-ai')
  Deno.env.set('CF_ACCOUNT_ID', 'acct123')
  assertEquals(gatewayBaseUrl('openai'),
    'https://gateway.ai.cloudflare.com/v1/acct123/qg-ai/openai')
  assertEquals(gatewayBaseUrl('workers-ai'),
    'https://gateway.ai.cloudflare.com/v1/acct123/qg-ai/workers-ai/v1')
})

Deno.test('CLOUDFLARE_ACCOUNT_ID is accepted as an alias', () => {
  clearEnv()
  Deno.env.set('AI_GATEWAY_NAME', 'qg-ai')
  Deno.env.set('CLOUDFLARE_ACCOUNT_ID', 'aliasAcct')
  assertEquals(gatewayBaseUrl('openai'),
    'https://gateway.ai.cloudflare.com/v1/aliasAcct/qg-ai/openai')
})

Deno.test('gatewayHeaders empty when gateway disabled', () => {
  clearEnv()
  assertEquals(gatewayHeaders({ fn: 'x' }), {})
})

Deno.test('gatewayHeaders include auth token + metadata when configured', () => {
  clearEnv()
  Deno.env.set('AI_GATEWAY_NAME', 'qg-ai')
  Deno.env.set('AI_GATEWAY_TOKEN', 'secret')
  const h = gatewayHeaders({ fn: 'chatCompletion' })
  assertEquals(h['cf-aig-authorization'], 'Bearer secret')
  assertEquals(h['cf-aig-metadata'], '{"fn":"chatCompletion"}')
})

Deno.test('gatewayHeaders omit auth token when not set, still gatewayed', () => {
  clearEnv()
  Deno.env.set('AI_GATEWAY_NAME', 'qg-ai')
  const h = gatewayHeaders()
  assertEquals('cf-aig-authorization' in h, false)
  assertEquals('cf-aig-metadata' in h, false)
})
