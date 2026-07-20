// Personal working notes + tags — stored ONLY in the browser (localStorage).
// Never written to the DB, so they have zero effect on the live site.
// Keyed by personality id.

const KEY = 'person-db.notes.v1'

export interface LocalEntry {
  note: string
  tags: string[]
  checked: boolean
  updated_at: string
}

const EMPTY: LocalEntry = { note: '', tags: [], checked: false, updated_at: '' }

type Store = Record<string, LocalEntry>

function readStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function getEntry(id: string): LocalEntry {
  return readStore()[id] ?? EMPTY
}

export function saveEntry(id: string, patch: Partial<Omit<LocalEntry, 'updated_at'>>) {
  const store = readStore()
  const prev = store[id] ?? EMPTY
  store[id] = {
    note: patch.note ?? prev.note,
    tags: patch.tags ?? prev.tags,
    checked: patch.checked ?? prev.checked,
    updated_at: new Date().toISOString(),
  }
  writeStore(store)
  return store[id]
}

export function toggleChecked(id: string): boolean {
  const next = !getEntry(id).checked
  saveEntry(id, { checked: next })
  return next
}

// Ids the user has marked as checked.
export function checkedIds(): Set<string> {
  const ids = new Set<string>()
  for (const [id, e] of Object.entries(readStore())) if (e.checked) ids.add(id)
  return ids
}

export function allEntries(): Store {
  return readStore()
}

// Set of ids that have any local note/tag — for a "has notes" badge.
export function annotatedIds(): Set<string> {
  const store = readStore()
  const ids = new Set<string>()
  for (const [id, e] of Object.entries(store)) {
    if (e.note.trim() || e.tags.length) ids.add(id)
  }
  return ids
}
