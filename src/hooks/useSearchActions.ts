/**
 * Atomic hooks for explicit user-driven events that feed the search-proxy
 * personalization bias vector. Implicit `view` events are handled by
 * SearchTelemetryProvider — these hooks cover everything else.
 */

import { useCallback } from "react";
import {
	trackSearchEvent,
	submitFeedback,
	type TrackEvent,
} from "@/lib/searchClient";
import { useAuth } from "@/hooks/useAuth";

export interface Entity {
	type: string; // venue | event | city | country | personality | news | tag | marketplace | queer_village
	id: string;
}

/** Track any user click on an entity (card / search result / suggestion / etc). */
export function useTrackClick() {
	const { user } = useAuth();
	return useCallback(
		(entity: Entity, source?: string, extra: Record<string, unknown> = {}) => {
			void trackSearchEvent("click", entity, { source, ...extra }, user?.id ?? null);
		},
		[user?.id],
	);
}

/** Generic track helper for non-click events (book, attend, dismiss). */
export function useTrack() {
	const { user } = useAuth();
	return useCallback(
		(event: TrackEvent, entity: Entity, metadata: Record<string, unknown> = {}) => {
			void trackSearchEvent(event, entity, metadata, user?.id ?? null);
		},
		[user?.id],
	);
}

/** Wraps existing favorite logic — caller still upserts to *_favorites table. */
export function useSaveAction() {
	const { user } = useAuth();
	return useCallback(
		(entity: Entity, isNowSaved: boolean, metadata: Record<string, unknown> = {}) => {
			const event: TrackEvent = isNowSaved ? "save" : "dismiss";
			void trackSearchEvent(event, entity, metadata, user?.id ?? null);
		},
		[user?.id],
	);
}

/** Thumbs up/down on a search result. */
export function useFeedbackVote() {
	const { user } = useAuth();
	return useCallback(
		(entity: Entity, vote: "up" | "down", query?: string) => {
			void submitFeedback(entity, vote, query, user?.id ?? null);
		},
		[user?.id],
	);
}

/** Booking confirmed / event attended — high-weight signal. */
export function useBookingTracker() {
	const { user } = useAuth();
	return useCallback(
		(entity: Entity, metadata: Record<string, unknown> = {}) => {
			void trackSearchEvent("book", entity, metadata, user?.id ?? null);
		},
		[user?.id],
	);
}

export function useAttendTracker() {
	const { user } = useAuth();
	return useCallback(
		(entity: Entity, metadata: Record<string, unknown> = {}) => {
			void trackSearchEvent("attend", entity, metadata, user?.id ?? null);
		},
		[user?.id],
	);
}
