-- Add enrich + quality nodes to venue/events/hotel pipelines
-- Add review-gate to city/country/tags pipelines
-- Add OSM source to venue pipeline

-- ============================================================
-- venue-ingestion-unified
-- Before: sources → normalize → validate → dedupe → review → commit
-- After:  sources+osm → normalize → validate → enrich → dedupe → quality → review → commit
-- ============================================================
UPDATE pipeline_definitions SET
  nodes = '[
    {"id":"src-spartacus","data":{"label":"Spartacus","config":{"batch_size":100,"entity_type":"venue"}},"type":"source-spartacus","position":{"x":40,"y":40}},
    {"id":"src-foursquare","data":{"label":"Foursquare","config":{"limit":50,"entity_type":"venue"}},"type":"source-foursquare","position":{"x":40,"y":130}},
    {"id":"src-google","data":{"label":"Google Places","config":{"entity_type":"venue"}},"type":"source-google-places","position":{"x":40,"y":220}},
    {"id":"src-tomtom","data":{"label":"TomTom","config":{"entity_type":"venue"}},"type":"source-tomtom","position":{"x":40,"y":310}},
    {"id":"src-osm","data":{"label":"OpenStreetMap","config":{"batch_size":500},"icon":"Map","color":"#16a34a","category":"source","inputPorts":[],"description":"LGBTQ+ venues from OpenStreetMap Overpass API — no API key required","outputPorts":[{"id":"out","type":"venue","label":"venues"}],"nodeTypeSlug":"source-osm-venue"},"type":"source-osm-venue","position":{"x":40,"y":400}},
    {"id":"src-gaycities","data":{"label":"GayCities","config":{"entity_type":"venue"}},"type":"source-gaycities","position":{"x":40,"y":490}},
    {"id":"src-csv","data":{"label":"CSV Upload","config":{"target_table":"venues"}},"type":"source-csv-upload","position":{"x":40,"y":580}},
    {"id":"normalize","data":{"label":"Normalize","config":{"batch_size":100,"entityType":"venue"}},"type":"pipeline-normalize","position":{"x":320,"y":310}},
    {"id":"validate","data":{"label":"Validate","config":{"entityType":"venue","warn_review_threshold":3}},"type":"pipeline-validate","position":{"x":580,"y":310}},
    {"id":"enrich","data":{"label":"AI Enrich","icon":"Sparkles","color":"#a855f7","config":{"batch_size":50},"category":"enricher","inputPorts":[{"id":"in","type":"venue","label":"in"}],"description":"AI description, LGBTQ context, tags via OpenAI (circuit-broken)","outputPorts":[{"id":"out","type":"venue","label":"out"}],"nodeTypeSlug":"pipeline-enrich-venue"},"type":"pipeline-enrich-venue","position":{"x":840,"y":310}},
    {"id":"dedupe","data":{"label":"Deduplicate","config":{"batch_size":100,"review_min":0.75,"auto_merge_min":0.90}},"type":"pipeline-deduplicate","position":{"x":1100,"y":310}},
    {"id":"quality","data":{"label":"Quality Score","icon":"Gauge","color":"#f59e0b","config":{"entity_type":"venue","minScore":40},"category":"processor","inputPorts":[{"id":"in","type":"venue","label":"in"}],"description":"0-100 completeness score; low scores route to review","outputPorts":[{"id":"out","type":"venue","label":"out"}],"nodeTypeSlug":"pipeline-quality-score"},"type":"pipeline-quality-score","position":{"x":1360,"y":310}},
    {"id":"review","data":{"label":"Review Gate","config":{"minConfidence":0.7}},"type":"pipeline-review-gate","position":{"x":1620,"y":310}},
    {"id":"commit","data":{"label":"Commit","config":{"strategy":"upsert","conflictKey":"slug","targetTable":"venues"}},"type":"pipeline-commit","position":{"x":1880,"y":310}}
  ]'::jsonb,
  edges = '[
    {"id":"e-spa-n","source":"src-spartacus","target":"normalize"},
    {"id":"e-fsq-n","source":"src-foursquare","target":"normalize"},
    {"id":"e-goo-n","source":"src-google","target":"normalize"},
    {"id":"e-tom-n","source":"src-tomtom","target":"normalize"},
    {"id":"e-osm-n","source":"src-osm","target":"normalize"},
    {"id":"e-gc-n","source":"src-gaycities","target":"normalize"},
    {"id":"e-csv-n","source":"src-csv","target":"normalize"},
    {"id":"e-n-v","source":"normalize","target":"validate"},
    {"id":"e-v-e","source":"validate","target":"enrich"},
    {"id":"e-e-d","source":"enrich","target":"dedupe"},
    {"id":"e-d-q","source":"dedupe","target":"quality"},
    {"id":"e-q-r","source":"quality","target":"review"},
    {"id":"e-r-c","source":"review","target":"commit"}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'venue-ingestion-unified';

-- ============================================================
-- events-ingestion-bulletproof
-- Before: sources → fan-in → normalize → geocode → validate → deduplicate → review-gate → commit
-- After:  sources → fan-in → normalize → geocode → enrich → validate → deduplicate → quality → review-gate → commit
-- ============================================================
UPDATE pipeline_definitions SET
  nodes = '[
    {"id":"src-eventbrite","data":{"icon":"Calendar","color":"#f05537","label":"Eventbrite Events","config":{"target_table":"events"},"category":"source","inputPorts":[],"description":"Imports Eventbrite events via OAuth API","outputPorts":[{"id":"out","type":"event","label":"events"}],"nodeTypeSlug":"source-eventbrite"},"type":"source-eventbrite","position":{"x":40,"y":60}},
    {"id":"src-ticketmaster","data":{"icon":"Ticket","color":"#024ddf","label":"Ticketmaster Events","config":{"target_table":"events"},"category":"source","inputPorts":[],"description":"Imports Ticketmaster events","outputPorts":[{"id":"out","type":"event","label":"events"}],"nodeTypeSlug":"source-ticketmaster"},"type":"source-ticketmaster","position":{"x":40,"y":200}},
    {"id":"fan-in","data":{"icon":"GitMerge","color":"#6b7280","label":"Merge sources","config":{},"category":"control","inputPorts":[{"id":"in","type":"event","label":"in"}],"description":"Fan-in: merge parallel source streams","outputPorts":[{"id":"out","type":"event","label":"events"}],"nodeTypeSlug":"fan-in"},"type":"fan-in","position":{"x":280,"y":130}},
    {"id":"normalize","data":{"icon":"Wand2","color":"#6366f1","label":"Normalize","config":{"batch_size":50,"entityType":"event"},"category":"processor","inputPorts":[{"id":"in","type":"event","label":"staged"}],"description":"Reshape raw payload; compute name_normalized","outputPorts":[{"id":"out","type":"event","label":"normalized"}],"nodeTypeSlug":"pipeline-normalize"},"type":"pipeline-normalize","position":{"x":480,"y":130}},
    {"id":"geocode","data":{"icon":"MapPin","color":"#0ea5e9","label":"Geocode","config":{"batch_size":50,"entityType":"event"},"category":"processor","inputPorts":[{"id":"in","type":"event","label":"normalized"}],"description":"Photon geocoding; populates lat/lng for addresses","outputPorts":[{"id":"out","type":"event","label":"geocoded"}],"nodeTypeSlug":"pipeline-geocode"},"type":"pipeline-geocode","position":{"x":680,"y":130}},
    {"id":"enrich","data":{"icon":"Sparkles","color":"#a855f7","label":"AI Enrich","config":{"batch_size":50},"category":"enricher","inputPorts":[{"id":"in","type":"event","label":"geocoded"}],"description":"AI event type, tags, LGBTQ relevance score (circuit-broken)","outputPorts":[{"id":"out","type":"event","label":"enriched"}],"nodeTypeSlug":"pipeline-enrich-events"},"type":"pipeline-enrich-events","position":{"x":880,"y":130}},
    {"id":"validate","data":{"icon":"ShieldCheck","color":"#10b981","label":"Validate","config":{"batch_size":50,"entityType":"event","warn_review_threshold":3},"category":"validator","inputPorts":[{"id":"in","type":"event","label":"enriched"}],"description":"Enforce title/date/location rules, pride window, date ordering","outputPorts":[{"id":"out","type":"event","label":"approved"}],"nodeTypeSlug":"pipeline-validate"},"type":"pipeline-validate","position":{"x":1080,"y":130}},
    {"id":"deduplicate","data":{"icon":"Copy","color":"#f59e0b","label":"Deduplicate","config":{"batch_size":50,"review_min":0.75,"auto_merge_min":0.90},"category":"processor","inputPorts":[{"id":"in","type":"event","label":"approved"}],"description":"title+date+venue/city/geo dedup; auto-merge ≥0.90","outputPorts":[{"id":"out","type":"event","label":"dedup"}],"nodeTypeSlug":"pipeline-deduplicate"},"type":"pipeline-deduplicate","position":{"x":1280,"y":130}},
    {"id":"quality","data":{"icon":"Gauge","color":"#f59e0b","label":"Quality Score","config":{"entity_type":"event","minScore":40},"category":"processor","inputPorts":[{"id":"in","type":"event","label":"dedup"}],"description":"0-100 completeness score; low scores route to review","outputPorts":[{"id":"out","type":"event","label":"scored"}],"nodeTypeSlug":"pipeline-quality-score"},"type":"pipeline-quality-score","position":{"x":1480,"y":130}},
    {"id":"review-gate","data":{"icon":"ClipboardCheck","color":"#b60d3d","label":"Review Gate","config":{},"category":"control","inputPorts":[{"id":"in","type":"event","label":"scored"}],"description":"Human review for merge candidates; auto items pass through","outputPorts":[{"id":"out","type":"event","label":"cleared"}],"nodeTypeSlug":"pipeline-review-gate"},"type":"pipeline-review-gate","position":{"x":1680,"y":130}},
    {"id":"commit","data":{"icon":"Database","color":"#15803d","label":"Commit to events","config":{"batch_size":50,"targetTable":"events"},"category":"output","inputPorts":[{"id":"in","type":"event","label":"cleared"}],"description":"commit_event_staging_batch: advisory-locked upsert into events","outputPorts":[],"nodeTypeSlug":"pipeline-commit"},"type":"pipeline-commit","position":{"x":1880,"y":130}}
  ]'::jsonb,
  edges = '[
    {"id":"e1","source":"src-eventbrite","target":"fan-in","animated":true},
    {"id":"e2","source":"src-ticketmaster","target":"fan-in","animated":true},
    {"id":"e3","source":"fan-in","target":"normalize","animated":true},
    {"id":"e4a","source":"normalize","target":"geocode","animated":true},
    {"id":"e4b","source":"geocode","target":"enrich","animated":true},
    {"id":"e4c","source":"enrich","target":"validate","animated":true},
    {"id":"e5","source":"validate","target":"deduplicate","animated":true},
    {"id":"e6","source":"deduplicate","target":"quality","animated":true},
    {"id":"e7","source":"quality","target":"review-gate","animated":true},
    {"id":"e8","source":"review-gate","target":"commit","animated":true}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'events-ingestion-bulletproof';

-- ============================================================
-- hotel-ingestion-pipeline
-- Before: 6 sources → normalize → validate → dedup → review → commit
-- After:  6 sources → normalize → validate → enrich → dedup → quality → review → commit
-- ============================================================
UPDATE pipeline_definitions SET
  nodes = '[
    {"id":"src-google","data":{"icon":"Map","color":"#22c55e","label":"Google Places (hotels)","config":{"mode":"hotels","limit":30},"category":"source","inputPorts":[],"description":"Import venues from Google Places API","outputPorts":[{"id":"items","type":"venue","label":"Venues"}],"nodeTypeSlug":"source-google-places"},"type":"source-google-places","position":{"x":50,"y":50}},
    {"id":"src-fsq","data":{"icon":"MapPin","color":"#22c55e","label":"Foursquare (hotels)","config":{"mode":"hotels","limit":30},"category":"source","inputPorts":[],"description":"Import LGBTQ+ venues from Foursquare Places API","outputPorts":[{"id":"items","type":"venue","label":"Venues"}],"nodeTypeSlug":"source-foursquare"},"type":"source-foursquare","position":{"x":50,"y":150}},
    {"id":"src-sparta","data":{"icon":"BookOpen","color":"#22c55e","label":"Spartacus Guide","config":{},"category":"source","inputPorts":[],"description":"Scrape LGBTQ+ travel data from Spartacus","outputPorts":[{"id":"items","type":"venue","label":"Listings"}],"nodeTypeSlug":"source-spartacus"},"type":"source-spartacus","position":{"x":50,"y":250}},
    {"id":"src-mister","data":{"icon":"Hotel","color":"#ff385c","label":"MisterB&B (sitemap)","config":{"limit":200},"category":"source","inputPorts":[],"description":"Sitemap discovery; detail enrichment requires Playwright","outputPorts":[{"id":"items","type":"venue","label":"Stays"}],"nodeTypeSlug":"source-misterbnb"},"type":"source-misterbnb","position":{"x":50,"y":350}},
    {"id":"src-air","data":{"icon":"Home","color":"#ff5a5f","label":"Airbnb (sitemap)","config":{"limit":200},"category":"source","inputPorts":[],"description":"Discover Airbnb listings from sub-sitemaps","outputPorts":[{"id":"items","type":"venue","label":"Listings"}],"nodeTypeSlug":"source-airbnb"},"type":"source-airbnb","position":{"x":50,"y":450}},
    {"id":"src-book","data":{"icon":"Bed","color":"#003580","label":"Booking.com","config":{"limit":200},"category":"source","inputPorts":[],"description":"Demand API (when BOOKING_DEMAND_API_KEY set) or graceful skip","outputPorts":[{"id":"items","type":"venue","label":"Hotels"}],"nodeTypeSlug":"source-booking"},"type":"source-booking","position":{"x":50,"y":550}},
    {"id":"normalize","data":{"icon":"wand-2","color":"#6366f1","label":"Normalize","config":{"batch_size":100,"entityType":"venue"},"category":"processor","inputPorts":[],"description":"Map raw → normalized_data","outputPorts":[],"nodeTypeSlug":"pipeline-normalize"},"type":"pipeline-normalize","position":{"x":300,"y":300}},
    {"id":"validate","data":{"icon":"shield-check","color":"#10b981","label":"Validate","config":{"batch_size":100,"entityType":"venue"},"category":"validator","inputPorts":[],"description":"Quality + rule-based validation","outputPorts":[],"nodeTypeSlug":"pipeline-validate"},"type":"pipeline-validate","position":{"x":500,"y":300}},
    {"id":"enrich","data":{"icon":"sparkles","color":"#a855f7","label":"AI Enrich","config":{"batch_size":50},"category":"enricher","inputPorts":[{"id":"in","type":"venue","label":"in"}],"description":"AI description, LGBTQ context, tags (circuit-broken)","outputPorts":[{"id":"out","type":"venue","label":"out"}],"nodeTypeSlug":"pipeline-enrich-venue"},"type":"pipeline-enrich-venue","position":{"x":700,"y":300}},
    {"id":"dedup","data":{"icon":"copy","color":"#0ea5e9","label":"Dedup","config":{"batch_size":100,"review_min":0.75,"auto_merge_min":0.90},"category":"processor","inputPorts":[],"description":"Multi-signal dedup; platform IDs, URL, address","outputPorts":[],"nodeTypeSlug":"pipeline-deduplicate"},"type":"pipeline-deduplicate","position":{"x":900,"y":300}},
    {"id":"quality","data":{"icon":"gauge","color":"#f59e0b","label":"Quality Score","config":{"entity_type":"venue","minScore":40},"category":"processor","inputPorts":[{"id":"in","type":"venue","label":"in"}],"description":"0-100 completeness score; low scores route to review","outputPorts":[{"id":"out","type":"venue","label":"out"}],"nodeTypeSlug":"pipeline-quality-score"},"type":"pipeline-quality-score","position":{"x":1100,"y":300}},
    {"id":"review","data":{"icon":"shield-alert","color":"#ef4444","label":"Review Gate","config":{"minConfidence":0.85},"category":"control","inputPorts":[],"description":"Gate items needing human review","outputPorts":[],"nodeTypeSlug":"pipeline-review-gate"},"type":"pipeline-review-gate","position":{"x":1300,"y":300}},
    {"id":"commit","data":{"icon":"database","color":"#8b5cf6","label":"Commit","config":{"batch_size":200,"targetTable":"venues"},"category":"output","inputPorts":[],"description":"Atomic upsert via per-entity RPC","outputPorts":[],"nodeTypeSlug":"pipeline-commit"},"type":"pipeline-commit","position":{"x":1500,"y":300}}
  ]'::jsonb,
  edges = '[
    {"id":"e-sg-n","source":"src-google","target":"normalize"},
    {"id":"e-sf-n","source":"src-fsq","target":"normalize"},
    {"id":"e-ss-n","source":"src-sparta","target":"normalize"},
    {"id":"e-sm-n","source":"src-mister","target":"normalize"},
    {"id":"e-sa-n","source":"src-air","target":"normalize"},
    {"id":"e-sb-n","source":"src-book","target":"normalize"},
    {"id":"e-n-v","source":"normalize","target":"validate"},
    {"id":"e-v-e","source":"validate","target":"enrich"},
    {"id":"e-e-d","source":"enrich","target":"dedup"},
    {"id":"e-d-q","source":"dedup","target":"quality"},
    {"id":"e-q-r","source":"quality","target":"review"},
    {"id":"e-r-c","source":"review","target":"commit"}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'hotel-ingestion-pipeline';

-- ============================================================
-- city-ingestion
-- Before: src-csv, src-geonames → normalize → validate → dedupe → commit
-- After:  same + review between dedupe and commit
-- ============================================================
UPDATE pipeline_definitions SET
  nodes = '[
    {"id":"src-csv","data":{"label":"CSV Upload","config":{"batch_size":500,"target_table":"cities"}},"type":"source-csv-upload","position":{"x":60,"y":50}},
    {"id":"src-geonames","data":{"label":"GeoNames","config":{"limit":1000,"dataset":"cities15000","batch_size":500,"target_table":"cities","min_population":50000}},"type":"source-geonames","position":{"x":60,"y":190}},
    {"id":"normalize","data":{"label":"Normalize","config":{"batch_size":500,"entityType":"city"}},"type":"pipeline-normalize","position":{"x":300,"y":190}},
    {"id":"validate","data":{"label":"Validate","config":{"entityType":"city"}},"type":"pipeline-validate","position":{"x":540,"y":190}},
    {"id":"dedupe","data":{"label":"Deduplicate","config":{"batch_size":500,"review_min":0.80,"auto_merge_min":0.92}},"type":"pipeline-deduplicate","position":{"x":780,"y":190}},
    {"id":"review","data":{"label":"Review Gate","icon":"ClipboardCheck","color":"#b60d3d","config":{"auto_approve_above":0.9},"category":"control","description":"Auto-approve high-confidence; flag ambiguous for human review","nodeTypeSlug":"pipeline-review-gate"},"type":"pipeline-review-gate","position":{"x":1020,"y":190}},
    {"id":"commit","data":{"label":"Commit","config":{"strategy":"upsert","targetTable":"cities"}},"type":"pipeline-commit","position":{"x":1260,"y":190}}
  ]'::jsonb,
  edges = '[
    {"id":"e1","source":"src-csv","target":"normalize"},
    {"id":"e2","source":"src-geonames","target":"normalize"},
    {"id":"e3","source":"normalize","target":"validate"},
    {"id":"e4","source":"validate","target":"dedupe"},
    {"id":"e5","source":"dedupe","target":"review"},
    {"id":"e6","source":"review","target":"commit"}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'city-ingestion';

-- ============================================================
-- country-ingestion
-- Before: src-rc → normalize → validate → dedupe → commit
-- After:  same + review between dedupe and commit
-- ============================================================
UPDATE pipeline_definitions SET
  nodes = '[
    {"id":"src-rc","data":{"label":"REST Countries","config":{"batch_size":250,"entity_type":"country"}},"type":"source-rest-countries","position":{"x":40,"y":40}},
    {"id":"normalize","data":{"label":"Normalize","config":{"batch_size":250,"entityType":"country"}},"type":"pipeline-normalize","position":{"x":320,"y":40}},
    {"id":"validate","data":{"label":"Validate","config":{"entityType":"country"}},"type":"pipeline-validate","position":{"x":580,"y":40}},
    {"id":"dedupe","data":{"label":"Deduplicate","config":{"batch_size":250,"review_min":0.85,"auto_merge_min":0.95}},"type":"pipeline-deduplicate","position":{"x":840,"y":40}},
    {"id":"review","data":{"label":"Review Gate","icon":"ClipboardCheck","color":"#b60d3d","config":{"auto_approve_above":0.9},"category":"control","description":"Auto-approve high-confidence countries; flag conflicts","nodeTypeSlug":"pipeline-review-gate"},"type":"pipeline-review-gate","position":{"x":1100,"y":40}},
    {"id":"commit","data":{"label":"Commit","config":{"strategy":"upsert","conflictKey":"code","targetTable":"countries"}},"type":"pipeline-commit","position":{"x":1360,"y":40}}
  ]'::jsonb,
  edges = '[
    {"id":"e1","source":"src-rc","target":"normalize"},
    {"id":"e2","source":"normalize","target":"validate"},
    {"id":"e3","source":"validate","target":"dedupe"},
    {"id":"e4","source":"dedupe","target":"review"},
    {"id":"e5","source":"review","target":"commit"}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'country-ingestion';

-- ============================================================
-- tags-ingestion
-- Before: src-extract, src-csv → normalize → validate → dedupe → commit
-- After:  same + review between dedupe and commit
-- ============================================================
UPDATE pipeline_definitions SET
  nodes = '[
    {"id":"src-extract","data":{"label":"Extract Tags","config":{"batch_size":500,"entity_type":"tag"}},"type":"source-tags-extract","position":{"x":40,"y":40}},
    {"id":"src-csv","data":{"label":"CSV Upload","config":{"batch_size":500,"entity_type":"tag"}},"type":"source-csv-upload","position":{"x":40,"y":160}},
    {"id":"normalize","data":{"label":"Normalize","config":{"batch_size":500,"entityType":"tag"}},"type":"pipeline-normalize","position":{"x":320,"y":100}},
    {"id":"validate","data":{"label":"Validate","config":{"entityType":"tag"}},"type":"pipeline-validate","position":{"x":580,"y":100}},
    {"id":"dedupe","data":{"label":"Deduplicate","config":{"batch_size":500,"review_min":0.85,"auto_merge_min":0.95}},"type":"pipeline-deduplicate","position":{"x":840,"y":100}},
    {"id":"review","data":{"label":"Review Gate","icon":"ClipboardCheck","color":"#b60d3d","config":{"auto_approve_above":0.9},"category":"control","description":"Auto-approve high-confidence tags; flag new ones for review","nodeTypeSlug":"pipeline-review-gate"},"type":"pipeline-review-gate","position":{"x":1100,"y":100}},
    {"id":"commit","data":{"label":"Commit","config":{"strategy":"upsert","conflictKey":"slug","targetTable":"unified_tags"}},"type":"pipeline-commit","position":{"x":1360,"y":100}}
  ]'::jsonb,
  edges = '[
    {"id":"e1","source":"src-extract","target":"normalize"},
    {"id":"e2","source":"src-csv","target":"normalize"},
    {"id":"e3","source":"normalize","target":"validate"},
    {"id":"e4","source":"validate","target":"dedupe"},
    {"id":"e5","source":"dedupe","target":"review"},
    {"id":"e6","source":"review","target":"commit"}
  ]'::jsonb,
  updated_at = now()
WHERE name = 'tags-ingestion';
