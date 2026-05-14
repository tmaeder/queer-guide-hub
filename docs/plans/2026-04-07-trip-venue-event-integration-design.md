# Trip Planner <> Venue/Event Integration Design

## Goal
Seamlessly connect venue/event/hotel browsing with trip planning. Users should be able to add any entity to a trip from anywhere in the app, see which entities are already in their trips, and discover trips featuring specific venues.

## Components

### 1. AddToTripDialog (new shared component)
- Full modal: trip selector (list of user's trips + "Create New Trip"), day picker, optional notes
- Pre-filled with entity data (venue_id/event_id/hotel_id, name, coordinates, city_id, country_id)
- Uses useTripMutations().addPlace
- Toast on success: "Added [name] to [trip name]"
- If no trips: shows "Create your first trip" inline form

### 2. AddToTripMenuItem (new — for context menus)
- Menu item with Luggage icon + "Add to Trip" label
- Opens AddToTripDialog with entity pre-filled
- Disabled state if user not logged in (shows "Sign in to plan trips")

### 3. useEntityTripStatus hook (new)
- Given an entity type + id, checks if it's in any of the user's trips
- Returns: { isInTrip: boolean, tripNames: string[], tripCount: number }
- Query: trip_places WHERE venue_id/event_id/hotel_id = X AND trip_id IN (user's trips)
- Cached with TanStack Query, 5min stale time

### 4. Card modifications (VenueCard, EventCard, HotelCard)
- Add 3-dot kebab menu (MoreVertical icon) top-right of card
- Menu items: "Add to Trip", "Share", "Report"
- If entity is in a trip: show small Luggage badge overlay on card image
- Badge: tiny pill "In trip" with brand color, positioned absolute top-left

### 5. Detail page modifications (VenueDetail, EventDetail, HotelDetail)
- Add "Add to Trip" button in action bar (Button variant="outline" with Luggage icon)
- If entity is in trip(s): show "In X trip(s)" Badge next to the button
- Add "Trips featuring this venue" section at bottom of page (if any public trips contain it)

### 6. CityDetail modifications
- Venue/Event cards in the Venues/Events tabs get the same context menu
- Add "Plan a trip to [city]" CTA card at top of Venues tab if user has no trip containing this city

### 7. "Already in trip" visual indicators
- VenueCard/EventCard: small Luggage icon badge on card when entity is in user's trip
- Detail pages: "In your trip: [trip name]" chip below title
- Both use useEntityTripStatus hook

### 8. "Trips featuring this venue/event" section
- Query: public trips (is_public=true) that have this entity as a trip_place
- Show as horizontal scroll of TripCard compact variants
- Only on detail pages, below main content

## Data Flow
1. User browses venues/events normally
2. useEntityTripStatus runs in background for visible entities (batched)
3. "In trip" badges appear on entities already in user's trips
4. User clicks 3-dot menu > "Add to Trip" on any card or detail page
5. AddToTripDialog opens with entity pre-filled
6. User selects trip + day, confirms
7. addPlace mutation fires, toast confirms, badge appears

## Files to Create
- web/src/components/trips/AddToTripDialog.tsx
- web/src/components/trips/AddToTripMenuItem.tsx
- web/src/hooks/useEntityTripStatus.ts

## Files to Modify
- web/src/components/venues/VenueCard.tsx (add menu + badge)
- web/src/components/events/EventCard.tsx (add menu + badge)
- web/src/components/hotels/HotelCard.tsx (add menu + badge)
- web/src/pages/VenueDetail.tsx (add button + badge + trips section)
- web/src/pages/EventDetail.tsx (add button + badge + trips section)
- web/src/pages/HotelDetail.tsx (add button + badge + trips section)
- web/src/pages/CityDetail.tsx (add CTA + pass context to cards)
