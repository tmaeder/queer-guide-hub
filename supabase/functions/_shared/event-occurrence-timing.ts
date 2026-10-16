export type IndexedOccurrence = { open_at: string; close_at: string | null }

/** Project an observed indexed session for display; preserve the canonical span. */
export function withIndexedOccurrence<T extends { start_date: string; end_date: string | null }>(event: T, occurrence: IndexedOccurrence | null) {
  const valid = occurrence && Number.isFinite(Date.parse(occurrence.open_at))
    && (occurrence.close_at === null || (Number.isFinite(Date.parse(occurrence.close_at))
      && Date.parse(occurrence.close_at) >= Date.parse(occurrence.open_at)))
  return {
    ...event,
    source_span: { start_date: event.start_date, end_date: event.end_date },
    indexed_occurrence: valid ? occurrence : null,
    ...(valid ? { start_date: occurrence.open_at, end_date: occurrence.close_at } : {}),
  }
}
