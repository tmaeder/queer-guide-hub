import type { Env } from '../types';
import { jsonResponse, errorResponse, corsResponse } from '../cors';

function getCountrySpecificKeywords(countryName: string): string {
  const country = countryName.toLowerCase();
  const map: Record<string, string> = {
    france: 'france eiffel tower paris french countryside provence',
    italy: 'italy rome colosseum venice tuscany italian',
    spain: 'spain madrid barcelona sagrada familia spanish',
    germany: 'germany berlin brandenburg gate bavarian castle',
    'united kingdom': 'uk london big ben british england scotland',
    uk: 'uk london big ben british england scotland',
    netherlands: 'netherlands amsterdam dutch windmills tulips',
    greece: 'greece athens parthenon santorini greek islands',
    switzerland: 'switzerland alps swiss mountains zurich',
    japan: 'japan tokyo kyoto japanese temple mount fuji',
    'united states': 'usa america american landmarks statue liberty',
    usa: 'usa america american landmarks statue liberty',
    australia: 'australia sydney melbourne australian outback opera house',
    brazil: 'brazil rio de janeiro sao paulo brazilian christ redeemer',
    canada: 'canada toronto vancouver canadian maple leaf',
    thailand: 'thailand bangkok thai temple wat pho',
    india: 'india taj mahal delhi mumbai indian temple',
    mexico: 'mexico mexican aztec maya cancun mexico city',
    egypt: 'egypt cairo pyramids giza egyptian sphinx',
    'south africa': 'south africa cape town johannesburg african safari',
    turkey: 'turkey istanbul hagia sophia turkish bosphorus',
    portugal: 'portugal lisbon porto portuguese architecture',
    austria: 'austria vienna salzburg austrian alps',
    'south korea': 'south korea seoul korean temple hanbok',
    iceland: 'iceland reykjavik icelandic geysers northern lights',
    'new zealand': 'new zealand auckland wellington kiwi hobbiton',
    morocco: 'morocco marrakech casablanca moroccan medina',
    croatia: 'croatia dubrovnik split adriatic coast',
    peru: 'peru lima machu picchu peruvian inca',
    argentina: 'argentina buenos aires argentinian tango',
  };

  for (const [key, keywords] of Object.entries(map)) {
    if (country.includes(key)) return keywords;
  }
  return `${countryName} landmarks architecture famous places national symbol`;
}

function getTagSpecificKeywords(tagName: string): string {
  const tag = tagName.toLowerCase();
  if (tag.includes('pride') || tag.includes('flag')) return 'flag parade march celebration';
  if (tag.includes('transgender') || tag.includes('trans')) return 'transgender trans pink blue white';
  if (tag.includes('lesbian')) return 'lesbian orange pink flag women';
  if (tag.includes('gay') || tag.includes('men')) return 'gay men blue green flag';
  if (tag.includes('bisexual') || tag.includes('bi')) return 'bisexual purple pink blue';
  if (tag.includes('queer')) return 'queer community diverse people';
  if (tag.includes('event') || tag.includes('party')) return 'celebration party event colorful';
  if (tag.includes('health') || tag.includes('mental')) return 'health wellness support care';
  if (tag.includes('community') || tag.includes('group')) return 'community group people together';
  return 'inclusive diverse community colorful';
}

export async function handlePexelsImages(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req, env);

  try {
    const { query, type, page = 1 } = await req.json<{
      query?: string;
      type?: string;
      page?: number;
    }>();

    if (!query) return errorResponse('Query parameter is required', 400, req, env);

    if (!env.PEXELS_API_KEY && !env.UNSPLASH_ACCESS_KEY) {
      return errorResponse('No image API keys configured', 500, req, env);
    }

    let searchQuery = query;
    if (type === 'country') searchQuery = getCountrySpecificKeywords(query);
    else if (type === 'city') searchQuery = `${query} city skyline architecture`;
    else if (type === 'tag') {
      const queerKeywords = ['lgbtq', 'pride', 'rainbow', 'diverse', 'inclusive', 'community'];
      searchQuery = `${query} ${queerKeywords.join(' ')} ${getTagSpecificKeywords(query)}`.trim();
    }

    const allImages: any[] = [];
    const perPage = type === 'tag' ? 1 : 3;

    // Fetch from Pexels
    if (env.PEXELS_API_KEY) {
      try {
        const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=${perPage}&page=${page}&orientation=landscape`;
        const pexelsResp = await fetch(pexelsUrl, {
          headers: { Authorization: env.PEXELS_API_KEY },
        });
        if (pexelsResp.ok) {
          const pexelsData = await pexelsResp.json<{ photos?: any[] }>();
          const pexelsImages = (pexelsData.photos || []).map((photo: any) => ({
            id: `pexels-${photo.id}`,
            url: photo.src.large,
            thumbnail: photo.src.medium,
            alt: photo.alt,
            photographer: photo.photographer,
            photographer_url: photo.photographer_url,
            source: 'pexels',
          }));
          allImages.push(...pexelsImages);
        }
      } catch (e) {
        console.error('Pexels fetch error:', e);
      }
    }

    // Fetch from Unsplash
    if (env.UNSPLASH_ACCESS_KEY) {
      try {
        const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=${perPage}&page=${page}&orientation=landscape`;
        const unsplashResp = await fetch(unsplashUrl, {
          headers: { Authorization: `Client-ID ${env.UNSPLASH_ACCESS_KEY}` },
        });
        if (unsplashResp.ok) {
          const unsplashData = await unsplashResp.json<{ results?: any[] }>();
          const unsplashImages = (unsplashData.results || []).map((photo: any) => ({
            id: `unsplash-${photo.id}`,
            url: photo.urls.regular,
            thumbnail: photo.urls.small,
            alt: photo.alt_description || photo.description || query,
            photographer: photo.user.name,
            photographer_url: photo.user.links.html,
            source: 'unsplash',
          }));
          allImages.push(...unsplashImages);
        }
      } catch (e) {
        console.error('Unsplash fetch error:', e);
      }
    }

    return jsonResponse({ success: true, images: allImages, total: allImages.length }, 200, req, env);
  } catch (err) {
    console.error('Image search error:', err);
    return errorResponse('Internal server error', 500, req, env);
  }
}
