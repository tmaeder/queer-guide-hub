// Read-only evidence collection after repairing CDN HEAD support. The existing
// cover rule stays unchanged; failed/unknown/reused images are never waived.
import { probeForRole } from '../../supabase/functions/_shared/image-probe.ts'

const maxBytes = 12 * 1024 * 1024
export async function cdnImageProof(url: string) {
  if (!/^https:\/\/img\.queer\.guide\/event-images\/[a-f0-9]{64}\.(jpg|jpeg|png|webp)$/.test(url)) throw new Error('Only registered CDN event assets are supported')
  const signal = AbortSignal.timeout(25_000)
  const metadata = await fetch(url, { method: 'HEAD', redirect: 'error', signal })
  const size = Number(metadata.headers.get('content-length'))
  if (metadata.status !== 200 || !Number.isSafeInteger(size) || size < 20_000 || size > maxBytes) return null
  const probe = await probeForRole(url, 'cover', signal)
  if (!probe.passed || !probe.width || !probe.height || probe.status !== 200 || probe.bytes !== size) return null
  const response = await fetch(url, { redirect: 'error', signal })
  if (response.status !== 200 || !response.body
    || response.headers.get('content-type')?.toLowerCase() !== probe.contentType) return null
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body.getReader()
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    total += chunk.value.length
    if (total > maxBytes) { await reader.cancel(); return null }
    chunks.push(chunk.value)
  }
  if (total !== size) return null
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return { observed_at: new Date().toISOString(), probe_role: 'cover', http_status: 200,
    mime_type: probe.contentType, byte_size: total, width: probe.width, height: probe.height,
    content_hash: Array.from(hash, n => n.toString(16).padStart(2, '0')).join(''),
    url_hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))), n => n.toString(16).padStart(2, '0')).join(''),
  }
}

if (import.meta.main) {
  const [inputPath, outputPath] = Deno.args
  if (!inputPath || !outputPath) throw new Error('Usage: collector candidates.json output.json')
  const rows = JSON.parse(await Deno.readTextFile(inputPath)) as Array<Record<string, unknown> & { image_url: string }>
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Bounded native export required')
  const grouped = [...new Set(rows.map(row => row.image_url))]
  const proofs = new Map<string, Awaited<ReturnType<typeof cdnImageProof>>>()
  const receipts: Array<Record<string, unknown>> = []
  for (let offset = 0; offset < grouped.length; offset += 4) {
    await Promise.all(grouped.slice(offset, offset + 4).map(async url => {
      try {
        const proof = await cdnImageProof(url)
        proofs.set(url, proof)
        receipts.push({ url, positive_proof: !!proof })
      } catch (error) {
        receipts.push({ url, positive_proof: false, outcome_unknown: true, error: String(error) })
      }
    }))
    const evidence = rows.flatMap(row => {
      const proof = proofs.get(row.image_url)
      return proof ? [{ ...row, ...proof }] : []
    })
    await Deno.writeTextFile(outputPath, JSON.stringify({ captured_at: new Date().toISOString(), receipts, evidence }, null, 2))
    console.log(JSON.stringify({ unique_images: receipts.length, positive_records: evidence.length }))
  }
}
