# Video processing — Cloudflare Container architecture

Spec for the off-Worker ffmpeg pipeline used when the Worker
size limit (10 MB compressed) makes ffmpeg-wasm unviable. Today
the `pipeline-media-process` edge function handles still images
inline; full video keyframe + audio extraction is gated behind
`ENABLE_VIDEO_TRANSCRIPTS` and runs through this container path.

## Goals

- Extract 5 keyframes (1 thumbnail + 4 evenly spaced) from any
  video stored in R2.
- Strip the audio track to a 16 kHz mono OGG/Opus blob suitable
  for Whisper.
- Be horizontally scalable; one job ≈ one ephemeral container.
- Cost-bounded: hard cap 60 s wall-clock per job, 100 jobs/day.

## Topology

```
pipeline-media-process (edge fn)
  └─ enqueue { r2_key, submission_id } → CF Queue `media-jobs`
         └─ CF Container `ffmpeg-runner` (consumer)
              ├─ download R2 object → /tmp
              ├─ ffmpeg -ss N -frames:v 1 (×5)  → frames in R2
              ├─ ffmpeg -vn -ac 1 -ar 16000 -c:a libopus → audio in R2
              ├─ POST /pipeline-media-callback
              └─ ack queue message
```

The callback edge function (`pipeline-media-callback`) populates
`community_submissions.media_processing_status` to `done`/`partial`
and links keyframe + audio R2 keys.

## Container image

- Base: `linuxserver/ffmpeg:7.1` (already includes libopus + libx264)
- Entrypoint: small Deno script that pulls one queue message,
  processes, writes results, exits.
- Bindings: `R2_MEDIA` (rw), `MEDIA_QUEUE` (consume),
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Resource limits

| Knob              | Value     | Reason                             |
|-------------------|-----------|------------------------------------|
| CPU               | 1 vCPU    | ffmpeg single-threaded keyframe ok |
| Memory            | 1 GB      | ffmpeg + 4K source comfortable     |
| Wall-clock        | 60 s      | drop and mark `partial` past this  |
| Concurrency       | 4 instances | one queue lease per instance     |
| Daily cap         | 100 jobs  | matches expected social volume     |

## Failure modes

| Failure                       | Action                                            |
|-------------------------------|---------------------------------------------------|
| R2 download timeout           | retry 1×, then dead-letter; status='failed'       |
| ffmpeg non-zero exit          | log stderr in `media_processing_errors`; `failed` |
| Wall-clock exceeded           | kill, partial keyframes saved, status='partial'   |
| Whisper unavailable           | keyframes only, transcript skipped, status='partial'; submission still progresses |
| Callback POST fails           | requeue once via DLQ; idempotent on submission id |

## Cost model

- Container minute: ~$0.0003 ⇒ ≤ 60 s × 100 jobs/day ≈ $0.054/day
  on CF pricing as of 2026-04 (still in beta).
- R2 storage: keyframes ~50 KB × 5, audio ~200 KB ⇒ ≈ 450 KB per
  job ⇒ negligible against the existing `marketplace-images`
  bucket.

## Why not a Worker?

- **Size**: ffmpeg-wasm with codecs is ~30 MB; the Worker bundle
  ceiling is 10 MB compressed. Stripping codecs leaves a Worker
  that can't actually decode social-media video.
- **CPU time**: a single video keyframe extraction can spike past
  the Worker 50 ms CPU cap; containers have wall-clock not CPU
  caps.
- **State**: Workers can't write `/tmp`; ffmpeg's pipe-to-pipe mode
  works but loses precise seek for keyframes.

## Migration order

1. Ship queue + callback edge function (no consumer yet) — feature
   flagged off.
2. Build container image, push to CF Registry.
3. Deploy container; flip `ENABLE_VIDEO_TRANSCRIPTS=true` in
   `pipeline-media-process` env.
4. Monitor `media_processing_errors` for a week; if clean, remove
   the feature flag and make video pipeline default.

## Open questions

- Do we need GPU-accelerated Whisper (e.g. CF AI
  `@cf/openai/whisper-large-v3-turbo`) or is the CPU build fast
  enough at 60 s budget? Bench during step 3.
- Should we mirror the original video to R2, or only the derived
  artefacts? Deciding factor: legal review on retaining
  `do_not_publish` originals.
