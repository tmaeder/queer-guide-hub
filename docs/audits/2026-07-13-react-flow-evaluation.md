# React Flow evaluation — 2026-07-13

**Question:** evaluate the use of https://reactflow.dev/ in queer.guide.

**Answer:** React Flow (`@xyflow/react` v12.11.1) was already fully adopted — it is the
entire rendering engine of the `/admin/pipelines` Builder (~11k LOC across 56 files:
custom node types, typed ports, undo/redo, realtime run overlays, template library,
AI-suggest, diff/version history). The evaluation therefore turned into: (a) fix the
pain points in the existing usage, (b) issue verdicts for every other graph-shaped
surface, and (c) build the two surfaces where React Flow is the right tool.

## Verdict table

| Surface | Verdict | Decisive fact |
|---|---|---|
| Pipeline Builder (admin) | Already React Flow — pain points fixed in this pass | hand-rolled layout kept (see below); type-cast friction and DOM-query hacks removed |
| Tag graph (`TagRelationshipGraph.tsx`, public) | **Keep react-force-graph-2d** | 2,183 nodes / 7,948 edges at the default `minScore=0.8` (live DB), ~69k edges at the slider minimum 0.7 — 4×+ past React Flow's practical DOM ceiling (~500 nodes). Canvas is the correct renderer. Improved instead: theme-token colors + a top-N edge cap in the RPC. |
| Entity connections explorer (NEW, public) | **Built with React Flow** — `/explore/connections` | Ego network of ~10–100 nodes is React Flow's sweet spot; rich DOM cards (image/badge/link) are exactly what canvas renderers do badly. Data was already served anon by the search-proxy `/similar` endpoint (`related_entities` RPC). |
| Workflow-run trace (admin) | **Built thin** — "View run on canvas" | The live overlay + RunCompare table already covered most of it; the one gap was `pipeline_runs.pipeline_snapshot` (fetched but never rendered). A read-only dialog reuses the existing node components. |
| Graphify code-graph UI | **Not worth it** | 8,984 nodes / 15,274 edges / 1,362 communities in an 8 MB JSON outside the build (`~/QG/graphify-out/`), stale-by-design per commit. 5–10× past React Flow's limit; the right tool would be a WebGL renderer (sigma.js/cosmograph) as a local standalone page, not an app route. CLI + GRAPH_REPORT.md already serve the dev-only audience. |

## Library assessment (the "should we use React Flow" part)

- **Fit:** excellent for editable node-DAG UIs (the Builder) and small rich-node
  graphs (the explorer). Wrong tool for force-directed or >1k-node graphs — it
  renders every node as a DOM element.
- **Bundle:** ~150 KB gz, isolated in its own `xyflow` vite chunk
  (`vite.config.ts` advancedChunks), stripped from entry modulePreload, and
  CI-guarded (`scripts/check-bundle-shape.mjs`): the string scan keeps xyflow code
  out of the entry `index-*` chunks and the static-import closure walker fails if it
  ever becomes statically reachable from the entry. Policy updated 2026-07-13: xyflow
  is "never in the entry shell" (it now also ships in the lazy public
  `/explore/connections` chunk), no longer "admin-only".
- **Typing:** v12's generic `Node<TData, TType>` unions work well —
  `src/components/admin/pipeline-builder/types.ts` (AppNode/AppEdge/isBaseNode) removed
  ~20 `as unknown as` casts across the builder.
- **Auto-layout:** React Flow ships none; the hand-rolled 162-LOC Sugiyama in
  `utils/autoLayout.ts` was **deliberately kept** over adding dagre (maintenance-mode,
  new chunk) or elkjs (~1.4 MB): it is pure, deterministic, dependency-free, right-sized
  for 5–30-node pipelines, and its density-aware gap inflation + column midline
  centering aren't free in either library. It gained docs, exported constants and a
  real test suite (diamond ordering, overlap, determinism, cycle termination, options).

## What shipped in this pass

1. **Builder typing** — `AppNode = BaseNodeType | CommentNodeType | GroupNodeType`
   union + `AppEdge`; `<ReactFlow<AppNode, AppEdge>>`; `NodeProps<BaseNodeType>` node
   components; typed save/run mutations; `LoadablePipeline`/`StoredPipelineNode` for the
   persisted shape (serialization unchanged — the executor consumes it).
2. **DOM-hack removal** — `TemplateLibrary` and `QuickAddPalette` are controlled
   dialogs. The old `document.querySelector('[aria-haspopup="dialog"]').click()` paths
   actually opened the *wrong* dialog (seven earlier DialogTriggers matched first);
   "Save as template" from multi-select now opens the library in save mode directly.
   ⌘K lives in the builder's central shortcut handler (synthetic KeyboardEvent
   dispatches deleted).
3. **Run-trace snapshot** — `RunSnapshotDialog` (per-run action in RunHistorySidebar):
   read-only canvas of `pipeline_snapshot` + `node_states` overlays, via a new shared
   `storedNodesToCanvas()` helper.
4. **Tag graph** — canvas colors resolved from CSS tokens per theme
   (MutationObserver on the html class; file removed from the eslint color allowlist);
   migration `20260713150000` adds `p_max_edges_per_node` (default 8, top-N per
   endpoint so the graph stays connected) to `get_tag_graph_data`, plus a `category`
   alias the frontend was already reading but never received.
5. **Connections explorer** — lazy public route `/explore/connections?type&id&title`;
   `useEgoNetwork` (fetch + merge + pure-trig radial layout), `EntityNode` cards,
   `EgoGraph` wrapper; "Explore connections" entry link on every `SimilarItems` rail;
   mobile card fallback; i18n `connections.*` keys in all 11 locales.
   Gotcha worth remembering: React Flow sizes itself 100% of its parent — a `flex-1`
   parent under an indefinite (`min-height`-only) container computes to a
   zero-height, non-interactive pane. The page sets a definite height.

## Deferred / follow-ups

- Real translations for the placeholder-filled `connections.*` keys (10 locales).
- Optional: e2e spec for `/explore/connections`.
- Optional: pass `entityTitle` to `SimilarItems` at call sites so the explorer's
  center card is labeled before the graph loads (link already supports it).
