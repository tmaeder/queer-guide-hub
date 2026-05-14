// Unit tests for the ingestion-rules engine. Pure logic — no env, no network.
// Run with: cd Dev/web/supabase/functions && deno test _tests/ingestion-rules.test.ts
// Run with: cd supabase/functions && deno test _tests/ingestion-rules.test.ts
import { assertEquals } from 'jsr:@std/assert'
import {
  evaluateRule,
  applyRuleActions,
  combinedText,
  type Rule,
  type RuleSubmission,
} from '../_shared/ingestion-rules.ts'

const baseSub: RuleSubmission = {
  id: 'sub-1',
  platform: 'telegram',
  status: 'pending',
  priority: 1,
  labels: [],
  permission_level: 'public_share',
  raw_text: 'Pride parade Saturday at 7pm — flag #lgbtq',
  ocr_text: null,
  vision_summary: null,
  transcript_text: null,
}

const baseRule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'r-1',
  name: 'test',
  enabled: true,
  priority: 100,
  match: {},
  actions: {},
  ...overrides,
})

Deno.test('combinedText: lowercases and joins all text fields', () => {
  const text = combinedText({
    ...baseSub,
    raw_text: 'HELLO',
    ocr_text: 'WORLD',
    vision_summary: 'Image OF a Cat',
    transcript_text: null,
  })
  assertEquals(text, 'hello\nworld\nimage of a cat')
})

Deno.test('evaluateRule: empty match never matches (guards against catch-all rules)', () => {
  const r = evaluateRule(baseRule(), baseSub)
  assertEquals(r.matched, false)
})

Deno.test('evaluateRule: any_of matches on first hit (case-insensitive)', () => {
  const r = evaluateRule(baseRule({ match: { any_of: ['PRIDE', 'kink'] } }), baseSub)
  assertEquals(r.matched, true)
  assertEquals(r.terms, ['PRIDE'])
})

Deno.test('evaluateRule: all_of requires every term', () => {
  const hit = evaluateRule(baseRule({ match: { all_of: ['pride', 'parade'] } }), baseSub)
  assertEquals(hit.matched, true)
  assertEquals(hit.terms, ['pride', 'parade'])

  const miss = evaluateRule(baseRule({ match: { all_of: ['pride', 'unrelated'] } }), baseSub)
  assertEquals(miss.matched, false)
})

Deno.test('evaluateRule: platforms filter excludes non-matching submissions', () => {
  const r = evaluateRule(
    baseRule({ match: { platforms: ['tiktok'], any_of: ['pride'] } }),
    baseSub,
  )
  assertEquals(r.matched, false)
})

Deno.test('evaluateRule: platforms filter allows matching submission', () => {
  const r = evaluateRule(
    baseRule({ match: { platforms: ['telegram'], any_of: ['pride'] } }),
    baseSub,
  )
  assertEquals(r.matched, true)
})

Deno.test('evaluateRule: regex match captures matched substring', () => {
  const r = evaluateRule(baseRule({ match: { regex: '#\\w+' } }), baseSub)
  assertEquals(r.matched, true)
  assertEquals(r.terms[0], '#lgbtq')
})

Deno.test('evaluateRule: invalid regex fails closed (no match, no throw)', () => {
  const r = evaluateRule(baseRule({ match: { regex: '[invalid(' } }), baseSub)
  assertEquals(r.matched, false)
})

Deno.test('evaluateRule: empty text + content matchers → no match', () => {
  const r = evaluateRule(
    baseRule({ match: { any_of: ['pride'] } }),
    { ...baseSub, raw_text: null },
  )
  assertEquals(r.matched, false)
})

Deno.test('evaluateRule: platforms-only rule matches when platform fits and no text needed', () => {
  const r = evaluateRule(
    baseRule({ match: { platforms: ['telegram'] } }),
    baseSub,
  )
  assertEquals(r.matched, true)
})

Deno.test('applyRuleActions: add_labels merges, dedupes, returns added subset', () => {
  const sub = { ...baseSub, labels: ['existing'] }
  const { patch, applied } = applyRuleActions(sub, {
    add_labels: ['existing', 'new1', 'new2'],
  })
  assertEquals(patch.labels, ['existing', 'new1', 'new2'])
  assertEquals(applied.added_labels, ['new1', 'new2'])
})

Deno.test('applyRuleActions: add_labels no-op when all already present', () => {
  const sub = { ...baseSub, labels: ['a', 'b'] }
  const { patch } = applyRuleActions(sub, { add_labels: ['a', 'b'] })
  assertEquals(Object.keys(patch).length, 0)
})

Deno.test('applyRuleActions: set_priority uses max (never decreases)', () => {
  const sub = { ...baseSub, priority: 5 }
  const lower = applyRuleActions(sub, { set_priority: 3 })
  assertEquals(Object.keys(lower.patch).length, 0)
  const higher = applyRuleActions(sub, { set_priority: 10 })
  assertEquals(higher.patch.priority, 10)
})

Deno.test('applyRuleActions: set_status only patches when different', () => {
  const same = applyRuleActions(baseSub, { set_status: 'pending' })
  assertEquals(Object.keys(same.patch).length, 0)
  const diff = applyRuleActions({ ...baseSub, status: 'approved' }, { set_status: 'pending' })
  assertEquals(diff.patch.status, 'pending')
})

Deno.test('applyRuleActions: force_review flips non-pending to pending', () => {
  const sub = { ...baseSub, status: 'approved' }
  const { patch, applied } = applyRuleActions(sub, { force_review: true })
  assertEquals(patch.status, 'pending')
  assertEquals(applied.forced_review, true)
})

Deno.test('applyRuleActions: force_review on already-pending is a no-op', () => {
  const { patch } = applyRuleActions(baseSub, { force_review: true })
  assertEquals(Object.keys(patch).length, 0)
})

Deno.test('applyRuleActions: set_permission_level only patches when different', () => {
  const same = applyRuleActions(baseSub, { set_permission_level: 'public_share' })
  assertEquals(Object.keys(same.patch).length, 0)
  const diff = applyRuleActions(baseSub, { set_permission_level: 'community_only' })
  assertEquals(diff.patch.permission_level, 'community_only')
})

Deno.test('applyRuleActions: idempotency — re-applying produces empty patch', () => {
  const actions = {
    add_labels: ['auto'],
    set_priority: 8,
    set_status: 'review',
    set_permission_level: 'community_only',
  }
  const first = applyRuleActions(baseSub, actions)
  const after = {
    ...baseSub,
    labels: (first.patch.labels as string[]) ?? baseSub.labels,
    priority: (first.patch.priority as number) ?? baseSub.priority,
    status: (first.patch.status as string) ?? baseSub.status,
    permission_level:
      (first.patch.permission_level as string) ?? baseSub.permission_level,
  }
  const second = applyRuleActions(after, actions)
  assertEquals(Object.keys(second.patch).length, 0)
})
