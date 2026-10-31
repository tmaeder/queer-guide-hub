# Record dimensions when mirroring marketplace images

The maker-completion audit found valid native book covers hidden because their image registry dimensions were unknown. Wren James’s three hidden covers measured 416–417×640 and became visible after measuring the mirrored bytes and refreshing eligibility.

Keep the existing image policy, moderation, access and health checks. Read dimensions from the exact bytes uploaded by the existing mirror. After the listing update creates registry links, populate only healthy public active assets matching those mirrored URLs. Refresh the listing through the existing eligibility function. Unsupported or unmeasurable files remain unqualified. Surface metadata failures and leave the original listing available for a future retry instead of reporting a complete success.

Validate byte-derived metadata with real PNG/GIF fixtures, malformed data and image limits; check the importer with Deno; deploy and verify an existing hidden book through the normal mirror endpoint. No rating, stock or image-size policy changes.
