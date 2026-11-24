import {
  corsResponse,
  errorResponse,
  getCorsHeaders,
} from "../_shared/supabase-client.ts";
import { fetchFares, isFlightDate } from "./fares.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", 405, req);
  }
  try {
    let body: Record<string, unknown>;
    try {
      body = req.method === "GET"
        ? Object.fromEntries(new URL(req.url).searchParams)
        : await req.json();
      if (!body || typeof body !== "object") throw new Error("Invalid body");
    } catch {
      return errorResponse("Invalid search request", 400, req);
    }
    const origin = typeof body.origin === "string"
      ? body.origin.trim().toUpperCase()
      : "";
    const destination = typeof body.destination === "string"
      ? body.destination.trim().toUpperCase()
      : undefined;
    if (
      !/^[A-Z]{3}$/.test(origin) ||
      (destination && !/^[A-Z]{3}$/.test(destination))
    ) {
      return errorResponse("Valid airport codes are required", 400, req);
    }
    const departureDate = body.departureDate || undefined;
    const returnDate = body.returnDate || undefined;
    if (
      (departureDate && !isFlightDate(departureDate)) ||
      (returnDate && !isFlightDate(returnDate)) ||
      (returnDate &&
        (!departureDate || String(returnDate) < String(departureDate)))
    ) {
      return errorResponse(
        "Use valid departure and return dates in order",
        400,
        req,
      );
    }
    const token = Deno.env.get("TRAVELPAYOUTS_API_TOKEN");
    if (!token) return errorResponse("Fare search unavailable", 503, req);
    const parsedLimit = Number(body.limit ?? 10);
    const deals = await fetchFares({
      origin,
      destination,
      departureDate: departureDate as string | undefined,
      returnDate: returnDate as string | undefined,
      type: body.type === "popular_routes" ? "popular_routes" : "flights",
      currency: typeof body.currency === "string" ? body.currency : "eur",
      limit: Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(100, Math.trunc(parsedLimit)))
        : 10,
    }, token);
    return new Response(
      JSON.stringify({ success: true, deals, origin, destination }),
      {
        headers: {
          ...getCorsHeaders(req),
          "Content-Type": "application/json",
          "Cache-Control": req.method === "GET"
            ? "public, max-age=1800"
            : "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Travel deals error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return errorResponse(
      "Fare search unavailable. Please try again.",
      502,
      req,
    );
  }
});
