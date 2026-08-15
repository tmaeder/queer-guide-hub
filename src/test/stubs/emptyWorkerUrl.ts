/**
 * Stand-in for maplibre's `?worker&url` import under vitest.
 *
 * Vite's test transform denies that specifier, and because the failure happens
 * at COLLECTION the affected suite reports zero tests rather than an error the
 * runner counts — so eight files were contributing nothing while the summary
 * still read green. Nothing in jsdom can start a map worker anyway; the real
 * URL is only meaningful in a browser.
 */
export default '';
