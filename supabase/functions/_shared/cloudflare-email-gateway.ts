import { readEmailGatewayReceipt } from "./email-gateway-receipt.ts";
/** Compatibility transport for existing specialized transactional outboxes. */
export async function cloudflareGatewayRequest(
  payload: Record<string, unknown>,
  identity: string,
  secret: string,
  gatewayUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL("/send", gatewayUrl);
  if (url.protocol !== "https:") {
    throw new Error("HTTPS email gateway required");
  }
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${
    digest.slice(12, 16)
  }-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
  const recipients = payload.to;
  if (
    !Array.isArray(recipients) || recipients.length !== 1 ||
    typeof recipients[0] !== "string"
  ) throw new Error("One transactional recipient required");
  const response = await fetcher(url.href, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      id,
      category: "transactional",
      to: recipients[0].toLowerCase(),
    }),
  });
  if (!response.ok) return response;
  const receipt = await readEmailGatewayReceipt(response);
  if (
    receipt.status === "accepted" && typeof receipt.id === "string" &&
    receipt.id
  ) return Response.json({ id: receipt.id });
  if (receipt.status === "retry") {
    return Response.json({ error: "rate_limited" }, {
      status: 429,
      headers: {
        "Retry-After": String(
          typeof receipt.retryAfterSeconds === "number"
            ? Math.max(0, Math.min(86400, Math.ceil(receipt.retryAfterSeconds)))
            : 60,
        ),
      },
    });
  }
  if (receipt.status === "failed" || receipt.status === "suppressed") {
    return Response.json({ error: "rejected" }, { status: 422 });
  }
  // Replaying the identical identity is safe: the Durable Object never resends
  // its uncertain state, even if a specialized queue asks for another receipt.
  return Response.json({ error: "uncertain" }, { status: 503 });
}
