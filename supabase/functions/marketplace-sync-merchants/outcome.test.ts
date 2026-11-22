import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { runSucceeded } from './outcome.ts'

Deno.test('one failing merchant out of several does not fail the run', () => {
  assertEquals(runSucceeded([{ status: 'ok' }, { status: 'error' }, { status: 'ok' }]), true)
})
Deno.test('every attempted merchant failing fails the run', () => {
  assertEquals(runSucceeded([{ status: 'error' }, { status: 'skipped' }, { status: 'error' }]), false)
})
Deno.test('nothing attempted is not a failure', () => {
  assertEquals(runSucceeded([]), true)
  assertEquals(runSucceeded([{ status: 'skipped' }]), true)
})
