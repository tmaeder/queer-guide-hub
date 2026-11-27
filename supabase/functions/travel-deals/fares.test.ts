import { deepStrictEqual, equal, rejects } from "node:assert/strict";
import { type FareSearch, fetchFares, isFlightDate } from "./fares.ts";

const base: FareSearch = {
  origin: "ZRH",
  type: "flights",
  currency: "eur",
  limit: 9,
};
const fare = (
  destination: string,
  price: number,
  departure = "2027-01-14",
  back?: string,
) => ({
  origin: "ZRH",
  destination,
  price,
  departure_at: departure,
  return_at: back,
});

Deno.test("exact dates and round-trip choice reach the provider; mismatches are excluded", async () => {
  let requested: URL | undefined;
  const fetcher = ((input: URL) => {
    requested = input;
    return Promise.resolve(
      Response.json({
        success: true,
        currency: "eur",
        data: [
          fare(
            "BER",
            100,
            "2027-01-14T10:00:00+01:00",
            "2027-01-20T20:00:00+01:00",
          ),
          fare("BER", 50, "2027-01-15", "2027-01-20"),
          fare("BER", 70, "2027-01-14", "2027-01-21"),
        ],
      }),
    );
  }) as unknown as typeof fetch;
  const result = await fetchFares(
    {
      ...base,
      destination: "BER",
      departureDate: "2027-01-14",
      returnDate: "2027-01-20",
    },
    "test-token",
    fetcher,
  );
  equal(requested!.searchParams.get("departure_at"), "2027-01-14");
  equal(requested!.searchParams.get("return_at"), "2027-01-20");
  equal(requested!.searchParams.get("one_way"), "false");
  equal(requested!.searchParams.has("token"), false);
  equal(result.length, 1);
  equal(result[0].price, 100);
  equal(
    new URL(result[0].affiliate_url).searchParams.get("params"),
    "ZRH1401BER20011",
  );
});

Deno.test("popular routes request uniqueness and keep the cheapest fare per destination", async () => {
  let requested: URL | undefined;
  const fetcher = ((input: URL) => {
    requested = input;
    return Promise.resolve(
      Response.json({
        success: true,
        data: [
          fare("ROM", 31),
          fare("ROM", 30),
          fare("BER", 50),
          fare("LIS", 60),
        ],
      }),
    );
  }) as unknown as typeof fetch;
  const result = await fetchFares(
    { ...base, type: "popular_routes", limit: 3 },
    "test-token",
    fetcher,
  );
  equal(requested!.searchParams.get("unique"), "true");
  deepStrictEqual(result.map((r) => [r.destination, r.price]), [["ROM", 30], [
    "BER",
    50,
  ], ["LIS", 60]]);
});

Deno.test("provider errors are retryable failures, never a successful empty or undated fallback", async () => {
  let calls = 0;
  const fetcher = (() => {
    calls++;
    return Promise.resolve(new Response("Unavailable", { status: 503 }));
  }) as typeof fetch;
  await rejects(
    fetchFares({ ...base, departureDate: "2027-01-14" }, "test-token", fetcher),
  );
  equal(calls, 1);
  await rejects(
    fetchFares(
      base,
      "test-token",
      (() =>
        Promise.resolve(
          Response.json({ success: false, data: [] }),
        )) as typeof fetch,
    ),
  );
});

Deno.test("a genuine empty response stays empty and dates reject impossible calendar days", async () => {
  deepStrictEqual(
    await fetchFares(
      base,
      "test-token",
      (() =>
        Promise.resolve(
          Response.json({ success: true, data: [] }),
        )) as typeof fetch,
    ),
    [],
  );
  equal(isFlightDate("2027-02-29"), false);
  equal(isFlightDate("2028-02-29"), true);
  equal(isFlightDate("2027-13-01"), false);
  equal(isFlightDate("2027-01"), false);
});
