import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const script = readFileSync(resolve(__dirname, '../../../scripts/smoke-pages.sh'), 'utf8')
const start = script.indexOf('expect_guide_redirect() {')
const helper = script.slice(start, script.indexOf('\n}\n', start) + 3)

describe('Pages smoke checks the legacy guide redirect', () => {
  it.each([
    ['301 https://example.test/guides?entity=venue', 0],
    ['200 ', 1],
    ['302 https://example.test/guides?entity=venue', 1],
    ['301 https://example.test/venues/guides', 1],
    ['301 https://other.test/guides?entity=venue', 1],
  ])('validates status and exact target: %s', (response, failures) => {
    const result = spawnSync('bash', ['-c', `
      set -eu
      SITE=https://example.test
      CURL_TIMEOUT=(--connect-timeout 5 -m 15)
      pass=0; fail=0
      curl() { printf '%s' "$RESPONSE"; }
      expect_status() { [ "$1" = '/guides?entity=venue' ] && [ "$2" = 200 ]; }
      ${helper}
      expect_guide_redirect
      printf '\\nfailures=%s\\n' "$fail"
    `], { encoding: 'utf8', env: { ...process.env, RESPONSE: response } })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`failures=${failures}`)
  })
})
