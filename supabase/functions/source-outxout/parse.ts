/** Public Out x Out publisher formats. No private endpoints or editorial copying. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped publisher JSON-LD; fields are checked where read
export type Obj = Record<string, any>;
export type Item = {
  source_entity_id: string;
  target_table: string;
  normalized: Obj;
  raw: Obj;
};
function schemaHas(o: Obj, type: string): boolean {
  return (Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]]).includes(type);
}
export const BASE = "https://outxout.com";
const countries: Obj = {
  "United States": "US",
  Canada: "CA",
  Mexico: "MX",
  Spain: "ES",
  England: "GB",
  Scotland: "GB",
  "Northern Ireland": "GB",
  "United Kingdom": "GB",
  Germany: "DE",
  France: "FR",
  Netherlands: "NL",
  "Puerto Rico": "PR",
};
const categories: Obj = {
  Bars: "bar",
  Hotels: "hotel",
  Restaurants: "restaurant",
  Shops: "shop",
  Gyms: "gym",
  Bathhouses: "sauna",
  "Theater + Performance": "theater",
  "Museums + Culture": "gallery",
  Hostels: "hotel",
};
export function url(value: unknown, homepage = false): string | null {
  if (typeof value !== "string" || !value.trim() || value.startsWith("@")) {
    return null;
  }
  try {
    const u = new URL(
      /^https?:/.test(value) ? value.trim() : `https://${value.trim()}`,
    );
    if (
      !["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".") ||
      u.username || u.password
    ) return null;
    if (
      homepage &&
      /(^|\.)(outxout\.com|eventbrite\.[a-z.]+|fatsoma\.com)$/.test(u.hostname)
    ) return null;
    return u.href;
  } catch {
    return null;
  }
}
export function country(s: unknown): string | null {
  return typeof s === "string"
    ? countries[s] ?? (/^[A-Z]{2}$/.test(s) ? s : null)
    : null;
}
function cleanName(s: string, city?: string): string {
  return city && s.endsWith(`, ${city}`) ? s.slice(0, -city.length - 2) : s;
}
export function point(lat: unknown, lng: unknown): Obj {
  if (
    lat == null || lng == null || !Number.isFinite(+lat) ||
    !Number.isFinite(+lng) || Math.abs(+lat) > 90 || Math.abs(+lng) > 180 ||
    +lat === +lng || (+lat === 0 && +lng === 0)
  ) return { lat: null, lng: null };
  return { lat: +lat, lng: +lng };
}
function walk(value: unknown, visit: (o: Obj) => void): void {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value)) visit(value);
  for (const v of Object.values(value)) walk(v, visit);
}
export function extract(
  html: string,
): { objects: Obj[]; jsonld: Obj[]; links: string[]; emptyEvents: boolean } {
  const objects: Obj[] = [], jsonld: Obj[] = [];
  let flight = "";
  for (
    const m of html.matchAll(/self\.__next_f\.push\((\[1,.*?\])\)<\/script>/gs)
  ) {
    try {
      flight += JSON.parse(m[1])[1];
    } catch { /* malformed segment is checked by caller */ }
  }
  const visit = (o: Obj) => {
    if (
      (o.venue_id && o.venue_slug && (o.venue_name || o.venue_display_name) &&
        !o.event_id) ||
      (o.event_id && o.event_slug) || (o.place_id && o.place_slug) ||
      (o.sp_id && o.sp_slug)
    ) objects.push(o);
  };
  for (const line of flight.split("\n")) {
    const p = line.indexOf(":");
    if (p < 0) continue;
    try {
      walk(JSON.parse(line.slice(p + 1)), visit);
    } catch { /* text/binary RSC chunks are not JSON */ }
  }
  // Text-length RSC chunks can share a line with the next structured chunk.
  // Decode identity-bearing balanced objects independently of that framing.
  const starts = new Set<number>();
  for (
    const m of flight.matchAll(/"(?:venue_id|event_id|sp_id|place_slug)"\s*:/g)
  ) {
    const start = flight.lastIndexOf("{", m.index);
    if (start < 0 || starts.has(start)) continue;
    starts.add(start);
    let depth = 0, quoted = false, escaped = false;
    for (let end = start; end < flight.length; end++) {
      const c = flight[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
        continue;
      }
      if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try {
          visit(JSON.parse(flight.slice(start, end + 1)));
        } catch { /* malformed object */ }
        break;
      }
    }
  }
  for (
    const m of html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gs,
    )
  ) {
    try {
      walk(JSON.parse(m[1]), (o) => {
        if (o["@type"]) jsonld.push(o);
      });
    } catch { /* callers reject missing expected entity */ }
  }
  const links = [
    ...html.matchAll(
      /href=["'](\/(?:venue|event|service-provider)\/[^"'?#]+)["']/g,
    ),
  ].map((m) => BASE + m[1].replaceAll("&amp;", "&"));
  return {
    objects,
    jsonld,
    links: [...new Set(links)],
    emptyEvents: /"initialEvents"\s*:\s*\[\]/.test(flight),
  };
}
function wrap(kind: string, slug: string, normalized: Obj, raw: Obj): Item {
  const source_entity_id = `${kind}/${slug}`;
  normalized.sourceId = source_entity_id;
  normalized.metadata = {
    ...normalized.metadata,
    source: "outxout",
    url: normalized.metadata?.url ?? `${BASE}/${kind}/${slug}`,
    // Keep factual publisher evidence even when an existing canonical row only
    // needs a gap update. Do not copy editorial descriptions into this snapshot.
    source_evidence: Object.fromEntries(
      Object.entries(raw.native ?? raw).filter(([key]) =>
        [
          "venue_id",
          "venue_slug",
          "venue_name",
          "venue_display_name",
          "venue_category",
          "event_id",
          "event_slug",
          "event_display_name",
          "start_date",
          "end_date",
          "event_address",
          "location_name",
          "timezone_name",
          "recurrence_rule",
          "event_status",
          "sp_id",
          "organization_name",
          "address",
          "city",
          "state",
          "country",
          "lat",
          "lng",
          "website",
          "venue_url",
          "email",
          "phone",
          "web_hours",
          "image_url",
          "img_url",
          "league_name",
          "sports",
          "seasons",
          "fee",
          "who_can_play",
          "skill_levels",
          "source_url",
        ].includes(key)
      ),
    ),
  };
  // The commit RPC falls back to urls[0] for tickets; a directory page is NOT a ticket.
  normalized.urls = [];
  return {
    source_entity_id,
    target_table: ({
      venue: "venues",
      event: "events",
      organization: "organizations",
    } as Obj)[kind],
    normalized,
    raw,
  };
}
export function venue(v: Obj): Item {
  const name = v.venue_name || cleanName(v.venue_display_name || "", v.city);
  const images = v.img_url
    ? [
      `https://agwpullzone.b-cdn.net/${
        v.image_source || "venuecoverphoto"
      }/${v.img_url}`,
    ]
    : v.images ?? [];
  return wrap("venue", v.venue_slug, {
    name,
    category: categories[v.venue_category] ?? v.category ?? "other",
    description: `${name} is listed by Out x Out under ${
      v.venue_category || "venues"
    }${v.city ? ` in ${v.city}` : ""}.`,
    location: {
      address: v.address ?? null,
      city: v.city ?? null,
      state: v.state ?? null,
      country: country(v.country),
      ...point(v.lat, v.lng),
    },
    contacts: {
      website: url(v.venue_url, true),
      phone: v.phone ?? null,
      email: v.email ?? null,
      instagram: url(v.instagram),
      facebook: url(v.facebook),
    },
    hours: v.web_hours ?? null,
    images,
    tags: ["lgbtq", ...(v.type_tags ?? [])],
    metadata: {
      source_native_id: v.venue_id ?? null,
      source_category: v.venue_category ?? null,
    },
  }, v);
}
export function event(e: Obj): Item {
  const name = e.event_display_name || e.name || "";
  return wrap("event", e.event_slug, {
    name,
    title: name,
    event_type: e.is_circuit ? "party" : "other",
    start_date: e.start_date ?? null,
    end_date: e.end_date ?? null,
    description: `${name} takes place${e.city ? ` in ${e.city}` : ""}${
      e.start_date ? ` on ${e.start_date.slice(0, 10)}` : ""
    }. See the organiser for programme details.`,
    location: {
      address: e.event_address ?? null,
      city: e.city ?? null,
      state: e.state ?? null,
      country: country(e.country),
      timezone: e.timezone_name ?? null,
      lat: null,
      lng: null,
    },
    venue_name: cleanName(e.venue_name || "", e.city),
    website: url(e.website, true),
    ticket_url: null,
    images: e.image_url
      ? [
        /^https?:/.test(e.image_url)
          ? e.image_url
          : `https://agwpullzone.b-cdn.net/eventmedia/${e.image_url}`,
      ]
      : [],
    tags: ["lgbtq"],
    metadata: {
      source_native_id: e.event_id ?? null,
      source_venue_slug: e.venue_slug ?? null,
      date_status: /\b(TBC|TBD)\b/i.test(name)
        ? "unconfirmed"
        : "source_published",
      recurrence_rule: e.recurrence_rule ?? null,
    },
  }, e);
}
export function professional(o: Obj, native: Obj, slug: string): Item {
  const person = schemaHas(o, "Person"),
    employer = o.worksFor ?? {},
    addr = o.address ?? employer.address ?? o.workLocation ?? {};
  const name = person ? employer.name : o.name;
  const services = o.knowsAbout ?? native.service_type ??
    ["professional services"];
  // Never turn an unverified person's name into an organisation.
  return wrap("organization", `service-provider/${slug}`, {
    name: name || "",
    description: `${
      name || "Provider"
    } is listed by Out x Out as a professional service provider${
      addr.addressLocality ? ` in ${addr.addressLocality}` : ""
    }. Contact the practice for current services.`,
    location: {
      address: addr.streetAddress ?? null,
      city: addr.addressLocality ?? null,
      state: addr.addressRegion ?? null,
      country: country(addr.addressCountry) ??
        (addr.addressLocality === "Chicago" &&
            /, IL \d{5}/.test(addr.streetAddress || "")
          ? "US"
          : null),
      ...point(
        (o.geo ?? employer.geo)?.latitude,
        (o.geo ?? employer.geo)?.longitude,
      ),
    },
    contacts: {
      website: url(
        person ? employer.url : native.website || o.sameAs?.[0],
        true,
      ),
      phone: person ? null : o.telephone ?? null,
      email: person ? null : o.email ?? null,
    },
    tags: ["professional-services"],
    metadata: {
      url: `${BASE}/service-provider/${slug}`,
      source_native_id: native.sp_id ?? null,
      roles: ["community"],
      identity_review_required: !name,
      services,
      source_kind: "professional_service",
    },
  }, { jsonld: o, native });
}
export function detail(html: string, sourceUrl: string): Item[] {
  const x = extract(html),
    u = new URL(sourceUrl),
    slug = decodeURIComponent(u.pathname.split("/").pop()!);
  if (u.pathname.startsWith("/service-provider/")) {
    const o = x.jsonld.find((o) =>
      schemaHas(o, "Person") || schemaHas(o, "ProfessionalService")
    ) ?? x.jsonld.find((o) =>
      ["LocalBusiness", "Organization"].some((t) =>
        schemaHas(o, t)
      ) &&
      o.url === sourceUrl
    );
    if (!o) {
      throw Error("provider schema missing");
    }
    return [
      professional(
        o,
        x.objects.find((o) =>
          o.sp_slug === slug
        ) ?? {},
        slug,
      ),
    ];
  }
  if (u.pathname.startsWith("/venue/")) {
    const native = x.objects.find((o) => o.venue_slug === slug && !o.event_id);
    if (native) {
      return [
        venue(native),
        ...x.objects.filter((o) => o.event_id).map(event),
      ];
    }
    const o = x.jsonld.find((o) =>
      ["LocalBusiness", "BarOrPub", "Hotel", "LodgingBusiness", "Restaurant"]
        .some((t) => schemaHas(o, t))
    );
    if (!o) throw Error("venue schema missing");
    const a = o.address ?? {}, g = o.geo ?? {};
    return [
      venue({
        venue_slug: slug,
        venue_name: cleanName(o.name || "", a.addressLocality),
        address: a.streetAddress,
        city: a.addressLocality,
        state: a.addressRegion,
        country: a.addressCountry,
        lat: g.latitude,
        lng: g.longitude,
        venue_url: o.url,
        phone: o.telephone,
        email: o.email,
        images: typeof o.image === "string"
          ? [o.image]
          : Array.isArray(o.image)
          ? o.image
          : [],
        venue_category: ["Hotel", "LodgingBusiness"].some((t) =>
            schemaHas(o, t)
          )
          ? "Hotels"
          : schemaHas(o, "BarOrPub")
          ? "Bars"
          : schemaHas(o, "Restaurant")
          ? "Restaurants"
          : "Other",
      }),
      ...x.objects.filter((o) => o.event_id).map(event),
    ];
  }
  const native = x.objects.find((o) => o.event_slug === slug);
  const o = x.jsonld.find((o) => schemaHas(o, "Event"));
  if (!o && !native) throw Error("event schema missing");
  const loc = o?.location ?? {},
    addr = loc.address ?? {},
    organizer = o?.organizer?.url;
  const e: Obj = {
    ...native,
    event_slug: slug,
    ...(o
      ? {
        event_display_name: o.name,
        start_date: o.startDate,
        end_date: o.endDate,
        city: addr.addressLocality,
        state: addr.addressRegion,
        country: addr.addressCountry,
        event_address: addr.streetAddress,
        venue_name: loc.name,
      }
      : {}),
  };
  if (organizer?.startsWith(`${BASE}/venue/`)) {
    e.venue_slug = organizer.split("/").pop();
  }
  return [event(e)];
}
export function csv(text: string): Obj[] {
  const rows: string[][] = [], row: string[] = [];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      rows.push([...row]);
      row.length = 0;
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("unterminated CSV quote");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift() ?? [];
  if (!headers.includes("league_name") || !headers.includes("city_slug")) {
    throw Error("sports CSV contract changed");
  }
  return rows.filter((r) => r.some(Boolean)).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))
  );
}
export function sport(r: Obj): Item {
  const slug = `sports/${
    r.league_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
      /^-|-$/g,
      "",
    )
  }-${r.city_slug}`;
  return wrap("organization", slug, {
    name: r.league_name,
    description: `${r.league_name} offers ${
      (r.sports || "").replaceAll(";", ",")
    } in ${r.city}.`,
    location: { city: r.city, country: "US" },
    contacts: { website: url(r.website, true) },
    tags: [
      "sports",
      ...(r.sports || "").split(";").map((s: string) => s.trim()).filter(
        Boolean,
      ),
    ],
    metadata: {
      url: `${BASE}/sports/download`,
      roles: ["community"],
      source_kind: "sports_league",
      source_url: r.source_url,
      registration_url: r.registration_url,
      instagram: r.instagram,
      verified_at: r.verified_at,
      city_slug: r.city_slug,
      sports_details: {
        sports: r.sports,
        seasons: r.seasons,
        fee: r.fee,
        who_can_play: r.who_can_play,
        skill_levels: r.skill_levels,
      },
    },
  }, r);
}
export function nextCursor(events: Obj[], current: string): string | null {
  if (events.length < 30) return null;
  const next = events.at(-1)?.start_date;
  if (
    !next || !Number.isFinite(Date.parse(next)) ||
    Date.parse(next) <= Date.parse(current)
  ) throw Error("city event timestamp boundary saturated or regressed");
  return next;
}
