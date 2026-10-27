// Charset-aware decoding of fetched feeds and pages.
//
// Every news fetcher used to do `new TextDecoder('utf-8').decode(bytes)`.
// queer.de serves its RSS feed and its article pages as ISO-8859-1
// (`<?xml version="1.0" encoding="iso-8859-1"?>`, `<meta charset=iso-8859-1>`),
// so each umlaut/ß byte (0xE4, 0xFC, 0xDF, …) is an invalid UTF-8 sequence and
// became U+FFFD: "Bühne" was stored as "B�hne". That loss is
// irreversible once written — the replacement character does not remember
// which byte it replaced — so the only fix is decoding correctly up front.
//
// Resolution order (WHATWG-ish):
//   1. a byte-order mark,
//   2. the charset parameter of the Content-Type header,
//   3. the XML declaration's encoding="…" (feeds),
//   4. an HTML <meta charset> / http-equiv content-type (pages),
//   5. UTF-8 — and if strict UTF-8 FAILS with nothing declared, windows-1252,
//      because undeclared non-UTF-8 on the open web is overwhelmingly Latin-1.
//
// A declared label TextDecoder does not know falls through to the next rule
// rather than throwing. Note `TextDecoder('iso-8859-1')` is windows-1252 per
// the Encoding Standard, which is what publishers mean by it anyway (curly
// quotes in 0x80–0x9F).
//
// Keep in sync with workers/extract/src/decodeCharset.ts (drift-tested by
// src/lib/__tests__/decodeCharsetDrift.test.ts).

const SNIFF_BYTES = 2048

function normalizeLabel(label: string | null | undefined): string | null {
  if (!label) return null
  const l = label.trim().replace(/^["']|["']$/g, '').toLowerCase()
  if (!l) return null
  try {
    // Validates the label; returns the canonical encoding name.
    return new TextDecoder(l).encoding
  } catch {
    return null
  }
}

export function charsetFromContentType(contentType: string | null | undefined): string | null {
  if (!contentType) return null
  const m = /charset\s*=\s*("?)([^";,\s]+)\1/i.exec(contentType)
  return normalizeLabel(m?.[2])
}

/** Declared charset inside the first bytes of the document (ASCII-compatible sniff). */
export function charsetFromDocument(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, SNIFF_BYTES))
  const xml = /^\s*<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(head)
  if (xml) return normalizeLabel(xml[1])
  const meta = /<meta[^>]+charset\s*=\s*["']?([^"'\s/>;]+)/i.exec(head)
  if (meta) return normalizeLabel(meta[1])
  return null
}

function bomCharset(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  return null
}

export interface DecodedText {
  text: string
  /** Canonical encoding actually used. */
  charset: string
  /** Where it came from — useful in run reports. */
  source: 'bom' | 'header' | 'document' | 'default' | 'fallback'
}

/**
 * Decode fetched bytes honouring the declared charset.
 * `truncated` marks a byte-capped body: a multi-byte sequence cut at the cap
 * must not make strict UTF-8 fail and wrongly trigger the Latin-1 fallback.
 */
export function decodeBytes(
  bytes: Uint8Array,
  contentType?: string | null,
  opts: { truncated?: boolean } = {},
): DecodedText {
  const declared: [string | null, DecodedText['source']][] = [
    [bomCharset(bytes), 'bom'],
    [charsetFromContentType(contentType), 'header'],
    [charsetFromDocument(bytes), 'document'],
  ]
  for (const [cs, source] of declared) {
    if (cs) {
      return { text: new TextDecoder(cs).decode(bytes, { stream: !!opts.truncated }), charset: cs, source }
    }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes, { stream: !!opts.truncated })
    return { text, charset: 'utf-8', source: 'default' }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), charset: 'windows-1252', source: 'fallback' }
  }
}

/** True when text carries U+FFFD — the signature of a wrong decode. */
export function hasReplacementChar(s: string | null | undefined): boolean {
  return !!s && s.includes('�')
}
