// ============================================================
// dragrace-wiki.mjs
//
// Shared Wikipedia acquisition + parsing for the Drag Race corpus.
//
// WHY THIS MODULE EXISTS
//
// `import-dragrace-contestants.mjs` (PR #1698) already knew how to find every
// franchise season page and pull the contestant table out of it. It then threw
// the per-season structure away into a prose bio string. Rather than write a
// second parser that would drift from the first, the parsing was lifted here and
// both importers now call it:
//
//   import-dragrace-contestants.mjs  → personalities (unchanged behaviour)
//   import-dragrace-spine.ts         → drag_franchises/seasons/contestants/...
//
// Everything below is pure or cache-backed. No DB credentials.
// ============================================================

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const UA = 'queer.guide-dragrace-import/1.0 (https://queer.guide; admin@queer.guide)'
const API = 'https://en.wikipedia.org/w/api.php'
export const REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
export const WD = 'https://www.wikidata.org/w/api.php'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Franchises the PERSONALITY importer skips: celebrity-in-drag formats carry a
 * mislabel risk for non-LGBTQ guests.
 *
 * The SPINE importer does not skip them — a celebrity season is still a season
 * that aired, and the spine records television credits rather than asserting
 * anything about a person's identity. Expect a low personality match rate there
 * and treat that as correct.
 */
export const PERSONALITY_SKIP_FRANCHISES = ["RuPaul's Secret Celebrity Drag Race", 'Slaycation']

/** Franchises that lack a season subcategory but exist as pages. */
export const EXTRA_PAGES = [
  { title: 'Drag Race Sverige', franchise: 'Drag Race Sverige' },
  { title: 'Drag Race Germany', franchise: 'Drag Race Germany' },
  { title: 'Drag Race Global All Stars', franchise: 'Drag Race Global All Stars' },
]

export const COUNTRY_BY_FRANCHISE = [
  [/UK|United Kingdom/i, 'United Kingdom'],
  [/Canada/i, 'Canada'],
  [/Down Under/i, 'Australia'],
  [/España|Espana/i, 'Spain'],
  [/France/i, 'France'],
  [/Italia/i, 'Italy'],
  [/Holland/i, 'Netherlands'],
  [/Philippines/i, 'Philippines'],
  [/Belgique/i, 'Belgium'],
  [/Sverige/i, 'Sweden'],
  [/Brasil/i, 'Brazil'],
  [/México|Mexico/i, 'Mexico'],
  [/Germany/i, 'Germany'],
  [/Thailand/i, 'Thailand'],
  [/Switch/i, 'Chile'],
]

export function franchiseCountry(franchise) {
  for (const [re, c] of COUNTRY_BY_FRANCHISE) if (re.test(franchise)) return c
  return 'United States'
}

// ---- fetch -----------------------------------------------------------------

/** Build a cache-backed fetcher rooted at `cacheDir`. */
export function makeFetchCached(cacheDir) {
  mkdirSync(cacheDir, { recursive: true })
  return async function fetchCached(url, cacheKey) {
    const cf = join(cacheDir, cacheKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 180) + '.json')
    if (existsSync(cf)) {
      try {
        return JSON.parse(readFileSync(cf, 'utf8'))
      } catch {
        /* fall through and refetch */
      }
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
        if (res.status === 404) {
          writeFileSync(cf, JSON.stringify({ __notfound: true }))
          return { __notfound: true }
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = await res.json()
        writeFileSync(cf, JSON.stringify(j))
        return j
      } catch (e) {
        if (attempt === 3) {
          console.warn(`  ! fetch failed ${cacheKey}: ${e.message}`)
          return null
        }
        await sleep(500 * (attempt + 1))
      }
    }
  }
}

export const apiUrl = (params) =>
  API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params })

export const md5 = (s) => createHash('md5').update(s).digest('hex')

// ---- HTML helpers ----------------------------------------------------------

/**
 * Strip every HTML tag repeatedly to a fixed point, so nested or overlapping
 * tags collapse fully and no `<tag` substring can survive. Single-tag
 * fixed-point removal is the robust pattern; tag-with-content regexes can be
 * bypassed by unclosed or whitespace-padded end tags.
 */
export function stripTags(html) {
  let out = html
  let prev
  do {
    prev = out
    out = out.replace(/<[^>]+>/g, '')
  } while (out !== prev)
  return out
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/\[\d+\]/g, '')
    .replace(/\s*\[[a-z]{1,3}\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Season/franchise label, not a contestant — e.g. "All Stars 5", "Season 3". */
export const SEASON_LABEL_RE = /^(us |uk )?(all stars|season|series)\s*\d*$|vs\.?\s+the world/i
const SEASON_ARTICLE_RE =
  /\(season\s*\d+\)|\bseries\s*\d+\b|all stars|vs\.?\s+the world|^(rupaul's )?drag race[^,]*$/i

export function firstLinkTitle(cellHtml) {
  const m = cellHtml.match(/<a\b[^>]*href="\/wiki\/([^"#:]+)"[^>]*?(?:title="([^"]+)")?[^>]*>/i)
  if (!m) return null
  const title = (m[2] || decodeURIComponent(m[1])).replace(/_/g, ' ')
  if (/^(File|Help|Category|Wikipedia|Template|Special):/i.test(title)) return null
  if (SEASON_ARTICLE_RE.test(title)) return null
  return title
}

const spanOf = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"?(\\d+)`, 'i'))
  const n = m ? parseInt(m[1], 10) : 1
  // A pathological span would allocate an enormous sparse row; Wikipedia never
  // legitimately exceeds the width of its own table.
  return Number.isFinite(n) && n > 0 && n <= 60 ? n : 1
}

/**
 * Expand one `<tr>`'s cells into a dense column array, carrying `rowspan` cells
 * down from earlier rows and repeating `colspan` cells sideways.
 *
 * WITHOUT THIS, SHARED CELLS SILENTLY SHIFT EVERY LATER COLUMN. Wikipedia gives
 * the two joint runners-up of US seasons 4/5/6/7/8/10/12 a single "Runners-up"
 * cell with `rowspan="2"`, so the second queen's row is one cell short and her
 * outcome reads as the NEXT column's value — or as null. Measured before the
 * fix: 7 of 7 two-runner-up seasons reported exactly one runner-up, and Phi Phi
 * O'Hara had no placement at all.
 */
function expandRow(cells, carry) {
  const out = []
  let col = 0
  let src = 0
  while (src < cells.length || carry.has(col)) {
    const held = carry.get(col)
    if (held) {
      out[col] = held.cell
      held.remaining -= 1
      if (held.remaining <= 0) carry.delete(col)
      col += 1
      continue
    }
    if (src >= cells.length) break
    const cell = cells[src++]
    for (let k = 0; k < cell.colspan; k++) {
      out[col + k] = cell
      if (cell.rowspan > 1) carry.set(col + k, { cell, remaining: cell.rowspan - 1 })
    }
    col += cell.colspan
  }
  return out
}

/**
 * Parse every `wikitable` into `{ headers, subHeaders, rows }`, with
 * `rowspan`/`colspan` expanded so every row is dense and column-aligned.
 *
 * A progress table has a TWO-ROW header — `Contestant | Episode` (the second
 * cell spanning every episode column), then `1 | 2 | 3 | ...`. Consuming only
 * the first row would leave the numeric row masquerading as a data row and
 * report zero episodes, which is exactly what the first version of this parser
 * did. Every LEADING all-`th` row after the first is collected into
 * `subHeaders`; a data row almost always carries at least one `td`, so this
 * cannot eat real content.
 */
export function parseTables(html) {
  const tables = []
  const tableRe = /<table\b[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi
  let tm
  while ((tm = tableRe.exec(html))) {
    const body = tm[1]
    const rows = []
    const carry = new Map()
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    let rm
    while ((rm = trRe.exec(body))) {
      const cellRe = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi
      const cells = []
      let cm
      while ((cm = cellRe.exec(rm[1]))) {
        cells.push({
          tag: cm[1].toLowerCase(),
          html: cm[3],
          colspan: spanOf(cm[2], 'colspan'),
          rowspan: spanOf(cm[2], 'rowspan'),
        })
      }
      if (!cells.length) continue
      const dense = expandRow(cells, carry)
      if (dense.length) rows.push(dense)
    }
    if (!rows.length) continue
    const headerRow = rows[0].every((c) => c.tag === 'th')
      ? rows.shift()
      : rows[0].some((c) => c.tag === 'th')
        ? rows.shift()
        : []
    const headers = (headerRow || []).map((c) => stripTags(c.html).toLowerCase())

    // Additional leading header rows (the episode-number strip of a progress
    // table). Bounded to two so a th-heavy data table cannot be consumed whole.
    const subHeaders = []
    let guard = 0
    while (rows.length && rows[0].every((c) => c.tag === 'th') && guard++ < 2) {
      subHeaders.push(rows.shift().map((c) => stripTags(c.html).toLowerCase()))
    }

    tables.push({ headers, subHeaders, rows })
  }
  return tables
}

export function pickContestantTables(tables) {
  return tables.filter(
    (t) =>
      t.headers.some((h) => /contestant|entrant|queen/.test(h)) &&
      (t.headers.some((h) => /outcome|result|finish/.test(h)) ||
        t.headers.some((h) => /hometown|age/.test(h))),
  )
}

export function colIndex(headers, re) {
  return headers.findIndex((h) => re.test(h))
}

export function seasonLabel(title, franchise) {
  let m = title.match(/\((?:season|series)\s+(\d+)\)/i) || title.match(/(?:season|series)\s+(\d+)/i)
  if (m) return (/series/i.test(title) ? 'Series ' : 'Season ') + m[1]
  if (/All Stars/i.test(title)) {
    const n = title.match(/(\d+)/)
    return 'All Stars' + (n ? ' ' + n[1] : '')
  }
  if (/vs[.\s]+the world/i.test(title)) {
    const n = title.match(/season\s+(\d+)/i)
    return 'vs the World' + (n ? ' ' + n[1] : '')
  }
  return null
}

/** The integer in a season label, or null for an unnumbered one-off. */
export function seasonNumber(label) {
  if (!label) return null
  const m = label.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

export const normKey = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// ---- discovery -------------------------------------------------------------

export async function discoverSeasonPages(fetchCached, { skipFranchises = [], franchiseFilter = null } = {}) {
  const parent = 'Category:Drag Race (franchise) seasons'
  const subcatJson = await fetchCached(
    apiUrl({
      action: 'query',
      list: 'categorymembers',
      cmtype: 'subcat',
      cmlimit: '200',
      cmtitle: parent,
    }),
    'subcats',
  )
  const subcats = (subcatJson?.query?.categorymembers ?? []).map((x) => x.title)
  const pages = []
  for (const cat of subcats) {
    const franchise = cat.replace(/^Category:/, '').replace(/\s+seasons$/, '')
    if (skipFranchises.some((s) => franchise.includes(s))) continue
    const mj = await fetchCached(
      apiUrl({
        action: 'query',
        list: 'categorymembers',
        cmtype: 'page',
        cmlimit: '200',
        cmtitle: cat,
      }),
      'cat_' + cat,
    )
    for (const p of mj?.query?.categorymembers ?? []) pages.push({ title: p.title, franchise })
  }
  for (const e of EXTRA_PAGES) if (!pages.some((p) => p.title === e.title)) pages.push(e)
  const seen = new Set()
  return pages.filter((p) => {
    if (seen.has(p.title)) return false
    seen.add(p.title)
    if (franchiseFilter && !p.franchise.toLowerCase().includes(franchiseFilter)) return false
    return true
  })
}

export async function fetchSeasonHtml(fetchCached, title) {
  const j = await fetchCached(
    apiUrl({ action: 'parse', prop: 'text', page: title, redirects: '1' }),
    'page_' + title,
  )
  if (!j || j.__notfound) return null
  return j?.parse?.text ?? null
}

// ---- contestant rows (behaviour identical to the original importer) --------

export function parseContestantRows(html, { title, franchise }) {
  const tables = pickContestantTables(parseTables(html))
  if (!tables.length) return []
  const season = seasonLabel(title, franchise)
  const out = []
  for (const t of tables) {
    const ci = colIndex(t.headers, /contestant|entrant|queen/)
    const oi = colIndex(t.headers, /outcome|result|finish/)
    const hi = colIndex(t.headers, /hometown|residence|from/)
    const ai = colIndex(t.headers, /age/)
    for (const row of t.rows) {
      const nameCellIdx = ci >= 0 && ci < row.length ? ci : 0
      const nameCell = row[nameCellIdx]
      if (!nameCell) continue
      const name = stripTags(nameCell.html)
      if (!name || !/[a-z0-9]/i.test(name) || /^(contestant|entrant|queen|winner|guest)s?$/i.test(name))
        continue
      if (/^total|^episode|^\d+$/i.test(name)) continue
      if (SEASON_LABEL_RE.test(name)) continue
      out.push({
        stage_name: name,
        wikipedia_title: firstLinkTitle(nameCell.html),
        outcome: oi >= 0 && row[oi] ? stripTags(row[oi].html) : null,
        hometown: hi >= 0 && row[hi] ? stripTags(row[hi].html) : null,
        age: ai >= 0 && row[ai] ? stripTags(row[ai].html) : null,
        franchise,
        season,
        page: title,
      })
    }
  }
  return out
}

// ---- NEW: progress table ---------------------------------------------------

/**
 * The progress table is the grid: one row per queen, one column per episode,
 * cells carrying WIN / SAFE / BTM / ELIM and friends.
 *
 * Detected by shape, not by caption: the caption is localised or absent on many
 * franchises, but "first column names a contestant and at least three headers
 * are bare integers" holds across all of them.
 */
/** The header row that actually carries the episode numbers, if any. */
function episodeNumberRow(t) {
  const candidates = [...(t.subHeaders ?? []), t.headers]
  let best = null
  for (const row of candidates) {
    const numeric = row.filter((h) => /^\d+$/.test(h.trim())).length
    if (!best || numeric > best.numeric) best = { row, numeric }
  }
  return best && best.numeric >= 3 ? best : null
}

export function pickProgressTable(tables) {
  let best = null
  for (const t of tables) {
    const hit = episodeNumberRow(t)
    if (!hit) continue
    const label = `${t.headers[0] ?? ''} ${(t.headers[1] ?? '')}`
    const looksRight = /contestant|queen|entrant|place|rank|episode/.test(label)
    if (!looksRight && hit.numeric < 5) continue
    if (!best || hit.numeric > best.numeric) best = { table: t, numeric: hit.numeric }
  }
  return best?.table ?? null
}

/**
 * Rows of `{ stage_name, cells: [{ episode_number, raw }] }`.
 *
 * Episode numbers come from the HEADER text, never from cell position, because
 * trailing "total"/"placement" columns and merged cells both shift positions.
 *
 * ALIGNMENT: the name column is spanned by the first header rather than
 * repeated in the numeric row, so the numeric row is shorter than a data row.
 * The offset is recovered from the length difference of the WIDEST data row
 * (some queens are eliminated early and their row is short), rather than
 * assuming 1 — franchises that add a "place" column ahead of the grid would
 * silently shift every cell by one under a fixed offset.
 */
export function parseProgressTable(table) {
  const hit = episodeNumberRow(table)
  if (!hit) return []

  const epCols = []
  hit.row.forEach((h, i) => {
    const m = h.trim().match(/^(\d+)$/)
    if (m) epCols.push({ index: i, episode: parseInt(m[1], 10) })
  })
  if (!epCols.length) return []

  const widest = table.rows.reduce((a, r) => Math.max(a, r.length), 0)
  const offset = Math.max(0, widest - hit.row.length)

  const out = []
  for (const row of table.rows) {
    const nameCell = row[0]
    if (!nameCell) continue
    const name = stripTags(nameCell.html)
    if (!name || !/[a-z]/i.test(name)) continue
    if (SEASON_LABEL_RE.test(name)) continue
    if (/^(contestant|queen|entrant|episode|total)s?$/i.test(name)) continue

    // An episode number can legitimately appear TWICE. A finale is often given
    // two columns both labelled with the same number: the challenge result and
    // then the final placement. Measured on Drag Race Belgique season 2, whose
    // header row is [...,"7","8","8"]:
    //
    //   Alvilda        8:"WIN"   8:"Winner"
    //   La Veuve       8:"SAFE"  8:"Runner-up"
    //   Gabanna        8:"SAFE"  8:"Eliminated"
    //
    // The schema holds one row per (entrant, episode), so these must collapse.
    // KEEP THE LAST: it is the queen's terminal outcome in that episode, which
    // is what a reader scanning the row wants. Keeping the first would render
    // the finale as "safe" for a queen who was eliminated in it. Left
    // uncollapsed this produced 110 duplicate keys across the corpus and the
    // seed failed with "ON CONFLICT DO UPDATE cannot affect row a second time".
    const byEpisode = new Map()
    for (const { index, episode } of epCols) {
      const c = row[index + offset]
      if (!c) continue
      const raw = stripTags(c.html)
      if (!raw) continue
      byEpisode.set(episode, raw)
    }
    const cells = [...byEpisode.entries()].map(([episode_number, raw]) => ({
      episode_number,
      raw,
    }))
    if (cells.length) out.push({ stage_name: name, cells })
  }
  return out
}

// ---- NEW: episode list -----------------------------------------------------

const EPISODE_DATE_RE = /air ?date|original release|release date|first aired|broadcast/
// "No.", "No.overall", "No. inseason", "#", "Ep.", "Episode". The MediaWiki
// episode-list template emits the two "no." variants with the qualifier glued
// on, which an anchored /^no\.?$/ misses entirely — that is why the first
// version of this parser reported zero episodes on every season page.
const EPISODE_NUM_RE = /^no\b|^#|^ep\b|^episode\b/

/** Episode table → `[{ episode_number, title, air_date }]`. */
export function parseEpisodeTable(tables) {
  const t = tables.find(
    (x) =>
      x.headers.some((h) => EPISODE_NUM_RE.test(h.trim())) &&
      x.headers.some((h) => EPISODE_DATE_RE.test(h)),
  )
  if (!t) return []
  // Prefer the in-season number over the overall/series-wide one: the grid axis
  // and the progress table are both per-season, so "overall" would put episode
  // 24 of the franchise next to episode 1 of the grid.
  let ni = t.headers.findIndex((h) => /^no\b.*season|^ep\b|^episode\b/.test(h.trim()))
  if (ni < 0) ni = t.headers.findIndex((h) => EPISODE_NUM_RE.test(h.trim()))
  const ti = t.headers.findIndex((h) => /title/.test(h))
  const di = t.headers.findIndex((h) => EPISODE_DATE_RE.test(h))
  if (di < 0) return []

  const out = []
  for (const row of t.rows) {
    // The MediaWiki episode-list template emits a `<td class="description"
    // colspan="5">` row after every episode row. It has one cell, no number and
    // no date. Requiring a parsed air date is what separates the two; falling
    // back to a running sequence number (the first version did) invents an
    // episode per synopsis and doubles the count.
    if (row.length < 2) continue
    const air = row[di] ? parseWikiDate(stripTags(row[di].html)) : null
    if (!air) continue

    const numRaw = ni >= 0 && row[ni] ? stripTags(row[ni].html) : ''
    const n = parseInt((numRaw.match(/\d+/) ?? [])[0] ?? '', 10)
    if (!Number.isFinite(n)) continue

    out.push({ episode_number: n, title: episodeTitle(row[ti]), air_date: air })
  }
  // Same episode number twice means the table was not what we thought it was.
  const seen = new Set()
  return out.filter((e) => {
    if (seen.has(e.episode_number)) return false
    seen.add(e.episode_number)
    return true
  })
}

/**
 * Episode titles on non-English franchises are bilingual: the localised title
 * and an English translation, separated by a `<br />` that stripTags flattens
 * into one run-on string ("What's Up, Lindas!""What's up, Lindas!"). Take the
 * FIRST quoted segment — the title as broadcast — and fall back to the whole
 * cell when the page does not use quotes.
 */
function episodeTitle(cell) {
  if (!cell) return null
  const text = stripTags(cell.html)
  if (!text) return null
  const quoted = text.match(/"([^"]+)"/)
  const title = (quoted ? quoted[1] : text).trim()
  return title || null
}

/**
 * "February 2, 2009" / "2 February 2009" / "(2009-02-02)" → "2009-02-02".
 *
 * The ISO form is tried FIRST because Wikipedia's date templates emit a hidden
 * ISO span next to the human-readable text; when it is present it is
 * unambiguous, and the human form beside it may be localised.
 */
export function parseWikiDate(text) {
  if (!text) return null
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  }
  const mdy = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/)
  if (mdy && MONTHS[mdy[1].toLowerCase()]) {
    return `${mdy[3]}-${String(MONTHS[mdy[1].toLowerCase()]).padStart(2, '0')}-${String(mdy[2]).padStart(2, '0')}`
  }
  const dmy = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/)
  if (dmy && MONTHS[dmy[2].toLowerCase()]) {
    return `${dmy[3]}-${String(MONTHS[dmy[2].toLowerCase()]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`
  }
  return null
}

// ---- NEW: infobox ----------------------------------------------------------

/**
 * Season infobox as a label → text map. Separate from `parseTables` because the
 * infobox is `class="infobox"`, not `wikitable`.
 */
export function parseInfobox(html) {
  const m = html.match(/<table\b[^>]*class="[^"]*infobox[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
  if (!m) return {}
  const out = {}
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let rm
  while ((rm = trRe.exec(m[1]))) {
    const th = rm[1].match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)
    const td = rm[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)
    if (!th || !td) continue
    const label = stripTags(th[1]).toLowerCase().replace(/\s+/g, ' ').trim()
    if (!label) continue
    // Keep the raw HTML too: release ranges hide their ISO dates in spans that
    // stripTags would flatten into one string.
    out[label] = { text: stripTags(td[1]), html: td[1] }
  }
  return out
}

/** Season-level facts: network, first/last aired, stated episode count. */
export function parseSeasonMeta(html) {
  const box = parseInfobox(html)
  const pick = (re) => {
    const k = Object.keys(box).find((x) => re.test(x))
    return k ? box[k] : null
  }

  const network = pick(/^(original )?(network|channel)$|^release$/)
  const release = pick(/original release|original run|release date|first aired/)
  const episodes = pick(/no\. of episodes|number of episodes|episodes/)

  let first = null
  let last = null
  if (release) {
    // An ISO range appears as two hidden spans; take the first and last.
    const isos = [...release.html.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((x) => x[1])
    if (isos.length) {
      first = isos[0]
      last = isos.length > 1 ? isos[isos.length - 1] : null
    } else {
      // Fall back to the human-readable halves either side of the dash.
      const parts = release.text.split(/[–—]|\bto\b/)
      first = parseWikiDate(parts[0] ?? '')
      last = parts.length > 1 ? parseWikiDate(parts[1]) : null
    }
  }

  const epCount = episodes ? parseInt((episodes.text.match(/\d+/) ?? [])[0] ?? '', 10) : NaN

  return {
    network: network ? cleanNetwork(network.text) : null,
    first_aired: first,
    last_aired: last,
    episode_count: Number.isFinite(epCount) ? epCount : null,
  }
}

/**
 * Infobox network cells often concatenate the network with the release line
 * ("Logo TVFebruary 2, 2009"). Cut at the first date-looking token and keep a
 * sane prefix.
 */
function cleanNetwork(text) {
  if (!text) return null
  let t = text
    .replace(/\(.*?\)/g, ' ')
    .split(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/)[0]
    .split(/\d{4}-\d{2}-\d{2}/)[0]
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > 60) t = t.slice(0, 60).trim()
  return t || null
}

// ---- enrichment (shared with the personality importer) ---------------------

export async function resolveQids(fetchCached, titles) {
  const map = new Map()
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const j = await fetchCached(
      apiUrl({
        action: 'query',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        redirects: '1',
        titles: batch.join('|'),
      }),
      'pp_' + md5(batch.join('|')),
    )
    const redir = new Map((j?.query?.redirects ?? []).map((r) => [r.from, r.to]))
    for (const p of j?.query?.pages ?? []) {
      if (p.pageprops?.wikibase_item) map.set(p.title, p.pageprops.wikibase_item)
    }
    for (const [from, to] of redir) if (map.has(to)) map.set(from, map.get(to))
  }
  return map
}
