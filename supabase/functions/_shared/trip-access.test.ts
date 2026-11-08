import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { tripAccess } from './trip-access.ts'

// A fake service-role client that answers the two queries tripAccess makes,
// applying the same filters the real PostgREST call would.
type Trip = { id: string; owner_id: string; is_public: boolean }
type Member = { trip_id: string; user_id: string; role: string; accepted_at: string | null }

function fakeAdmin(trips: Trip[], members: Member[]) {
  return {
    from(table: string) {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      const q = {
        select: () => q,
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val)
          return q
        },
        not(col: string, op: string, val: unknown) {
          if (op === 'is' && val === null) filters.push((r) => r[col] !== null)
          return q
        },
        maybeSingle() {
          const rows = (table === 'trips' ? trips : members) as unknown as Record<string, unknown>[]
          const hit = rows.filter((r) => filters.every((f) => f(r)))
          return Promise.resolve({ data: hit[0] ?? null, error: null })
        },
      }
      return q
    },
  }
}

const trips: Trip[] = [
  { id: 'private', owner_id: 'owner', is_public: false },
  { id: 'public', owner_id: 'owner', is_public: true },
]
const members: Member[] = [
  { trip_id: 'private', user_id: 'editor', role: 'editor', accepted_at: '2026-01-01' },
  { trip_id: 'private', user_id: 'viewer', role: 'viewer', accepted_at: '2026-01-01' },
  { trip_id: 'private', user_id: 'invited', role: 'editor', accepted_at: null },
]
const admin = fakeAdmin(trips, members)

Deno.test('a stranger cannot reach a private trip', async () => {
  assertEquals(await tripAccess(admin, 'private', 'stranger'), 'none')
})

Deno.test('an unaccepted invite grants nothing', async () => {
  assertEquals(await tripAccess(admin, 'private', 'invited'), 'none')
})

Deno.test('the owner and an accepted editor may edit', async () => {
  assertEquals(await tripAccess(admin, 'private', 'owner'), 'edit')
  assertEquals(await tripAccess(admin, 'private', 'editor'), 'edit')
})

Deno.test('an accepted viewer may only read', async () => {
  assertEquals(await tripAccess(admin, 'private', 'viewer'), 'read')
})

Deno.test('anyone may read a public trip', async () => {
  assertEquals(await tripAccess(admin, 'public', 'stranger'), 'public')
})

Deno.test('a missing trip is none', async () => {
  assertEquals(await tripAccess(admin, 'nope', 'owner'), 'none')
})
