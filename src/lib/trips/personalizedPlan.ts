import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';
import { VIBE_IDS, type PaceId, type VibeId } from '@/lib/lines/generateLine';
import type {
  BudgetTier,
  ItineraryDayResult,
  ItineraryResult,
} from '@/lib/itinerary/generateItinerary';
import { itineraryToPlaceRows } from '@/lib/itinerary/itineraryPlan';
import { TRIP_CAPTURE_TTL_MS, type TripDestinationRef } from './tripCaptureIntent';

export const MAX_PLAN_DAYS = 30;
export const MAX_PLAN_ADULTS = 9;
export const PLAN_PACES: PaceId[] = ['slow', 'steady', 'sprint'];
export const PLAN_BUDGETS: BudgetTier[] = ['budget', 'mid', 'luxury'];

const STORAGE_KEY = 'qg.personalizedPlan';

export interface PlanInputs {
  destination: TripDestinationRef;
  startDate: string;
  endDate: string;
  adults: number;
  budget: BudgetTier | null;
  pace: PaceId;
  vibe: VibeId | null;
}

export interface PlanPreview {
  inputs: PlanInputs;
  days: ItineraryDayResult[];
  excludedIds: string[];
  requestId: string;
}

export function planDays(start: string, end: string, destination: TripDestinationRef) {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  if (!isValid(startDate) || !isValid(endDate)) return [];
  const count = differenceInCalendarDays(endDate, startDate) + 1;
  if (count < 1 || count > MAX_PLAN_DAYS) return [];
  return Array.from({ length: count }, (_, index) => ({
    date: format(addDays(startDate, index), 'yyyy-MM-dd'),
    cityId: destination.cityId,
    cityName: destination.cityName,
  }));
}

export function selectedPlanStops(preview: PlanPreview) {
  const excluded = new Set(preview.excludedIds);
  const selectedDays = preview.days.map((day) => ({
    ...day,
    slots: day.slots.filter((slot) => slot.candidate && !excluded.has(slot.candidate.id)),
  }));
  const result = { days: selectedDays } satisfies Pick<ItineraryResult, 'days'>;
  // Map dates back onto the rows in the same order as itineraryToPlaceRows.
  const dates = selectedDays.flatMap((day) => day.slots.map(() => day.date));
  return itineraryToPlaceRows(result, new Map()).map((stop, index) => ({
    ...stop,
    day_date: dates[index],
  }));
}

export function storePlanPreview(preview: PlanPreview): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ preview, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearPlanPreview() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy mode.
  }
}

export function readPlanPreview(): PlanPreview | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { preview, savedAt } = JSON.parse(raw) as { preview: PlanPreview; savedAt: number };
    const { inputs, days, excludedIds, requestId } = preview;
    if (
      !Number.isFinite(savedAt) ||
      Date.now() - savedAt > TRIP_CAPTURE_TTL_MS ||
      typeof requestId !== 'string' ||
      !inputs.destination.cityId ||
      !inputs.destination.countryId ||
      !Number.isInteger(inputs.adults) ||
      inputs.adults < 1 ||
      inputs.adults > MAX_PLAN_ADULTS ||
      !PLAN_PACES.includes(inputs.pace) ||
      (inputs.budget !== null && !PLAN_BUDGETS.includes(inputs.budget)) ||
      (inputs.vibe !== null && !VIBE_IDS.includes(inputs.vibe)) ||
      !Array.isArray(excludedIds) ||
      !Array.isArray(days) ||
      days.length === 0 ||
      days.length !== planDays(inputs.startDate, inputs.endDate, inputs.destination).length ||
      days.some((day) => typeof day.date !== 'string' || !Array.isArray(day.slots))
    ) {
      clearPlanPreview();
      return null;
    }
    return preview;
  } catch {
    clearPlanPreview();
    return null;
  }
}
