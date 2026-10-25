# Prefer published gay.ch event originals

The artwork auditor keeps finding undersized gay.ch images. A sampled registered event page publishes a 768×480 image in its bare schema.org Event object, but its page-specific original download is 1920×1200. The importer selected the thumbnail; the gap worker also overlooked the bare JSON script because it only read typed JSON-LD.

Use one shared selector in the importer and the artwork worker. Require an unambiguous schema.org Event with the expected name and valid occurrence date, on an HTTPS gay.ch party detail page. Prefer a single explicitly published original in the head metadata only when its download path belongs to that exact event page. Keep the event's own structured image as a fallback. Generic social images, another event's media, executable scripts and ambiguous metadata are excluded. The existing cover probes, source registry, ownership protections, leases and native writer remain unchanged.

This corrects source selection without changing quality thresholds or synthesizing larger artwork. Existing affected records should use the normal guarded artwork worker after deployment. Production schema and unrelated merge settings are unchanged.

Validation: 16 targeted Deno tests pass, including ownership, occurrence, ambiguous metadata and existing artwork guards. Both changed edge entry points typecheck, targeted ESLint passes, and the actual sampled publisher HTML selects the separately probed 1920×1200 original. The source adapter's optional venue name also uses the declared optional-string type. Production replay follows release; no review findings are closed directly by this change.
