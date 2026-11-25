import { corsResponse, errorResponse, jsonResponse } from "../_shared/supabase-client.ts";
import { findConnections, type GroundMode } from "./connections.ts";

const CITY = /^[\p{L}\p{M}0-9 .,'()-]{2,80}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid request", 400, req);
  }
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const date = typeof body.date === "string" ? body.date : "";
  const mode = body.mode === "rail" || body.mode === "coach" ? (body.mode as GroundMode) : null;
  if (!CITY.test(from) || !CITY.test(to) || !DATE.test(date) || !mode) {
    return errorResponse("Give two cities, a date and rail or coach", 400, req);
  }

  try {
    const connections = await findConnections({ from, to, date, mode });
    return jsonResponse({ success: true, connections }, 200, req);
  } catch (error) {
    console.error(
      "ground-connections:",
      error instanceof Error ? error.message : "unknown error",
    );
    return errorResponse("Connections are unavailable right now", 502, req);
  }
});
