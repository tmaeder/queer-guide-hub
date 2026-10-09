export const REPORT_CATEGORIES = new Set([
  'safety',
  'bug',
  'idea',
  'improvement',
  'content-idea',
])

const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024
const MAX_BASE64_CHARS = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 16
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface ValidatedCommunityReport {
  kind: 'feedback' | 'correction'
  data: Record<string, unknown>
  sourceUrl: string | null
  screenshot: { bytes: Uint8Array; contentType: string } | null
  discard: boolean
}

export type CommunityReportValidation =
  | { ok: true; value: ValidatedCommunityReport }
  | { ok: false; error: string }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function email(value: unknown): string | null {
  const candidate = text(value, 320)
  return candidate && candidate.includes('@') ? candidate : null
}

function httpUrl(value: unknown): string | null {
  const candidate = text(value, 2048)
  if (!candidate) return null
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

function sanitizeContext(value: unknown): Record<string, unknown> {
  const input = record(value)
  if (!input) return {}
  const viewport = record(input.viewport)
  const viewportWidth = Number(viewport?.width)
  const viewportHeight = Number(viewport?.height)
  const errors = Array.isArray(input.errors) ? input.errors.slice(-20) : []
  const networkFailures = Array.isArray(input.network_failures)
    ? input.network_failures.slice(-10)
    : []

  return {
    url: httpUrl(input.url),
    viewport:
      viewport && Number.isFinite(viewportWidth) && Number.isFinite(viewportHeight)
        ? {
            width: Math.max(0, Math.min(10000, viewportWidth)),
            height: Math.max(0, Math.min(10000, viewportHeight)),
          }
        : null,
    user_agent: text(input.user_agent, 1000) || null,
    color_scheme: text(input.color_scheme, 20) || null,
    timestamp: text(input.timestamp, 60) || null,
    errors: trimDiagnosticEntries(errors),
    network_failures: trimDiagnosticEntries(networkFailures),
  }
}

function trimDiagnosticEntries(entries: unknown[]): unknown[] {
  return entries.map((entry) => {
    const item = record(entry)
    if (!item) return text(entry, 1000)
    return Object.fromEntries(
      Object.entries(item)
        .slice(0, 12)
        .map(([key, value]) => [key.slice(0, 80), text(value, 2000)]),
    )
  })
}

function decodeScreenshot(value: unknown): { bytes: Uint8Array; contentType: string } | null {
  const input = record(value)
  if (!input) return null
  const contentType = text(input.contentType, 50).toLowerCase()
  const base64 = typeof input.base64 === 'string' ? input.base64 : ''
  if (!IMAGE_TYPES.has(contentType) || base64.length === 0 || base64.length > MAX_BASE64_CHARS) {
    return null
  }

  try {
    const binary = atob(base64)
    if (binary.length < 100 || binary.length > MAX_SCREENSHOT_BYTES) return null
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    if (!matchesImageSignature(bytes, contentType)) return null
    return { bytes, contentType }
  } catch {
    return null
  }
}

function matchesImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (contentType === 'image/png') {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
  }
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
}

function sanitizeEntity(value: unknown): Record<string, string | null> | null {
  const entity = record(value)
  if (!entity) return null
  const contentType = text(entity.content_type, 80)
  const contentId = text(entity.content_id, 100)
  if (!contentType || !contentId) return null
  return {
    content_type: contentType,
    content_id: contentId,
    content_name: text(entity.content_name, 300) || null,
  }
}

export function validateCommunityReportBody(body: unknown): CommunityReportValidation {
  const input = record(body)
  if (!input) return { ok: false, error: 'Invalid request body' }

  if (text(input.honeypot, 500)) {
    return {
      ok: true,
      value: {
        kind: 'feedback',
        data: {},
        sourceUrl: null,
        screenshot: null,
        discard: true,
      },
    }
  }

  const kind = input.kind
  const payload = record(input.payload)
  if ((kind !== 'feedback' && kind !== 'correction') || !payload) {
    return { ok: false, error: 'Report type must be feedback or correction' }
  }

  const context = sanitizeContext(input.context)
  const screenshot = decodeScreenshot(input.screenshot)

  if (kind === 'feedback') {
    const category = text(payload.category, 50)
    const title = text(payload.title, 200)
    const description = text(payload.description, 10_000)
    if (!REPORT_CATEGORIES.has(category) || !title || !description) {
      return { ok: false, error: 'Feedback category, title and description are required' }
    }
    const sourceUrl = httpUrl(context.url)
    return {
      ok: true,
      value: {
        kind,
        sourceUrl,
        screenshot,
        discard: false,
        data: {
          title,
          description,
          category,
          contact_email: email(payload.contact_email),
          context,
          screenshot_url: null,
        },
      },
    }
  }

  const title = text(payload.title, 300)
  const description = text(payload.description, 10_000)
  const proposedCorrection = text(payload.proposed_correction, 10_000)
  const pageUrl = httpUrl(payload.page_url) ?? httpUrl(context.url)
  if (!title || !description || !proposedCorrection || !pageUrl) {
    return { ok: false, error: 'Correction details and page URL are required' }
  }

  return {
    ok: true,
    value: {
      kind,
      sourceUrl: pageUrl,
      screenshot,
      discard: false,
      data: {
        title,
        description,
        proposed_correction: proposedCorrection,
        contact_email: email(payload.contact_email),
        page_url: pageUrl,
        entity: sanitizeEntity(payload.entity),
        context,
        screenshot_url: null,
      },
    },
  }
}
