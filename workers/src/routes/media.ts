/**
 * Media processing routes — consolidates flyer analysis, image optimization,
 * audio/video processing, and image storage operations.
 *
 * All routes require admin access.
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { chatCompletion } from '../lib/openai';

const media = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// All media routes require auth + admin
media.use('*', requireAuth as any, requireAdmin as any);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Download an image from a URL with timeout and content-type validation. */
async function downloadImage(
  url: string,
  timeoutMs = 30_000,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Expected image content-type, got: ${contentType}`);
    }

    const buffer = await res.arrayBuffer();
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/** Download any file from a URL with timeout. */
async function downloadFile(
  url: string,
  timeoutMs = 60_000,
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const buffer = await res.arrayBuffer();
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve Wikipedia/Wikimedia image URLs to direct file URLs. */
function resolveWikimediaUrl(url: string): string {
  // Handle Special:FilePath or /wiki/File: style URLs
  if (url.includes('wikipedia.org') || url.includes('wikimedia.org')) {
    // Already a direct upload URL
    if (url.includes('/commons/') || url.includes('/upload.wikimedia.org/')) {
      return url;
    }
    // Try to convert wiki/File: to a thumb URL
    const fileMatch = url.match(/\/(?:wiki\/)?(?:File|Image):(.+)/i);
    if (fileMatch) {
      const filename = decodeURIComponent(fileMatch[1]).replace(/ /g, '_');
      return `https://upload.wikimedia.org/wikipedia/commons/thumb/${filename}`;
    }
  }
  return url;
}

// ---------------------------------------------------------------------------
// 1. POST /media/analyze-flyer
// ---------------------------------------------------------------------------
media.post('/analyze-flyer', async (c) => {
  try {
    let imageUrl: string | undefined;

    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      const file = formData.get('image') as File | null;
      if (!file) {
        return c.json({ error: 'No image file provided' }, 400);
      }
      // Store the uploaded file in R2 and create a temporary URL
      const key = `flyer-scans/${crypto.randomUUID()}-${file.name}`;
      await c.env.STORAGE.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      });
      // For OpenAI Vision we need a publicly accessible URL, so we use a
      // data URI approach: encode the image as base64
      const bytes = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
      imageUrl = `data:${file.type};base64,${base64}`;
    } else {
      const body = await c.req.json<{ image_url?: string }>();
      imageUrl = body.image_url;
    }

    if (!imageUrl) {
      return c.json({ error: 'image_url is required' }, 400);
    }

    // Vision API requires direct fetch since chatCompletion only supports string content
    const apiKey = (c.env as any).OPENAI_API_KEY;
    if (!apiKey) {
      return c.json({ error: 'OPENAI_API_KEY not configured' }, 500);
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this event flyer image and extract the following details as JSON:
{
  "event_name": "string",
  "date": "string (ISO 8601 if possible, otherwise the text as shown)",
  "time": "string",
  "venue": "string",
  "description": "string (brief summary of the event)",
  "performers": ["array of performer/artist names"],
  "additional_info": "string (any other relevant details like ticket prices, dress code, etc.)"
}

If a field cannot be determined from the image, use null. Return ONLY valid JSON.`,
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI Vision error:', errText);
      return c.json({ error: `OpenAI API error: ${openaiRes.status}` }, 502);
    }

    const openaiData = (await openaiRes.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const raw = openaiData.choices[0]?.message?.content || '{}';

    // Try to parse the JSON from the response (may be wrapped in markdown code block)
    let eventData: Record<string, unknown>;
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      eventData = JSON.parse(cleaned);
    } catch {
      eventData = { raw_response: raw };
    }

    return c.json({ data: eventData, error: null });
  } catch (err: any) {
    console.error('analyze-flyer error:', err);
    return c.json({ error: err.message || 'Failed to analyze flyer' }, 500);
  }
});

// ---------------------------------------------------------------------------
// 2. POST /media/optimize-images
// ---------------------------------------------------------------------------
media.post('/optimize-images', async (c) => {
  try {
    const {
      table = 'venues',
      batch_size = 50,
      quality = 80,
    } = await c.req.json<{ table?: string; batch_size?: number; quality?: number }>();

    const allowedTables = ['venues', 'events', 'news_articles', 'personalities', 'cities'];
    if (!allowedTables.includes(table)) {
      return c.json({ error: `Table not supported: ${table}. Allowed: ${allowedTables.join(', ')}` }, 400);
    }

    // Fetch records with image URLs that haven't been optimized yet
    const rows = await c.env.DB.prepare(
      `SELECT id, image_url FROM ${table}
       WHERE image_url IS NOT NULL
         AND image_url != ''
         AND (image_optimized IS NULL OR image_optimized = 0)
       LIMIT ?`,
    )
      .bind(batch_size)
      .all<{ id: string; image_url: string }>();

    const results = { processed: 0, optimized: 0, skipped: 0, errors: 0 };

    for (const row of rows.results || []) {
      results.processed++;

      try {
        // If the image is already in R2, skip
        if (row.image_url.startsWith('r2://') || row.image_url.includes('/storage/')) {
          results.skipped++;
          continue;
        }

        // Attempt Cloudflare Image Resizing via cf fetch options
        // This works if the worker is on a zone with Image Resizing enabled
        try {
          const optimizedRes = await fetch(row.image_url, {
            cf: {
              image: {
                quality,
                format: 'webp',
                fit: 'contain',
                width: 1200,
                height: 800,
              },
            },
          } as any);

          if (optimizedRes.ok) {
            const optimizedBuffer = await optimizedRes.arrayBuffer();
            const key = `optimized/${table}/${row.id}.webp`;

            await c.env.STORAGE.put(key, optimizedBuffer, {
              httpMetadata: { contentType: 'image/webp' },
            });

            await c.env.DB.prepare(
              `UPDATE ${table} SET image_url = ?, image_optimized = 1 WHERE id = ?`,
            )
              .bind(key, row.id)
              .run();

            results.optimized++;
            continue;
          }
        } catch {
          // Image Resizing not available, fall through to metadata-only approach
        }

        // Fallback: record optimization status without actual transformation
        await c.env.DB.prepare(
          `UPDATE ${table} SET image_optimized = 1 WHERE id = ?`,
        )
          .bind(row.id)
          .run();

        results.skipped++;
      } catch (err: any) {
        console.error(`optimize-images error for ${row.id}:`, err);
        results.errors++;
      }
    }

    return c.json({ data: results, error: null });
  } catch (err: any) {
    console.error('optimize-images error:', err);
    return c.json({ error: err.message || 'Failed to optimize images' }, 500);
  }
});

// ---------------------------------------------------------------------------
// 3. POST /media/process-audio
// ---------------------------------------------------------------------------
media.post('/process-audio', async (c) => {
  try {
    let audioUrl: string | undefined;
    let personalityId: string | undefined;
    let audioBuffer: ArrayBuffer | undefined;
    let audioContentType = 'audio/mpeg';

    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      const file = formData.get('audio') as File | null;
      personalityId = (formData.get('personality_id') as string) || undefined;

      if (!file) {
        return c.json({ error: 'No audio file provided' }, 400);
      }

      audioBuffer = await file.arrayBuffer();
      audioContentType = file.type || 'audio/mpeg';
      audioUrl = file.name;
    } else {
      const body = await c.req.json<{ audio_url?: string; personality_id?: string }>();
      audioUrl = body.audio_url;
      personalityId = body.personality_id;
    }

    if (!audioUrl && !audioBuffer) {
      return c.json({ error: 'audio_url or audio file is required' }, 400);
    }

    // Download audio if we only have a URL
    if (!audioBuffer && audioUrl) {
      const downloaded = await downloadFile(audioUrl);
      audioBuffer = downloaded.buffer;
      audioContentType = downloaded.contentType;
    }

    // Store in R2
    const id = crypto.randomUUID();
    const ext = audioContentType.includes('wav') ? 'wav' : audioContentType.includes('mp3') || audioContentType.includes('mpeg') ? 'mp3' : 'audio';
    const r2Key = `audio/${id}.${ext}`;

    await c.env.STORAGE.put(r2Key, audioBuffer!, {
      httpMetadata: { contentType: audioContentType },
    });

    // Estimate duration from file size (rough: ~16KB/sec for 128kbps MP3)
    const fileSizeBytes = audioBuffer!.byteLength;
    const estimatedDuration = Math.round(fileSizeBytes / 16000);

    // Attempt OpenAI Whisper transcription
    let transcription: string | null = null;
    const apiKey = (c.env as any).OPENAI_API_KEY;

    if (apiKey) {
      try {
        const formData = new FormData();
        formData.append('file', new Blob([audioBuffer!], { type: audioContentType }), `audio.${ext}`);
        formData.append('model', 'whisper-1');

        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (whisperRes.ok) {
          const whisperData = (await whisperRes.json()) as { text: string };
          transcription = whisperData.text;
        } else {
          console.error('Whisper API error:', await whisperRes.text());
        }
      } catch (err) {
        console.error('Whisper transcription failed:', err);
      }
    }

    // Insert record into D1
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO content_audio (id, source_url, r2_key, duration_seconds, transcription, personality_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, audioUrl || null, r2Key, estimatedDuration, transcription, personalityId || null, now)
      .run();

    return c.json({
      data: {
        id,
        r2_key: r2Key,
        duration_seconds: estimatedDuration,
        transcription,
        personality_id: personalityId || null,
        created_at: now,
      },
      error: null,
    });
  } catch (err: any) {
    console.error('process-audio error:', err);
    return c.json({ error: err.message || 'Failed to process audio' }, 500);
  }
});

// ---------------------------------------------------------------------------
// 4. POST /media/process-video
// ---------------------------------------------------------------------------
media.post('/process-video', async (c) => {
  try {
    let videoUrl: string | undefined;
    let title: string | undefined;
    let description: string | undefined;
    let videoBuffer: ArrayBuffer | undefined;
    let videoContentType = 'video/mp4';

    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      const file = formData.get('video') as File | null;
      title = (formData.get('title') as string) || undefined;
      description = (formData.get('description') as string) || undefined;

      if (!file) {
        return c.json({ error: 'No video file provided' }, 400);
      }

      videoBuffer = await file.arrayBuffer();
      videoContentType = file.type || 'video/mp4';
      videoUrl = file.name;
    } else {
      const body = await c.req.json<{ video_url?: string; title?: string; description?: string }>();
      videoUrl = body.video_url;
      title = body.title;
      description = body.description;
    }

    if (!videoUrl && !videoBuffer) {
      return c.json({ error: 'video_url or video file is required' }, 400);
    }

    // Download video if we only have a URL
    if (!videoBuffer && videoUrl) {
      const downloaded = await downloadFile(videoUrl, 120_000); // 2 min timeout for videos
      videoBuffer = downloaded.buffer;
      videoContentType = downloaded.contentType;
    }

    // Store in R2
    const id = crypto.randomUUID();
    const ext = videoContentType.includes('webm') ? 'webm' : 'mp4';
    const r2Key = `videos/${id}.${ext}`;

    await c.env.STORAGE.put(r2Key, videoBuffer!, {
      httpMetadata: { contentType: videoContentType },
    });

    const fileSize = videoBuffer!.byteLength;

    // Generate a thumbnail URL placeholder — actual thumbnail generation
    // would require a video processing service; we store a convention-based path
    const thumbnailUrl = `videos/thumbnails/${id}.jpg`;

    // Insert record into D1
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO content_videos (id, source_url, r2_key, title, description, thumbnail_url, duration_seconds, file_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, videoUrl || null, r2Key, title || null, description || null, thumbnailUrl, null, fileSize, now)
      .run();

    return c.json({
      data: {
        id,
        r2_key: r2Key,
        title: title || null,
        description: description || null,
        thumbnail_url: thumbnailUrl,
        file_size: fileSize,
        created_at: now,
      },
      error: null,
    });
  } catch (err: any) {
    console.error('process-video error:', err);
    return c.json({ error: err.message || 'Failed to process video' }, 500);
  }
});

// ---------------------------------------------------------------------------
// 5. POST /media/store-tag-images
// ---------------------------------------------------------------------------
media.post('/store-tag-images', async (c) => {
  try {
    const body = await c.req.json<{
      tag_id?: string;
      image_url?: string;
      batch?: Array<{ tag_id: string; image_url: string }>;
    }>();

    const items: Array<{ tag_id: string; image_url: string }> = [];

    if (body.batch && Array.isArray(body.batch)) {
      items.push(...body.batch);
    } else if (body.tag_id && body.image_url) {
      items.push({ tag_id: body.tag_id, image_url: body.image_url });
    } else {
      return c.json({ error: 'Provide {tag_id, image_url} or {batch: [{tag_id, image_url}]}' }, 400);
    }

    const results = { processed: 0, stored: 0, errors: 0 };

    for (const item of items) {
      results.processed++;
      try {
        const { buffer, contentType } = await downloadImage(item.image_url);

        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const r2Key = `tag-images/${item.tag_id}/image.${ext}`;

        await c.env.STORAGE.put(r2Key, buffer, {
          httpMetadata: { contentType },
        });

        // Update the tags table with the R2 path
        await c.env.DB.prepare(
          'UPDATE tags SET image_url = ? WHERE id = ?',
        )
          .bind(r2Key, item.tag_id)
          .run();

        results.stored++;
      } catch (err: any) {
        console.error(`store-tag-images error for tag ${item.tag_id}:`, err);
        results.errors++;
      }
    }

    return c.json({ data: results, error: null });
  } catch (err: any) {
    console.error('store-tag-images error:', err);
    return c.json({ error: err.message || 'Failed to store tag images' }, 500);
  }
});

// ---------------------------------------------------------------------------
// 6. POST /media/reimport-personality-images
// ---------------------------------------------------------------------------
media.post('/reimport-personality-images', async (c) => {
  try {
    const {
      personality_id,
      batch_size = 50,
    } = await c.req.json<{ personality_id?: string; batch_size?: number }>();

    // Fetch personalities with external image URLs (not already in R2)
    let query: string;
    let params: unknown[];

    if (personality_id) {
      query = `SELECT id, image_url FROM personalities
               WHERE id = ?
                 AND image_url IS NOT NULL
                 AND image_url != ''
                 AND image_url NOT LIKE 'personalities/%'
               LIMIT 1`;
      params = [personality_id];
    } else {
      query = `SELECT id, image_url FROM personalities
               WHERE image_url IS NOT NULL
                 AND image_url != ''
                 AND image_url NOT LIKE 'personalities/%'
               LIMIT ?`;
      params = [batch_size];
    }

    const rows = await c.env.DB.prepare(query)
      .bind(...params)
      .all<{ id: string; image_url: string }>();

    const results = { processed: 0, imported: 0, skipped: 0, errors: 0 };

    for (const row of rows.results || []) {
      results.processed++;

      try {
        // Resolve Wikimedia URLs to direct download URLs
        let imageUrl = row.image_url;
        if (imageUrl.includes('wikipedia.org') || imageUrl.includes('wikimedia.org')) {
          imageUrl = resolveWikimediaUrl(imageUrl);
        }

        const { buffer, contentType } = await downloadImage(imageUrl);

        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const r2Key = `personalities/${row.id}/profile.${ext}`;

        await c.env.STORAGE.put(r2Key, buffer, {
          httpMetadata: { contentType },
        });

        // Update the personality record with the R2 path
        await c.env.DB.prepare(
          'UPDATE personalities SET image_url = ? WHERE id = ?',
        )
          .bind(r2Key, row.id)
          .run();

        results.imported++;
      } catch (err: any) {
        console.error(`reimport-personality-images error for ${row.id}:`, err);
        results.errors++;
      }
    }

    return c.json({ data: results, error: null });
  } catch (err: any) {
    console.error('reimport-personality-images error:', err);
    return c.json({ error: err.message || 'Failed to reimport personality images' }, 500);
  }
});

export { media };
