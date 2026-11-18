import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csv,
  detail,
  event,
  extract,
  nextCursor,
  point,
  professional,
  sport,
  url,
  venue,
} from "./parse.ts";

test("RSC text framing and split chunks retain catalogue identities", () => {
  const value = {
    cities: [{
      place_id: "city-id",
      place_slug: "amsterdam-nl",
      country: "Netherlands",
    }],
  };
  const flight = '26:Tff,{"@type":"CollectionPage"}27:' +
    JSON.stringify(["$", null, null, value]) + "\n";
  const half = Math.floor(flight.length / 2);
  const html = [flight.slice(0, half), flight.slice(half)].map((s) =>
    `<script>self.__next_f.push(${JSON.stringify([1, s])})</script>`
  ).join("");
  assert.ok(extract(html).objects.some((o) => o.place_slug === "amsterdam-nl"));
});
test("source pages never become homepage or ticket URLs", () => {
  assert.equal(url("https://outxout.com/venue/x", true), null);
  assert.equal(url("javascript:alert(1)"), null);
  const e = event({
    event_slug: "x",
    event_id: "id",
    event_display_name: "Party",
    start_date: "2027-01-02T20:00:00Z",
    city: "Seattle",
    country: "United States",
  });
  assert.deepEqual(e.normalized.urls, []);
  assert.equal(e.normalized.ticket_url, null);
  assert.equal(e.normalized.metadata.source_native_id, "id");
});
test("invalid mirrored and absent coordinates are not invented", () => {
  assert.deepEqual(point(25.9, 25.9), { lat: null, lng: null });
  assert.deepEqual(point(null, -74), { lat: null, lng: null });
  assert.deepEqual(point(40.7, -74), { lat: 40.7, lng: -74 });
});
test("venue hours and stable identity survive normalization", () => {
  const v = venue({
    venue_id: "uuid",
    venue_slug: "stable",
    venue_name: "Venue",
    country: "United States",
    city: "Seattle",
    venue_category: "Bars",
    web_hours: { mon: "5–10pm" },
  });
  assert.equal(v.source_entity_id, "venue/stable");
  assert.deepEqual(v.normalized.hours, { mon: "5–10pm" });
  assert.equal(v.normalized.location.country, "US");
});
test("TBC dates remain explicit review candidates", () => {
  assert.equal(
    event({ event_slug: "pride", event_display_name: "Pride 2027 (Date TBC)" })
      .normalized.metadata.date_status,
    "unconfirmed",
  );
});
test("a professional is represented only by a published employer", () => {
  const missing = professional(
    { "@type": "Person", name: "Personal Name" },
    {},
    "person",
  );
  assert.equal(missing.normalized.name, "");
  assert.equal(missing.normalized.metadata.identity_review_required, true);
  const employer = professional(
    {
      "@type": "Person",
      name: "Personal Name",
      email: "private@example.org",
      worksFor: { name: "Practice", url: "https://practice.example.org" },
    },
    {},
    "person",
  );
  assert.equal(employer.normalized.name, "Practice");
  assert.equal(employer.normalized.contacts.email, null);
});
test("JSON-LD fallback retains exact country/address and lodging category", () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({
    "@type": "LodgingBusiness",
    name: "Hotel, Seattle",
    address: {
      streetAddress: "1 Main St",
      addressLocality: "Seattle",
      addressCountry: "US",
    },
    geo: { latitude: 47.6, longitude: -122.3 },
  }) + "</script>";
  const v = detail(html, "https://outxout.com/venue/hotel")[0];
  assert.equal(v.normalized.name, "Hotel");
  assert.equal(v.normalized.category, "hotel");
  assert.equal(v.normalized.location.address, "1 Main St");
});
test("CSV quoting and stable league identity are preserved", () => {
  const rows = csv(
    'league_name,city,city_slug,sports,website\n"Team, One",Seattle,seattle-wa,"rugby; running",https://example.org\n',
  );
  assert.equal(rows[0].league_name, "Team, One");
  assert.equal(
    sport(rows[0]).source_entity_id,
    "organization/sports/team-one-seattle-wa",
  );
  assert.throws(() => csv('name\n"unterminated'));
});
test("inclusive event pagination fails loudly on a saturated timestamp", () => {
  const current = "2027-01-01T00:00:00Z";
  assert.equal(nextCursor([], current), null);
  assert.throws(
    () =>
      nextCursor(
        Array.from({ length: 30 }, () => ({ start_date: current })),
        current,
      ),
    /saturated/,
  );
  assert.equal(
    nextCursor(
      Array.from(
        { length: 30 },
        () => ({ start_date: "2027-01-02T00:00:00Z" }),
      ),
      current,
    ),
    "2027-01-02T00:00:00Z",
  );
});

test("multi-type JSON-LD business arrays remain importable with factual evidence", () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({
    "@type": ["LocalBusiness", "HealthAndBeautyBusiness"],
    name: "Steam & Sauna, Akron",
    description: "Editorial prose must not be copied into factual evidence.",
    address: {
      streetAddress: "41 S Case Ave",
      addressLocality: "Akron",
      addressCountry: "US",
    },
  }) + "</script>";
  const v = detail(html, "https://outxout.com/venue/steam")[0];
  assert.equal(v.normalized.name, "Steam & Sauna");
  assert.equal(v.normalized.metadata.source_evidence.address, "41 S Case Ave");
  assert.equal(v.normalized.metadata.source_evidence.description, undefined);
});
