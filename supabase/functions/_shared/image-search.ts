/**
 * Shared image search helpers for fetch-images.
 * Consolidates duplicated Pexels/Unsplash/Wikimedia/Wikipedia fetch logic.
 */

export interface ImageResult {
  url: string
  thumbnail: string
  alt: string
  photographer: string
  photographer_url: string
  source: 'pexels' | 'unsplash' | 'wikimedia' | 'wikipedia'
  source_id: string
  width?: number
  height?: number
  license?: string
  score: number
}

export async function fetchFromPexels(apiKey: string, query: string, perPage = 5): Promise<ImageResult[]> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
      { headers: { Authorization: apiKey } },
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.photos ?? []).map((p: Record<string, unknown>) => ({
      url: (p.src as Record<string, string>).large2x || (p.src as Record<string, string>).large,
      thumbnail: (p.src as Record<string, string>).medium,
      alt: (p.alt as string) || query,
      photographer: p.photographer as string,
      photographer_url: p.photographer_url as string,
      source: 'pexels' as const,
      source_id: String(p.id),
      width: p.width as number,
      height: p.height as number,
      score: 0,
    }))
  } catch { return [] }
}

export async function fetchFromUnsplash(apiKey: string, query: string, perPage = 5): Promise<ImageResult[]> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${apiKey}` } },
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).map((p: Record<string, unknown>) => ({
      url: (p.urls as Record<string, string>).regular,
      thumbnail: (p.urls as Record<string, string>).small,
      alt: (p.alt_description as string) || (p.description as string) || query,
      photographer: (p.user as Record<string, unknown>).name as string,
      photographer_url: ((p.user as Record<string, unknown>).links as Record<string, string>).html,
      source: 'unsplash' as const,
      source_id: p.id as string,
      width: p.width as number,
      height: p.height as number,
      score: 0,
    }))
  } catch { return [] }
}

export async function fetchFromWikimedia(query: string, minWidth = 800, minHeight = 400): Promise<ImageResult[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=1280&format=json&origin=*`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const pages = data.query?.pages
    if (!pages) return []

    const results: ImageResult[] = []
    for (const page of Object.values(pages) as Record<string, unknown>[]) {
      const info = (page.imageinfo as Record<string, unknown>[])?.[0]
      if (!info) continue
      const mime = (info.mime as string) || ''
      if (!mime.startsWith('image/jpeg') && !mime.startsWith('image/png')) continue
      const w = (info.width as number) || 0
      const h = (info.height as number) || 0
      if (w < minWidth || h < minHeight || w < h) continue

      const meta = (info.extmetadata as Record<string, Record<string, string>>) || {}
      const desc = meta.ImageDescription?.value?.replace(/<[^>]*>/g, '') || ''
      const artist = meta.Artist?.value?.replace(/<[^>]*>/g, '') || 'Unknown'
      const license = meta.LicenseShortName?.value || 'CC'

      results.push({
        url: (info.thumburl as string) || (info.url as string),
        thumbnail: (info.thumburl as string) || (info.url as string),
        alt: desc || (page.title as string)?.replace('File:', '') || query,
        photographer: artist,
        photographer_url: (info.descriptionurl as string) || '',
        source: 'wikimedia',
        source_id: String(page.pageid),
        width: w,
        height: h,
        license,
        score: 0,
      })
    }
    return results
  } catch { return [] }
}

const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'

export async function fetchWikipediaImage(name: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`
    const res = await fetch(url, { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } })
    if (!res.ok) return null
    const d = await res.json()
    return d.thumbnail?.source ?? d.originalimage?.source ?? null
  } catch { return null }
}

export async function fetchFirstPexelsUrl(key: string, query: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`,
      { headers: { Authorization: key } },
    )
    if (!r.ok) return null
    const d = await r.json()
    const p = d.photos?.[0]
    return p ? (p.src?.large2x ?? p.src?.large ?? p.src?.medium ?? null) : null
  } catch { return null }
}

export async function fetchFirstUnsplashUrl(key: string, query: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } },
    )
    if (!r.ok) return null
    const d = await r.json()
    return d.results?.[0]?.urls?.regular ?? null
  } catch { return null }
}

export async function storeImageToStorage(
  supabase: unknown,
  imageUrl: string,
  bucket: string,
  pathPrefix: string,
  entityId: string,
): Promise<string> {
  try {
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) return imageUrl
    const buffer = await imageRes.arrayBuffer()
    const ext = imageUrl.includes('.png') ? 'png' : 'jpg'
    const filePath = `${pathPrefix}/${entityId}-${Date.now()}.${ext}`

    const sb = supabase as { storage: { from: (b: string) => { upload: (p: string, b: ArrayBuffer, o: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }
    const { data, error } = await sb.storage.from(bucket).upload(filePath, buffer, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      cacheControl: '86400',
      upsert: true,
    })
    if (error) { console.error('Storage upload error:', error); return imageUrl }
    const { data: pubUrl } = sb.storage.from(bucket).getPublicUrl(data.path)
    return pubUrl.publicUrl
  } catch (e) { console.error('storeImage error:', e); return imageUrl }
}
