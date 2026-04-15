-- Unified venue + event pipeline definitions surfaced at /admin/pipelines (Builder tab).
-- Editable via the React Flow builder; runnable via pipeline-executor; observable live.

INSERT INTO public.pipeline_definitions (name, description, nodes, edges, schedule, is_template, max_concurrency, timeout_seconds)
VALUES (
  'venue-ingestion-unified',
  'Bulletproof venue ingest: all sources → normalize → validate → deduplicate → enrich (parallel) → review gate → commit.',
  $$[
    {"id":"src-spartacus",  "type":"source-spartacus",     "position":{"x":40,"y":40},  "data":{"label":"Spartacus","config":{"entity_type":"venue","batch_size":100}}},
    {"id":"src-foursquare", "type":"source-foursquare",    "position":{"x":40,"y":130}, "data":{"label":"Foursquare","config":{"entity_type":"venue","limit":50}}},
    {"id":"src-google",     "type":"source-google-places", "position":{"x":40,"y":220}, "data":{"label":"Google Places","config":{"entity_type":"venue"}}},
    {"id":"src-tomtom",     "type":"source-tomtom",        "position":{"x":40,"y":310}, "data":{"label":"TomTom","config":{"entity_type":"venue"}}},
    {"id":"src-tripadvisor","type":"source-web-scraper",   "position":{"x":40,"y":400}, "data":{"label":"TripAdvisor","config":{"entity_type":"venue","source":"tripadvisor"}}},
    {"id":"src-gaycities",  "type":"source-gaycities",     "position":{"x":40,"y":490}, "data":{"label":"GayCities","config":{"entity_type":"venue"}}},
    {"id":"src-csv",        "type":"source-csv-upload",    "position":{"x":40,"y":580}, "data":{"label":"CSV Upload","config":{"target_table":"venues"}}},
    {"id":"normalize",      "type":"pipeline-normalize",   "position":{"x":320,"y":310},"data":{"label":"Normalize","config":{"entityType":"venue","batch_size":100}}},
    {"id":"validate",       "type":"pipeline-validate",    "position":{"x":580,"y":310},"data":{"label":"Validate","config":{"entityType":"venue","warn_review_threshold":3}}},
    {"id":"dedupe",         "type":"pipeline-deduplicate", "position":{"x":840,"y":310},"data":{"label":"Deduplicate","config":{"auto_merge_min":0.90,"review_min":0.75,"batch_size":100}}},
    {"id":"fan-out",        "type":"fan-out",              "position":{"x":1080,"y":310},"data":{"label":"Enrich (parallel)"}},
    {"id":"enrich-geo",     "type":"geo-linker",           "position":{"x":1280,"y":160},"data":{"label":"Geo Link","config":{"entity_type":"venue"}}},
    {"id":"enrich-ai",      "type":"ai-enhancer",          "position":{"x":1280,"y":260},"data":{"label":"AI Enrich","config":{"entity_type":"venue"}}},
    {"id":"enrich-tags",    "type":"ai-tagger",            "position":{"x":1280,"y":360},"data":{"label":"Auto-Tag","config":{"entity_type":"venue"}}},
    {"id":"enrich-quality", "type":"quality-scorer",       "position":{"x":1280,"y":460},"data":{"label":"Quality Score","config":{"entity_type":"venue"}}},
    {"id":"fan-in",         "type":"fan-in",               "position":{"x":1500,"y":310},"data":{"label":"Join"}},
    {"id":"review",         "type":"pipeline-review-gate", "position":{"x":1720,"y":310},"data":{"label":"Review Gate","config":{"minConfidence":0.7}}},
    {"id":"commit",         "type":"pipeline-commit",      "position":{"x":1960,"y":310},"data":{"label":"Commit","config":{"targetTable":"venues","strategy":"upsert","conflictKey":"slug"}}}
  ]$$::jsonb,
  $$[
    {"id":"e-spa-n", "source":"src-spartacus",  "target":"normalize"},
    {"id":"e-fsq-n", "source":"src-foursquare", "target":"normalize"},
    {"id":"e-goo-n", "source":"src-google",     "target":"normalize"},
    {"id":"e-tom-n", "source":"src-tomtom",     "target":"normalize"},
    {"id":"e-tri-n", "source":"src-tripadvisor","target":"normalize"},
    {"id":"e-gc-n",  "source":"src-gaycities",  "target":"normalize"},
    {"id":"e-csv-n", "source":"src-csv",        "target":"normalize"},
    {"id":"e-n-v",   "source":"normalize",      "target":"validate"},
    {"id":"e-v-d",   "source":"validate",       "target":"dedupe"},
    {"id":"e-d-fo",  "source":"dedupe",         "target":"fan-out"},
    {"id":"e-fo-geo","source":"fan-out",        "target":"enrich-geo"},
    {"id":"e-fo-ai", "source":"fan-out",        "target":"enrich-ai"},
    {"id":"e-fo-tag","source":"fan-out",        "target":"enrich-tags"},
    {"id":"e-fo-q",  "source":"fan-out",        "target":"enrich-quality"},
    {"id":"e-geo-fi","source":"enrich-geo",     "target":"fan-in"},
    {"id":"e-ai-fi", "source":"enrich-ai",      "target":"fan-in"},
    {"id":"e-tag-fi","source":"enrich-tags",    "target":"fan-in"},
    {"id":"e-q-fi",  "source":"enrich-quality", "target":"fan-in"},
    {"id":"e-fi-r",  "source":"fan-in",         "target":"review"},
    {"id":"e-r-c",   "source":"review",         "target":"commit"}
  ]$$::jsonb,
  '*/5 * * * *', true, 3, 600
)
ON CONFLICT (name) DO UPDATE SET
  description=EXCLUDED.description, nodes=EXCLUDED.nodes, edges=EXCLUDED.edges,
  schedule=EXCLUDED.schedule, max_concurrency=EXCLUDED.max_concurrency,
  timeout_seconds=EXCLUDED.timeout_seconds, updated_at=now();

INSERT INTO public.pipeline_definitions (name, description, nodes, edges, schedule, is_template, max_concurrency, timeout_seconds)
VALUES (
  'event-ingestion-unified',
  'Bulletproof event ingest: sources → normalize → validate → deduplicate → enrich → review gate → commit.',
  $$[
    {"id":"src-eventbrite",  "type":"source-eventbrite",    "position":{"x":40,"y":60},  "data":{"label":"Eventbrite","config":{"entity_type":"event"}}},
    {"id":"src-ticketmaster","type":"source-ticketmaster",  "position":{"x":40,"y":160}, "data":{"label":"Ticketmaster","config":{"entity_type":"event"}}},
    {"id":"src-gaycities-ev","type":"source-gaycities",     "position":{"x":40,"y":260}, "data":{"label":"GayCities Events","config":{"entity_type":"event"}}},
    {"id":"src-web-ev",      "type":"source-web-scraper",   "position":{"x":40,"y":360}, "data":{"label":"Web Scraper","config":{"entity_type":"event"}}},
    {"id":"src-csv-ev",      "type":"source-csv-upload",    "position":{"x":40,"y":460}, "data":{"label":"CSV Upload","config":{"target_table":"events"}}},
    {"id":"normalize",       "type":"pipeline-normalize",   "position":{"x":320,"y":250},"data":{"label":"Normalize","config":{"entityType":"event","batch_size":100}}},
    {"id":"validate",        "type":"pipeline-validate",    "position":{"x":580,"y":250},"data":{"label":"Validate","config":{"entityType":"event","warn_review_threshold":3}}},
    {"id":"dedupe",          "type":"pipeline-deduplicate", "position":{"x":840,"y":250},"data":{"label":"Deduplicate","config":{"auto_merge_min":0.88,"review_min":0.72,"batch_size":100}}},
    {"id":"fan-out",         "type":"fan-out",              "position":{"x":1080,"y":250},"data":{"label":"Enrich"}},
    {"id":"enrich-geo",      "type":"geo-linker",           "position":{"x":1280,"y":150},"data":{"label":"Geo Link","config":{"entity_type":"event"}}},
    {"id":"enrich-ai",       "type":"ai-enhancer",          "position":{"x":1280,"y":250},"data":{"label":"AI Enrich","config":{"entity_type":"event"}}},
    {"id":"enrich-tags",     "type":"ai-tagger",            "position":{"x":1280,"y":350},"data":{"label":"Auto-Tag","config":{"entity_type":"event"}}},
    {"id":"fan-in",          "type":"fan-in",               "position":{"x":1500,"y":250},"data":{"label":"Join"}},
    {"id":"review",          "type":"pipeline-review-gate", "position":{"x":1720,"y":250},"data":{"label":"Review Gate","config":{"minConfidence":0.7}}},
    {"id":"commit",          "type":"pipeline-commit",      "position":{"x":1960,"y":250},"data":{"label":"Commit","config":{"targetTable":"events","strategy":"upsert","conflictKey":"slug"}}}
  ]$$::jsonb,
  $$[
    {"id":"e-eb-n",  "source":"src-eventbrite",  "target":"normalize"},
    {"id":"e-tm-n",  "source":"src-ticketmaster","target":"normalize"},
    {"id":"e-gc-n",  "source":"src-gaycities-ev","target":"normalize"},
    {"id":"e-ws-n",  "source":"src-web-ev",      "target":"normalize"},
    {"id":"e-csv-n", "source":"src-csv-ev",      "target":"normalize"},
    {"id":"e-n-v",   "source":"normalize",       "target":"validate"},
    {"id":"e-v-d",   "source":"validate",        "target":"dedupe"},
    {"id":"e-d-fo",  "source":"dedupe",          "target":"fan-out"},
    {"id":"e-fo-geo","source":"fan-out",         "target":"enrich-geo"},
    {"id":"e-fo-ai", "source":"fan-out",         "target":"enrich-ai"},
    {"id":"e-fo-tag","source":"fan-out",         "target":"enrich-tags"},
    {"id":"e-geo-fi","source":"enrich-geo",      "target":"fan-in"},
    {"id":"e-ai-fi", "source":"enrich-ai",       "target":"fan-in"},
    {"id":"e-tag-fi","source":"enrich-tags",     "target":"fan-in"},
    {"id":"e-fi-r",  "source":"fan-in",          "target":"review"},
    {"id":"e-r-c",   "source":"review",          "target":"commit"}
  ]$$::jsonb,
  '*/10 * * * *', true, 3, 600
)
ON CONFLICT (name) DO UPDATE SET
  description=EXCLUDED.description, nodes=EXCLUDED.nodes, edges=EXCLUDED.edges,
  schedule=EXCLUDED.schedule, updated_at=now();
