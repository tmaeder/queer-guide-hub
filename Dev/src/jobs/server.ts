/**
 * Minimal HTTP trigger server for the scraper pipeline.
 *
 * Usage:  npm run server        (default port 4400)
 *         PORT=9000 npm run server
 *
 * Endpoints:
 *   POST /run   { source: "patroc", types: ["venue","event"], maxPages: 50 }
 *   GET  /health
 *
 * The admin Import Hub UI calls POST /run to trigger scrapers with one click.
 */
import http from 'node:http'
import { orchestrate } from './orchestrator.js'
import { logger } from '../utils/logger.js'
import { ALL_SOURCES, type SourceName } from '../utils/config.js'
import type { EntityType } from '../normalize/schema.js'

const PORT = parseInt(process.env.PORT || '4400', 10)

let running = false

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const json = (status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  // GET /health
  if (req.method === 'GET' && req.url === '/health') {
    json(200, { ok: true, running, sources: ALL_SOURCES })
    return
  }

  // POST /run
  if (req.method === 'POST' && req.url === '/run') {
    if (running) {
      json(409, { error: 'A scrape is already running' })
      return
    }

    try {
      const body = await readBody(req)
      const { source, types, maxPages } = body as {
        source?: string
        types?: string[]
        maxPages?: number
      }

      // Validate source
      let sources: SourceName[]
      if (!source || source === 'all') {
        sources = ALL_SOURCES as unknown as SourceName[]
      } else {
        const requested = source.split(',').map(s => s.trim()) as SourceName[]
        const invalid = requested.filter(s => !(ALL_SOURCES as readonly string[]).includes(s))
        if (invalid.length) {
          json(400, { error: `Unknown source(s): ${invalid.join(', ')}`, valid: ALL_SOURCES })
          return
        }
        sources = requested
      }

      // Validate types
      const validTypes: EntityType[] = ['venue', 'event', 'stay', 'place']
      let entityTypes: EntityType[] | undefined
      if (types?.length) {
        const invalid = types.filter(t => !validTypes.includes(t as EntityType))
        if (invalid.length) {
          json(400, { error: `Unknown type(s): ${invalid.join(', ')}`, valid: validTypes })
          return
        }
        entityTypes = types as EntityType[]
      }

      running = true
      logger.info({ sources, types: entityTypes, maxPages }, 'Triggered via HTTP')

      // Run async — respond immediately
      json(202, {
        status: 'started',
        sources,
        types: entityTypes ?? validTypes,
        maxPages: maxPages ?? 500,
      })

      try {
        const summary = await orchestrate({
          sources,
          ...(entityTypes ? { types: entityTypes } : {}),
          ...(maxPages ? { maxPagesPerSource: maxPages } : {}),
        })
        logger.info({
          pagesFetched: summary.totalPagesFetched,
          entitiesParsed: summary.totalEntitiesParsed,
          inserted: summary.totalInserted,
          updated: summary.totalUpdated,
          failed: summary.totalFailed,
          durationMs: summary.durationMs,
        }, 'HTTP-triggered scrape complete')
      } catch (err) {
        logger.error({ err }, 'HTTP-triggered scrape failed')
      } finally {
        running = false
      }
    } catch (err) {
      json(400, { error: 'Invalid JSON body' })
    }
    return
  }

  json(404, { error: 'Not found' })
})

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()))
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'Scraper trigger server listening')
})

process.on('SIGTERM', () => { server.close(); process.exit(0) })
process.on('SIGINT', () => { server.close(); process.exit(0) })
