/**
 * No-op mock for Wasm modules.
 * All functions throw to trigger the TS fallback path.
 */
export function parse_csv(): never {
  throw new Error('Wasm not available');
}
export function haversine_km(): never {
  throw new Error('Wasm not available');
}
export function batch_nearest(): never {
  throw new Error('Wasm not available');
}
export function point_in_polygon(): never {
  throw new Error('Wasm not available');
}
export function clean_html_entities(): never {
  throw new Error('Wasm not available');
}
export function normalize_record_fields(): never {
  throw new Error('Wasm not available');
}
