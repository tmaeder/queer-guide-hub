/**
 * Sibling-worktree migration collisions.
 *
 * `check-migration-versions.mjs` compares the working tree against remote
 * history. That cannot see a version claimed by a branch which has not merged
 * yet, and its own header has always said so:
 *
 *   "a duplicate can exist in NEITHER PR alone and appear only once both land,
 *    because `pull_request` CI runs against a merge commit computed before the
 *    other PR merged"
 *
 * Measured 2026-09-03: FOUR migrations across four worktrees simultaneously
 * claimed 20261211100000 — tag_slug_seal, event_tag_link_reads_approved_aliases,
 * kinktionary_new_terms_sourced, news_commit_requires_a_verdict. Every check was
 * green in every one of them, because none could see the other three. Whichever
 * merges first wins the version; the rest are skipped permanently and silently
 * while their PRs read as shipped.
 *
 * The escape each session reaches for makes it worse rather than better: bump to
 * the next day's `<day>100000` to clear the current max. That bump becomes the
 * next session's collision, so the versions ratchet forward one day at a time
 * and nobody converges. One of the day's collisions landed on main under the
 * title "renumber off a collision that landed while this PR sat green".
 *
 * SCOPE, stated plainly: this closes the CONCURRENT-SESSIONS-ON-ONE-MACHINE
 * case, which is where every measured collision in this repo came from — sibling
 * git worktrees under .claude/worktrees/. It does NOT see branches that exist
 * only on another developer's machine or only on the remote, and it is a no-op
 * in CI, where no sibling worktrees exist. Closing that half needs the GitHub
 * API (open PRs and their changed files), which is a network dependency this
 * guard deliberately does not have.
 */

const VERSION_RE = /^(\d{14})_.+\.sql$/

/**
 * Sibling worktree paths from `git worktree list --porcelain`, excluding self.
 *
 * Pure so the parsing is testable without a git repo. The porcelain format is
 * one stanza per worktree, each starting with a `worktree <path>` line.
 */
export function parseWorktreePaths(porcelain, selfPath) {
  const paths = []
  for (const line of String(porcelain ?? '').split('\n')) {
    if (!line.startsWith('worktree ')) continue
    const p = line.slice('worktree '.length).trim()
    // Compare resolved paths — `git worktree list` prints the real path while
    // process.cwd() may arrive via a symlink, and a mismatch would report the
    // current tree as its own sibling (every file colliding with itself).
    if (p && p !== selfPath) paths.push(p)
  }
  return paths
}

/**
 * Collisions between our migration files and sibling worktrees' files.
 *
 * A collision is SAME VERSION with a DIFFERENT FILENAME. Same filename is the
 * same migration seen twice — the overwhelmingly common case, since every
 * worktree carries all ~1,400 of main's migrations — and flagging it would bury
 * the real signal under a thousand false positives.
 *
 * @param ourFiles     string[]  basenames in this tree
 * @param isNew        (f) => boolean  true if f is absent from the base ref
 * @param siblingFiles Array<{worktree: string, file: string}>
 * @returns Array<{version, file, siblingFile, worktree, oursIsNew}>
 */
export function findSiblingCollisions(ourFiles, isNew, siblingFiles) {
  const ourByVersion = new Map()
  for (const f of ourFiles) {
    const m = f.match(VERSION_RE)
    if (!m) continue
    if (!ourByVersion.has(m[1])) ourByVersion.set(m[1], [])
    ourByVersion.get(m[1]).push(f)
  }

  const out = []
  const seen = new Set()
  for (const s of siblingFiles ?? []) {
    const m = String(s?.file ?? '').match(VERSION_RE)
    if (!m) continue
    const ours = ourByVersion.get(m[1])
    if (!ours) continue
    for (const f of ours) {
      if (f === s.file) continue
      const key = `${m[1]}|${f}|${s.file}|${s.worktree}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        version: m[1],
        file: f,
        siblingFile: s.file,
        worktree: s.worktree,
        // Whose problem it is. If OUR file is new, we introduced the clash and
        // renaming ours is the cheap fix. If ours is already on the base ref,
        // the sibling is the one that has to move — we report it so their
        // session can see it, but it must not fail our push.
        oursIsNew: isNew(f),
      })
    }
  }
  return out
}

/**
 * Collapse raw hits for reporting.
 *
 * Without this the output is unreadable, which is not cosmetic — a guard that
 * prints a wall of warnings is one people learn to scroll past, and then it
 * stops working entirely. Measured on this repo the first time check 5 ran: a
 * single stale 2026-04 duplicate appeared SIX times, once per worktree still
 * carrying an old branch, each with its own three-line explanation.
 *
 * Two groupings, because the two cases deserve very different volume:
 *   - `blocking`  (our file is new) — one entry per (version, siblingFile) with
 *     the worktrees listed inline. This is the actionable case and it is rare.
 *   - `advisory`  (our file is already on the base ref) — a count and the
 *     distinct versions only. Dominated by abandoned worktrees whose branches
 *     will never merge, so detail here is pure noise; the sibling session is the
 *     one that has to act, and it cannot read our output anyway.
 */
export function groupSiblingCollisions(hits) {
  const blocking = new Map()
  const advisoryVersions = new Set()
  let advisoryCount = 0

  for (const h of hits ?? []) {
    if (!h.oursIsNew) {
      advisoryVersions.add(h.version)
      advisoryCount += 1
      continue
    }
    const key = `${h.version}|${h.file}|${h.siblingFile}`
    if (!blocking.has(key)) {
      blocking.set(key, { version: h.version, file: h.file, siblingFile: h.siblingFile, worktrees: [] })
    }
    const e = blocking.get(key)
    if (!e.worktrees.includes(h.worktree)) e.worktrees.push(h.worktree)
  }

  return {
    blocking: [...blocking.values()],
    advisory: { count: advisoryCount, versions: [...advisoryVersions].sort() },
  }
}
