# Travelpayouts Full Potential Analysis for queer.guide

## Critical Issue: Hotellook is Dead

**Hotellook closed October 20, 2025.** Our `hotel-search` edge function uses the Hotellook API which is defunct. The widget API (`yasen.hotellook.com`) and cache API (`engine.hotellook.com`) may still serve cached data but will stop completely. **Must replace immediately.**

**Replacement:** Switch to Booking.com affiliate (available via Travelpayouts) or Trip.com API.

---

## All Available Travelpayouts Programs by Vertical

### 1. FLIGHTS (Currently using: Aviasales)
**Status:** Active, working well. Using `prices_for_dates`, `city-directions-prices`, `prices/cheap`.

**Untapped APIs we should add:**

| API | Endpoint | Value for queer.guide |
|-----|----------|----------------------|
| Calendar pricing | `/v1/prices/calendar` | Show cheapest day to fly on city pages |
| Monthly pricing | `/v1/prices/monthly` | "Best month to visit" widget |
| Price trends | `/v2/prices/latest` | Feed price-drop-check with real-time data |
| Nearby airports | `/v2/prices/nearest-places-matrix` | "Flexible airport" search for cheaper deals |
| Special offers | `/v2/prices/special-offers` | Airline promo deals section on /travel |
| Real-time search | `POST /v1/flight_search` | Live multi-agency search (needs high traffic) |
| Reference data | `/data/en/airports.json`, `/data/en/cities.json` | Sync with our airports table |

### 2. HOTELS (BROKEN - Hotellook dead)
**Must switch to one of:**

| Program | Commission | API? | Notes |
|---------|-----------|------|-------|
| **Booking.com** | 25-40% of their commission | Via Travelpayouts link | Largest inventory. No direct API via TP. |
| **Trip.com** | Up to 5% | API available | Good Asia coverage |
| **Agoda** | Up to 7% | Link-based | Strong Asia-Pacific |
| **Hostelworld** | Up to €0.20/booking | Link-based | Budget travelers |
| **trivago** | CPC model | Link-based | Meta-search |

**Recommendation:** Booking.com as primary (largest inventory, best brand trust). Trip.com as secondary for Asia destinations.

### 3. CAR RENTAL
**Not yet integrated. Programs available:**

| Program | Commission | Notes |
|---------|-----------|-------|
| **DiscoverCars** | Up to 70% of TP commission | Meta-search aggregator |
| **Rentalcars.com** | Up to 6% | Booking Holdings owned |
| **Economy Bookings** | Up to 50% of TP commission | Budget focus |
| **Auto Europe** | 4-6% | Premium/luxury |

**queer.guide opportunity:** Add "Rent a Car" section to CityTravelHub and /travel page. Many LGBTQ+ travelers prefer cars for safety (control over transportation in less safe countries).

### 4. TRANSFERS & GROUND TRANSPORT
**Not yet integrated. Programs available:**

| Program | Commission | Notes |
|---------|-----------|-------|
| **Kiwitaxi** | Up to 50% of TP commission | Airport transfers |
| **GetTransfer** | 7-12% | Private transfers |
| **Omio** | Up to €2/booking | Trains + buses across Europe |
| **Busbud** | 3% | Bus tickets worldwide |
| **12Go** | 5% | Asia transport (trains, buses, ferries) |

**queer.guide opportunity:** Critical for LGBTQ+ safety. Private transfers avoid public transport in less safe areas. Add "Airport Transfer" CTA on city pages with low equality scores.

### 5. ACTIVITIES & TOURS (Currently using: GetYourGuide direct)
**Also available via Travelpayouts:**

| Program | Commission | Notes |
|---------|-----------|-------|
| **GetYourGuide** | 8% | Already integrated direct |
| **Viator** | 8% | TripAdvisor owned, huge inventory |
| **Klook** | Up to 5% | Strong Asia coverage |
| **Tiqets** | 5-8% | Museum/attraction tickets |
| **Ticketmaster** | Varies | Concerts/events |
| **Musement** | Up to 8% | European experiences |

**queer.guide opportunity:** Add Viator as secondary activity provider (different inventory than GYG). Tiqets for museum/gallery tickets on culture-focused city pages.

### 6. INSURANCE
**Not yet integrated. Programs available:**

| Program | Commission | Notes |
|---------|-----------|-------|
| **SafetyWing** | 10% | Digital nomad insurance |
| **World Nomads** | Up to 10% | Adventure travel insurance |
| **Allianz Travel** | 7-10% | Premium coverage |
| **Heymondo** | Up to 15% | Budget-friendly |

**queer.guide opportunity:** HUGE for LGBTQ+ travelers. Many need travel insurance that covers: gender-affirming care abroad, HIV medication, partner coverage (not all insurers cover same-sex partners). Create a "Travel Insurance for LGBTQ+ Travelers" guide page with curated recommendations.

### 7. WHITE LABEL
**Available tools:**

| Tool | What it does | Cost |
|------|-------------|------|
| **White Label Web** | Full flight search engine on your domain | Free (30% rev share) |
| **White Label App** | iOS/Android flight search app | Free |
| **Widgets** | Embeddable search forms, maps, calendars | Free |
| **WordPress Plugin** | One-click integration | Free |

**queer.guide opportunity:** The White Label Web could replace our custom flight search with a more polished experience. BUT we lose control over the UX and can't integrate LGBTQ+ safety data. Better to keep our custom approach.

### 8. DATA & REFERENCE APIs
**Free, no auth required for most:**

| Endpoint | Data | Use |
|----------|------|-----|
| `/data/en/countries.json` | Country codes, currencies | Sync with our countries table |
| `/data/en/cities.json` | City IATA codes, coordinates | Sync with our cities/airports table |
| `/data/en/airports.json` | Airport details | Enhance our airports table |
| `/data/en/airlines.json` | Airline info | Show airline logos on deal cards |
| `/data/routes.json` | All airline routes | Know which routes exist before searching |

---

## Implementation Priority for queer.guide

### P0 — Fix Now (Hotellook dead)
1. **Replace Hotellook with Booking.com affiliate links** in hotel-search edge function
2. **Add Trip.com API** as alternative hotel source

### P1 — High Value, Quick Wins
3. **Calendar pricing widget** on city pages ("Best time to fly to Barcelona")
4. **Car rental integration** (DiscoverCars) — add to CityTravelHub + /travel
5. **Airport transfer** (Kiwitaxi/GetTransfer) — safety-critical for low-score countries
6. **Travel insurance guide** page with affiliate links

### P2 — Medium Value
7. **Viator as secondary activity provider** (more inventory)
8. **Airline reference data sync** (logos, alliance info on deal cards)
9. **Monthly pricing** ("Best month to visit" on city overview tab)
10. **Nearby airports** flexible search on /travel flights tab

### P3 — Future / High Traffic Required
11. **Real-time flight search** (requires high traffic approval)
12. **White Label App** (iOS/Android)
13. **Bus/train integration** (Omio, Busbud, 12Go)

---

## Revenue Model Summary

| Vertical | Current | With full integration |
|----------|---------|----------------------|
| Flights | Aviasales affiliate (1.6%) | Same + special offers |
| Hotels | Hotellook (DEAD) | Booking.com (25-40% of TP share) |
| Activities | GetYourGuide (8%) | + Viator (8%) + Tiqets (5-8%) |
| Car Rental | None | DiscoverCars (up to 70% of TP) |
| Transfers | None | Kiwitaxi (50% of TP) |
| Insurance | None | SafetyWing/Heymondo (10-15%) |
