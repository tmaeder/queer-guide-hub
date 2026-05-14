/**
 * Legacy barrel – re-exports every public symbol from the api/ directory
 * so that existing imports like `from "../../shared/api"` keep working.
 */
export { submitItem, fetchStatus, bulkSubmit, fetchMySubmissions } from "./api/submit";
export type { BulkResult, SubmissionRow } from "./api/submit";
export { findSimilarItems, findExisting } from "./api/discovery";
export type { SimilarHit, ExistingMatch } from "./api/discovery";
export { renderUrl, scanSitemap } from "./api/render";
export type { SitemapEntry } from "./api/render";
export { listWatched, addWatched, removeWatched } from "./api/watch";
export type { WatchedRow } from "./api/watch";
export { enrichItem } from "./api/enrich";
export type { EnrichResponse } from "./api/enrich";
export { uploadCapture } from "./api/upload";
export { API, SUPABASE_URL, ANON_KEY, authHeaders, pgrstHeaders, jwtSub, ensureOk } from "./api/client";
