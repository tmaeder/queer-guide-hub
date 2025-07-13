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
    const { query, type } = await req.json();
    
    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching Wikipedia content for:', { query, type });

    // Get Wikipedia summary
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const summaryResponse = await fetch(summaryUrl);
    
    if (!summaryResponse.ok) {
      console.error('Wikipedia summary API error:', summaryResponse.status);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Wikipedia data' }),
        { status: summaryResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const summaryData = await summaryResponse.json();
    
    // Get more detailed content from Wikipedia
    const contentUrl = `https://en.wikipedia.org/api/rest_v1/page/mobile-sections/${encodeURIComponent(query)}`;
    const contentResponse = await fetch(contentUrl);
    
    let detailedContent = '';
    if (contentResponse.ok) {
      const contentData = await contentResponse.json();
      // Get the first few sections of content
      if (contentData.mobileview && contentData.mobileview.sections) {
        const introSections = contentData.mobileview.sections
          .filter(section => section.level <= 2 && section.text)
          .slice(0, 3);
        detailedContent = introSections
          .map(section => section.text)
          .join(' ')
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .substring(0, 1000); // Limit length
      }
    }

    const result = {
      success: true,
      title: summaryData.title,
      extract: summaryData.extract,
      description: summaryData.description,
      content: detailedContent || summaryData.extract,
      pageUrl: summaryData.content_urls?.desktop?.page,
      thumbnail: summaryData.thumbnail?.source,
      coordinates: summaryData.coordinates
    };

    console.log('Wikipedia data fetched successfully for:', query);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-wikipedia-info function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});