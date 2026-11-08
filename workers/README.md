# Cloudflare Workers

Each service has its own Wrangler configuration with its entry point, bindings, and routes. Use that configuration when developing or deploying from the service directory.

- [Search proxy](search-proxy/README.md) serves hybrid search from PostgreSQL.
- [Assistant](assistant/README.md) runs the conversational concierge.
- [Extraction](extract/README.md) turns supported web pages into Markdown.
- [Submissions](submit/README.md) stages browser extension submissions for ingestion.
- [Snapshot archiver](snapshot-archiver/README.md) stores administrative and editorial snapshots.

Keep local secrets in `.dev.vars` and deployed secrets in Wrangler secrets. See the [operations runbook](../docs/operations.md) for service health checks.
