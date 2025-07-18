import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, type, page = 1 } = await req.json();
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pexelsApiKey = Deno.env.get('PEXELS_API_KEY');
    const unsplashApiKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
    
    if (!pexelsApiKey && !unsplashApiKey) {
      console.error('Neither PEXELS_API_KEY nor UNSPLASH_ACCESS_KEY found');
      return new Response(
        JSON.stringify({ error: 'No image API keys configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching images for:', { query, type });

    // Create search query based on type
    let searchQuery = query;
    if (type === 'country') {
      searchQuery = getCountrySpecificKeywords(query);
    } else if (type === 'city') {
      searchQuery = `${query} city skyline architecture`;
    } else if (type === 'tag') {
      // For tags, create queer-themed searches with relevant keywords
      const queerKeywords = ['lgbtq', 'pride', 'rainbow', 'diverse', 'inclusive', 'community', 'celebration', 'colorful', 'flags', 'people'];
      const additionalKeywords = getTagSpecificKeywords(query);
      searchQuery = `${query} ${queerKeywords.join(' ')} ${additionalKeywords}`.trim();
    }

    const allImages: any[] = [];
    const perPage = type === 'tag' ? 1 : 3; // Fetch fewer from each source

    // Fetch from Pexels if API key is available
    if (pexelsApiKey) {
      try {
        console.log('Fetching from Pexels...');
        const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=${perPage}&page=${page}&orientation=landscape`;
        
        const pexelsResponse = await fetch(pexelsUrl, {
          headers: {
            'Authorization': pexelsApiKey,
          },
        });

        if (pexelsResponse.ok) {
          const pexelsData = await pexelsResponse.json();
          const pexelsImages = pexelsData.photos?.map((photo: any) => ({
            id: `pexels-${photo.id}`,
            url: photo.src.large,
            thumbnail: photo.src.medium,
            alt: photo.alt,
            photographer: photo.photographer,
            photographer_url: photo.photographer_url,
            source: 'pexels'
          })) || [];
          allImages.push(...pexelsImages);
          console.log('Pexels images fetched successfully:', pexelsImages.length, 'images');
        } else {
          console.error('Pexels API error:', pexelsResponse.status, pexelsResponse.statusText);
        }
      } catch (error) {
        console.error('Pexels fetch error:', error);
      }
    }

    // Fetch from Unsplash if API key is available
    if (unsplashApiKey) {
      try {
        console.log('Fetching from Unsplash...');
        const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=${perPage}&page=${page}&orientation=landscape`;
        
        const unsplashResponse = await fetch(unsplashUrl, {
          headers: {
            'Authorization': `Client-ID ${unsplashApiKey}`,
          },
        });

        if (unsplashResponse.ok) {
          const unsplashData = await unsplashResponse.json();
          const unsplashImages = unsplashData.results?.map((photo: any) => ({
            id: `unsplash-${photo.id}`,
            url: photo.urls.regular,
            thumbnail: photo.urls.small,
            alt: photo.alt_description || photo.description || query,
            photographer: photo.user.name,
            photographer_url: photo.user.links.html,
            source: 'unsplash'
          })) || [];
          allImages.push(...unsplashImages);
          console.log('Unsplash images fetched successfully:', unsplashImages.length, 'images');
        } else {
          console.error('Unsplash API error:', unsplashResponse.status, unsplashResponse.statusText);
        }
      } catch (error) {
        console.error('Unsplash fetch error:', error);
      }
    }

    console.log('Total images fetched:', allImages.length);

    return new Response(
      JSON.stringify({
        success: true,
        images: allImages,
        total: allImages.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-pexels-images function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to get country-specific keywords for better image search
function getCountrySpecificKeywords(countryName: string): string {
  const country = countryName.toLowerCase();
  
  // Map countries to their most recognizable landmarks, cities, and features
  const countryKeywords: { [key: string]: string } = {
    // Europe
    'france': 'france eiffel tower paris french countryside provence',
    'italy': 'italy rome colosseum venice tuscany italian',
    'spain': 'spain madrid barcelona sagrada familia spanish',
    'germany': 'germany berlin brandenburg gate bavarian castle',
    'united kingdom': 'uk london big ben british england scotland',
    'uk': 'uk london big ben british england scotland',
    'england': 'england london big ben british countryside',
    'scotland': 'scotland edinburgh highlands castle scottish',
    'netherlands': 'netherlands amsterdam dutch windmills tulips',
    'sweden': 'sweden stockholm scandinavian nordic architecture',
    'norway': 'norway oslo fjords nordic scandinavian mountains',
    'denmark': 'denmark copenhagen scandinavian nordic',
    'greece': 'greece athens parthenon santorini greek islands',
    'portugal': 'portugal lisbon porto portuguese architecture',
    'switzerland': 'switzerland alps swiss mountains zurich',
    'austria': 'austria vienna salzburg austrian alps',
    'poland': 'poland warsaw krakow polish architecture',
    'czech republic': 'czech republic prague bohemian castle',
    'hungary': 'hungary budapest hungarian parliament danube',
    'croatia': 'croatia dubrovnik split adriatic coast',
    'ireland': 'ireland dublin green countryside irish cliffs',
    'belgium': 'belgium brussels bruges belgian architecture',
    'finland': 'finland helsinki finnish nordic lake',
    'iceland': 'iceland reykjavik icelandic geysers northern lights',
    
    // North America
    'united states': 'usa america american landmarks statue liberty',
    'usa': 'usa america american landmarks statue liberty',
    'canada': 'canada toronto vancouver canadian maple leaf',
    'mexico': 'mexico mexican aztec maya cancun mexico city',
    
    // Asia
    'japan': 'japan tokyo kyoto japanese temple mount fuji',
    'china': 'china beijing great wall chinese forbidden city',
    'india': 'india taj mahal delhi mumbai indian temple',
    'south korea': 'south korea seoul korean temple hanbok',
    'thailand': 'thailand bangkok thai temple wat pho',
    'indonesia': 'indonesia jakarta bali indonesian temple',
    'vietnam': 'vietnam hanoi ho chi minh vietnamese',
    'philippines': 'philippines manila filipino tropical islands',
    'singapore': 'singapore marina bay singaporean skyline',
    'malaysia': 'malaysia kuala lumpur malaysian petronas towers',
    'turkey': 'turkey istanbul hagia sophia turkish bosphorus',
    'israel': 'israel jerusalem israeli western wall',
    'iran': 'iran tehran persian iranian mosque',
    'iraq': 'iraq baghdad iraqi mesopotamian',
    'saudi arabia': 'saudi arabia riyadh mecca saudi arabian',
    'united arab emirates': 'uae dubai abu dhabi burj khalifa',
    'uae': 'uae dubai abu dhabi burj khalifa',
    
    // Africa
    'egypt': 'egypt cairo pyramids giza egyptian sphinx',
    'south africa': 'south africa cape town johannesburg african safari',
    'morocco': 'morocco marrakech casablanca moroccan medina',
    'kenya': 'kenya nairobi kenyan safari masai mara',
    'tanzania': 'tanzania dar es salaam kilimanjaro tanzanian safari',
    'nigeria': 'nigeria lagos abuja nigerian african',
    'ghana': 'ghana accra ghanaian african gold coast',
    'ethiopia': 'ethiopia addis ababa ethiopian african',
    
    // South America
    'brazil': 'brazil rio de janeiro sao paulo brazilian christ redeemer',
    'argentina': 'argentina buenos aires argentinian tango',
    'chile': 'chile santiago chilean andes mountains',
    'peru': 'peru lima machu picchu peruvian inca',
    'colombia': 'colombia bogota cartagena colombian',
    'venezuela': 'venezuela caracas venezuelan angel falls',
    'ecuador': 'ecuador quito galapagos ecuadorian',
    'uruguay': 'uruguay montevideo uruguayan',
    
    // Oceania
    'australia': 'australia sydney melbourne australian outback opera house',
    'new zealand': 'new zealand auckland wellington kiwi hobbiton',
    'fiji': 'fiji suva fijian tropical pacific islands',
    'papua new guinea': 'papua new guinea port moresby melanesian',
  };
  
  // Check for exact matches first
  for (const [key, keywords] of Object.entries(countryKeywords)) {
    if (country.includes(key)) {
      return keywords;
    }
  }
  
  // Fallback to general search with country name + common landmarks
  return `${countryName} landmarks architecture famous places national symbol`;
}

// Helper function to get tag-specific keywords for better image search
function getTagSpecificKeywords(tagName: string): string {
  const tag = tagName.toLowerCase();
  
  if (tag.includes('pride') || tag.includes('flag')) {
    return 'flag parade march celebration';
  } else if (tag.includes('transgender') || tag.includes('trans')) {
    return 'transgender trans pink blue white';
  } else if (tag.includes('lesbian')) {
    return 'lesbian orange pink flag women';
  } else if (tag.includes('gay') || tag.includes('men')) {
    return 'gay men blue green flag';
  } else if (tag.includes('bisexual') || tag.includes('bi')) {
    return 'bisexual purple pink blue';
  } else if (tag.includes('pansexual') || tag.includes('pan')) {
    return 'pansexual pink yellow blue';
  } else if (tag.includes('non-binary') || tag.includes('nonbinary')) {
    return 'non-binary yellow purple black white';
  } else if (tag.includes('queer')) {
    return 'queer community diverse people';
  } else if (tag.includes('event') || tag.includes('party')) {
    return 'celebration party event colorful';
  } else if (tag.includes('venue') || tag.includes('space')) {
    return 'safe space welcoming inclusive venue';
  } else if (tag.includes('health') || tag.includes('mental')) {
    return 'health wellness support care';
  } else if (tag.includes('community') || tag.includes('group')) {
    return 'community group people together';
  } else {
    return 'inclusive diverse community colorful';
  }
}