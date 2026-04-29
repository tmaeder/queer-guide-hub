export function getCorsHeaders(request: Request, allowedOrigins: string): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const allowed = new Set(
    allowedOrigins.split(",").map((s) => s.trim()).filter(Boolean),
  );
  const allowExtension = origin.startsWith("chrome-extension://");
  const ok = allowed.has(origin) || allowExtension;
  return {
    "Access-Control-Allow-Origin": ok ? origin : "",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
