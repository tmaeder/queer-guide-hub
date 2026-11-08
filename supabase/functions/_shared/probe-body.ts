/** Read a bounded response body, cancelling when the consumer reaches its limit. */
export async function readProbeBody(
  response: Response,
  limit: number,
  allowTruncation = false,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(0)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value.byteLength > limit - total) {
        if (!allowTruncation) throw new Error(`Response exceeds ${limit} byte probe limit`)
        chunks.push(value.subarray(0, limit - total))
        total = limit
        break
      }
      chunks.push(value)
      total += value.byteLength
      if (allowTruncation && total === limit) break
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
