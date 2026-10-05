# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Queer people and allies discovering places, events, communities, rights information, and travel options worldwide. The trip-planning experience serves both first-time visitors collecting an initial travel idea and signed-in travellers coordinating an active trip before, during, and after travel.

## Product Purpose

Queer Guide connects queer discovery with practical action. It helps people find places and events, understand destination context and safety, turn discoveries into a trip, coordinate the details, and carry that plan while travelling.

Success means discovery does not end at a content page: a visitor can preserve travel intent, build a useful itinerary, return to it, and act on bookings and preparation without losing context.

## Positioning

The product combines a global queer place and event corpus with country rights and safety context, community knowledge, travel planning, collaboration, and live-trip tools. The trip planner is grounded in Queer Guide's own entities and safety model rather than being a generic itinerary shell.

## Operating Context

- Visitors browse cities, countries, villages, venues, events, hotels, search results, maps, editorial collections, and saved items.
- Signed-in travellers may manage several trips, with one active trip providing temporary context across the product.
- Trips move through seed, plan, countdown, live, and memory phases.
- The planner supports itinerary building, reservations, booking links, budgeting, packing, documents, safety, sharing, collaboration, offline snapshots, live Today mode, and post-trip memories.

## Capabilities and Constraints

- React, TypeScript, React Router, TanStack Query, Supabase, Tailwind, and shadcn-style UI primitives form the existing stack.
- Existing canonical routes and the intent-based navigation remain authoritative. Trips do not become another top-level navigation intent.
- The product is an affiliate booking aggregator, not a travel payment processor.
- Safety and criminalisation gating remain authoritative for recommendations and social travel features.
- Archived trips do not become active automatically.
- Behavioural analytics must respect the existing consent boundary.
- No core trip-schema expansion is required for the ambient trip layer.

## Brand Commitments

The product name is queer.guide. The incumbent interface uses a restrained editorial, monochrome system with subway-inspired wayfinding, intent tracks, compact operational controls, and plain, direct language. New trip UI extends that system rather than introducing a competing visual identity.

## Evidence on Hand

- The repository contains a mature trip platform with phase logic, active-trip state, itinerary tooling, safety, collaboration, booking, offline, and memory features.
- The current integration audit and approved ambient-layer strategy are recorded in `docs/plans/2026-10-05-ambient-trip-layer-design.md`.
- No testimonials, externally validated conversion benchmarks, or user-research transcripts are present; future work must not fabricate them.

## Product Principles

1. Turn discovery into continuity: preserve travel intent across surfaces and authentication.
2. Reveal capability according to trip phase instead of presenting every tool at once.
3. Prefer one contextual action over repeated selection dialogs.
4. Keep sensitive travel context controllable, dismissible, and absent from unrelated private flows.
5. Reuse the existing trip system before adding new data models or duplicate routes.

## Accessibility & Inclusion

All trip actions and dock controls must be keyboard accessible, screen-reader labelled, localized across supported languages, safe under reduced motion, and usable without hover. Safety-sensitive features must preserve the platform's existing visibility and criminalisation safeguards.
