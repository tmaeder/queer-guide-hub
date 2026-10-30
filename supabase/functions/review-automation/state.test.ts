import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQuestions, type Context } from './policy.ts'

const context: Context = {
  item: { queue_type: 'quality-city', title: 'Public proposal', risk: 'safety', meta: { issue_code: 'DESCRIPTION',
    details: { account_id: 'PRIVATE_ACCOUNT', text: 'PRIVATE_SUBMISSION' }, submitted_by: 'PRIVATE_ACCOUNT' } },
  record: { name: 'Public city', description: 'Access is limited to the ground floor; upper floors require stairs.',
    account_id: 'PRIVATE_ACCOUNT', website: 'https://example.org/city' },
  proposal: { field: 'description', proposed_value: { value: 'Limited ground-floor access.',
    issues: ['accessibility_qualification'], account_id: 'PRIVATE_ACCOUNT', metadata: { password: 'PRIVATE_CREDENTIAL' } },
    citations: [{ url: 'https://example.org/access', quote: 'Upper floors require stairs.', user_id: 'PRIVATE_ACCOUNT' }] },
  related: { location: { city: 'Public city', country: 'Example', account_id: 'PRIVATE_ACCOUNT' },
    publisher_sources: [{ source_url: 'https://example.org/access', captured: { description: 'Public source', account_id: 'PRIVATE_ACCOUNT' } }],
    private_account: { name: 'PRIVATE_ACCOUNT' } },
  research: { description: 'PRIVATE_GENERATED_RESEARCH', user_id: 'PRIVATE_ACCOUNT' },
  candidates: [{ id: 'approve', action: 'approve', explanation: 'Apply exact public proposal', payload: {} }],
  urls: [], input_hash: 'PRIVATE_INTERNAL_HASH',
}
const evidence = [{ url: 'https://example.org/access', retrieved_at: '2026-10-30T00:00:00Z', text: 'The ground floor is accessible. Upper floors require stairs.' }]

test('actual Review question builder forwards explicit public facts and qualifications, never arbitrary nested metadata/research', () => {
  const request = buildQuestions(context, evidence)
  const json = JSON.stringify(request)
  assert.doesNotMatch(json, /PRIVATE_|account_id|submitted_by|user_id|password|prior_research/)
  assert.equal(request.state.current_record?.description, context.record?.description)
  assert.equal(request.state.fetched_sources[0].text, evidence[0].text)
  assert.equal(request.state.issue.meta?.issue_code, 'DESCRIPTION')
  assert.deepEqual(request.state.proposal?.citations, [{ url: 'https://example.org/access', quote: 'Upper floors require stairs.' }])
  assert.equal(request.state.state_version, 'jev-review-public-state-v2')
})

test('structural integrity evidence is rebuilt from the sanitized proposal instead of forwarding a raw JSON text escape hatch', () => {
  const c = { ...context, item: { queue_type: 'milestone-review', title: 'Historical detector proposal' }, candidates: [{
    id: 'reject', action: 'reject' as const, explanation: 'Close invalid uncertainty detector', payload: { integrity_rule: 'uncertainty_without_replacement' },
  }] }
  const request = buildQuestions(c, [{ ...evidence[0], kind: 'proposal_integrity', text: JSON.stringify(context) }])
  assert.doesNotMatch(JSON.stringify(request), /PRIVATE_|prior_research/)
  assert.match(request.state.fetched_sources[0].text, /uncertainty_without_replacement/)
  assert.match(request.state.fetched_sources[0].text, /Upper floors require stairs/)
})

test('projection omits credential/private destinations and refuses excessive known structure without truncating text', () => {
  const c = { ...context, record: { website: 'https://user:secret@example.org', source_url: 'http://169.254.169.254/latest', description: 'x'.repeat(18001) } }
  assert.throws(() => buildQuestions(c, evidence), /exceeds bounds/)
  c.record.description = 'Public qualification'
  const request = buildQuestions(c, evidence)
  assert.deepEqual(request.state.current_record, { description: 'Public qualification' })
  assert.throws(() => buildQuestions({ ...context, proposal: { issues: Array(129).fill('qualification') } }, evidence), /exceeds bounds/)
  assert.throws(() => buildQuestions({ ...context, proposal: { field: 'website', proposed_value: { value: 'https://example.org/private?access_token=PRIVATE_CREDENTIAL' } } }, evidence), /unsupported URL/)
})
