/** Bounded receipts: never buffer unbounded provider output or log its body. */
export async function readEmailGatewayReceipt(
  response: Response,
): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Gateway receipt missing");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 16384) {
      await reader.cancel();
      throw new Error("Gateway receipt too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const receipt: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new Error("Invalid gateway receipt");
  }
  return receipt as Record<string, unknown>;
}
