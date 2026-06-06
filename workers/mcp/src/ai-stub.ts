/**
 * Stub for the optional `ai` (Vercel AI SDK) package. The `agents` client
 * bundle does `await import("ai")` for a JSON-schema helper used only by its
 * client-side AI hooks, which this MCP server never touches. Aliasing `ai` to
 * this stub (see wrangler.toml [alias]) keeps the dependency out of the build.
 */
export const jsonSchema = (schema: unknown): unknown => schema;
