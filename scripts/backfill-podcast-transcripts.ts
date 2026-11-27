// Run with: SUPABASE_ACCESS_TOKEN=... npx tsx scripts/backfill-podcast-transcripts.ts --apply --feeds
// Dry-run by default. Re-read publisher RSS to recover metadata older parsers
// discarded, then use the exact same discovery and guarded RPC as the worker.
import { parseRssItems } from '../supabase/functions/source-rss-news/rss-parse.ts'
import { podcastTranscriptLinks, transcriptUrl } from '../supabase/functions/_shared/podcast-transcripts.ts'
import { resolveToken, PROJECT_REF } from './lib/remote-migrations.mjs'

interface SourceRow { id: string; name: string; url: string }
interface EpisodeRow { id: string; source_id: string; url: string; audio_url: string | null; podcast_transcript_feed_links: unknown }
interface PendingRow { id: string; url: string; content: string; raw_notes: string; declared: unknown; source_hash: string }

const token = resolveToken()
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required')
const apply = process.argv.includes('--apply')
const feeds = process.argv.includes('--feeds')
const sqlString = (s: string) => "'" + s.replace(/'/g, "''") + "'"
async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const response = await fetch('https://api.supabase.com/v1/projects/' + PROJECT_REF + '/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error('Database request failed: ' + response.status + ' ' + (await response.text()).slice(0, 200))
  return response.json()
}
async function readFeed(raw: string): Promise<string> {
  let url = transcriptUrl(raw)
  if (!url) throw new Error('Unsafe feed URL')
  for (let redirect = 0; redirect < 5; redirect++) {
    const response = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'QueerGuideBot/1.0 (+https://queer.guide/bot)' },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      url = location ? transcriptUrl(location, url) : null
      if (!url) throw new Error('Unsafe or missing redirect')
      continue
    }
    if (!response.ok || !response.body) throw new Error('HTTP ' + response.status)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0, text = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 12_000_000) throw new Error('Feed exceeds 12 MB')
        text += decoder.decode(value, { stream: true })
      }
      return text + decoder.decode()
    } finally { await reader.cancel() }
  }
  throw new Error('Too many redirects')
}

async function main() {
  let recovered = 0, failedFeeds = 0
  if (feeds) {
    const sources = await query<SourceRow>("select s.id,s.name,s.url from public.news_sources s where exists(select 1 from public.news_articles n where n.source_id=s.id and n.media_type='podcast') order by s.id")
    const episodes = await query<EpisodeRow>("select id,source_id,url,audio_url,podcast_transcript_feed_links from public.news_articles where media_type='podcast'")
    const bySource = new Map<string, EpisodeRow[]>()
    for (const episode of episodes) bySource.set(episode.source_id, [...(bySource.get(episode.source_id) ?? []), episode])
    let cursor = 0
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < sources.length) {
        const source = sources[cursor++]
        try {
          const xml = await readFeed(source.url)
          const items = parseRssItems(xml, true, 3000, 12_000_000)
          const index = new Map<string, Record<string, unknown>>()
          for (const item of items) {
            if (typeof item.url === 'string') index.set(item.url, item)
            if (typeof item.audio_url === 'string') index.set(item.audio_url, item)
          }
          const patches = []
          for (const episode of bySource.get(source.id) ?? []) {
            const item = (episode.audio_url ? index.get(episode.audio_url) : null) ?? index.get(episode.url)
            if (!item) continue
            const links = item.podcast_transcript_links
            if (!Array.isArray(links) || !links.length || JSON.stringify(links) === JSON.stringify(episode.podcast_transcript_feed_links)) continue
            patches.push({ id: episode.id, links })
          }
          if (apply && patches.length) {
            for (let i = 0; i < patches.length; i += 100) {
              await query('update public.news_articles n set podcast_transcript_feed_links=p.links from jsonb_to_recordset(' +
                sqlString(JSON.stringify(patches.slice(i, i + 100))) + "::jsonb) p(id uuid,links jsonb) where n.id=p.id and n.source_id=" + sqlString(source.id) + "::uuid and n.media_type='podcast'")
            }
          }
          recovered += patches.length
          console.log(JSON.stringify({ source: source.name, recovered: patches.length, items: items.length, applied: apply }))
        } catch (error) {
          failedFeeds++
          console.error(JSON.stringify({ source: source.name, error: String(error) }))
        }
      }
    }))
  }
  let processed = 0, available = 0
  for (let batch = 0; batch < 200; batch++) {
    const rows = await query<PendingRow>('select * from public.news_podcast_transcripts_pending(200)')
    if (!rows.length) break
    const items = rows.map((row) => ({
      id: row.id, source_hash: row.source_hash,
      links: podcastTranscriptLinks(row.content, podcastTranscriptLinks(row.raw_notes, row.declared, row.url), row.url),
    }))
    available += items.filter((item) => item.links.length).length
    if (!apply) {
      console.log(JSON.stringify({ dry_run: true, selected: items.length, with_links: available, previews: items.filter((item) => item.links.length).slice(0, 5) }))
      break
    }
    const result = await query('select public.news_podcast_transcripts_apply(' + sqlString(JSON.stringify(items)) + '::jsonb) updated')
    const updated = Number(result[0].updated)
    if (!updated) throw new Error('Pending batch made no progress; retry after concurrent edits settle')
    processed += updated
    console.log(JSON.stringify({ processed, with_links: available }))
    if (batch === 199) throw new Error('Safety batch limit reached; rerun to continue')
  }
  console.log(JSON.stringify({ complete: true, apply, recovered, failedFeeds, processed, available }))
}
main().catch((error) => { console.error(String(error)); process.exitCode = 1 })
