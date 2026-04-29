/**
 * Barrel re-export. Each feature lives in its own file under api/ so
 * additions don't keep growing this surface, and tests can import the
 * one slice they care about. Existing call-sites that did
 * `from "../shared/api"` continue to work unchanged.
 */

export * from "./api/submit";
export * from "./api/discovery";
export * from "./api/enrich";
export * from "./api/watch";
export * from "./api/render";
export * from "./api/upload";
