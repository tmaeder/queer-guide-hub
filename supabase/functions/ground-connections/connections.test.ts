import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findConnections, mapItineraries, pickStop } from "./connections.ts";

// Shape trimmed from a real Transitous answer (Zürich → Berlin, 2026-11-27).
const itinerary = {
  transfers: 1,
  legs: [
    { mode: "WALK", from: { name: "start" }, to: { name: "Zürich HB" } },
    {
      mode: "HIGHSPEED_RAIL",
      displayName: "ICE 108",
      from: { name: "Zürich HB", tz: "Europe/Zurich", departure: "2026-11-27T08:59:00Z" },
      to: { name: "Mannheim Hbf", tz: "Europe/Berlin", arrival: "2026-11-27T12:22:00Z" },
    },
    {
      mode: "HIGHSPEED_RAIL",
      displayName: "ICE 598",
      from: { name: "Mannheim Hbf", tz: "Europe/Berlin", departure: "2026-11-27T12:36:00Z" },
      to: { name: "Berlin Hbf", tz: "Europe/Berlin", arrival: "2026-11-27T17:30:00Z" },
    },
    { mode: "WALK", from: { name: "Berlin Hbf" }, to: { name: "end" } },
  ],
};

Deno.test("maps a journey station to station, dropping walks", () => {
  const [c] = mapItineraries([itinerary]);
  assertEquals(c.fromStop, "Zürich HB");
  assertEquals(c.toStop, "Berlin Hbf");
  assertEquals(c.departure, "2026-11-27T08:59:00Z");
  assertEquals(c.arrival, "2026-11-27T17:30:00Z");
  assertEquals(c.departureTz, "Europe/Zurich");
  assertEquals(c.durationMinutes, 511);
  assertEquals(c.transfers, 1);
  assertEquals(c.lines, ["ICE 108", "ICE 598"]);
});

Deno.test("skips itineraries without a ride", () => {
  assertEquals(mapItineraries([{ legs: [{ mode: "WALK" }] }]), []);
});

Deno.test("picks the busiest stop, not the city centroid", () => {
  const hit = pickStop([
    { type: "PLACE", name: "Zürich", lat: 47.374, lon: 8.541, importance: null },
    { type: "STOP", name: "Zürich Enge", lat: 47.364, lon: 8.53, importance: 0.006 },
    { type: "STOP", name: "Zürich HB", lat: 47.378, lon: 8.537, importance: 0.073 },
  ]);
  assertEquals(hit, { lat: 47.378, lon: 8.537 });
});

Deno.test("asks for coaches in coach mode and caches the answer", async () => {
  const urls: string[] = [];
  const fake = ((url: string) => {
    urls.push(url);
    const body = url.includes("/geocode")
      ? [{ type: "STOP", lat: 1, lon: 2, importance: 1 }]
      : { itineraries: [itinerary] };
    return Promise.resolve(new Response(JSON.stringify(body)));
  }) as unknown as typeof fetch;
  const args = { from: "Testa", to: "Testb", date: "2026-11-27", mode: "coach" as const };
  const first = await findConnections(args, fake);
  const again = await findConnections(args, fake);
  assertEquals(first.length, 1);
  assertEquals(again, first);
  const plans = urls.filter((u) => u.includes("/plan"));
  assertEquals(plans.length, 1);
  assertEquals(new URL(plans[0]).searchParams.get("transitModes"), "COACH");
});
