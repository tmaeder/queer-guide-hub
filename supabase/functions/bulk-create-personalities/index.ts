import { chatCompletion, isOpenAIAvailable } from '../_shared/openai-client.ts';
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'
import { fetchOpenSanctionsData, fetchWikidataEntityLabel, fetchTopBook, fetchUpcomingConcerts } from '../_shared/personality-fetcher.ts'
import { stagePersonality, triggerPersonalityPipeline } from '../_shared/personality-staging.ts'
import { resolveByNameAndProfession, readTimeClaim } from '../_shared/wikidata-resolve.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

interface PersonalityData {
  name: string;
  description: string;
  birth_date: string | null;
  death_date: string | null;
  is_living: boolean;
  profession: string; // Changed from occupation to profession
  nationality: string;
  birth_place: string | null;
  image_url: string | null;
  bio: string;
  top_book?: string | null;
  next_concerts?: unknown[] | null;
  /** Verified QID from resolveByNameAndProfession — used as the staging source_entity_id. */
  wikidata_qid?: string | null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    // `profession` applies to the whole batch and is what makes a Wikidata match
    // safe: without it there is no way to tell the performer "Carl Sagan" from
    // the astronomer, and the resolver will (correctly) refuse to pick either.
    const { names, sources = {}, profession = null } = await req.json();

    if (!names || !Array.isArray(names)) {
      throw new Error('Names array is required');
    }

    // Default sources configuration
    const sourceConfig = {
      wikidata: sources.wikidata !== false,
      wikipedia: sources.wikipedia !== false,
      openLibrary: sources.openLibrary !== false,
      bandsintown: sources.bandsintown !== false,
      openSanctions: sources.openSanctions !== false
    };

    console.log(`Processing ${names.length} personality names with sources:`, sourceConfig);
    console.log('Input validation passed, starting processing...');

    const results = [];
    const errors = [];
    const batchSize = 10; // Process in smaller batches to avoid rate limiting
    const delayBetweenRequests = 1000; // 1 second delay between batches

    // Process names in batches
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(names.length / batchSize)} (${batch.length} names)`);
      
      for (const name of batch) {
      try {
        console.log(`Processing: ${name}`);
        
        // Fetch personality data using the same logic as fetch-personality-data
        const personalityData = await fetchPersonalityData(supabase, name.trim(), sourceConfig, profession);
        
        console.log(`Data fetched for ${name}:`, personalityData ? 'success' : 'failed');
        
        if (personalityData) {
          // NOTE: Do NOT enrich personality images from stock-photo libraries
          // (Pexels/Unsplash). They have no photos of these real, often niche
          // individuals, so a name search returns a random stock face attached
          // to a named person — actively misleading. The only trustworthy
          // sources are Wikidata P18 (by QID, resolved below) and Wikimedia;
          // no match falls through to the initials avatar on the frontend.

          try {
            const qid = (personalityData as { wikidata_qid?: string }).wikidata_qid ?? null
            const res = await stagePersonality(supabase, personalityData as unknown as Record<string, unknown> as never, {
              source_name: 'bulk-wikidata',
              source_type: 'wikidata',
              source_entity_id: qid,
              actor: auth.userId,
            })
            results.push({ staging_id: res.staging_id, name: personalityData.name, inserted: res.inserted })
            console.log(`Staged personality: ${personalityData.name} (${res.inserted ? 'new' : 'reingest'})`)
          } catch (stageErr) {
            console.error(`Stage error for ${name}:`, stageErr)
            errors.push({ name, error: (stageErr as Error).message })
          }
        } else {
          console.log(`No data found for: ${name}`);
          errors.push({ name, error: 'No data found from external sources' });
        }
      } catch (error) {
        console.error(`Error processing ${name}:`, error);
        errors.push({ name, error: error.message });
      }
    }
    
    // Add delay between batches to respect rate limits
    if (i + batchSize < names.length) {
      console.log(`Waiting ${delayBetweenRequests}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
    }
  }

    let pipelineRunId: string | null = null;
    let pipelineError: string | undefined;
    if (results.length > 0) {
      const trig = await triggerPersonalityPipeline(supabase, { triggered_by: `bulk-create:${auth.userId}`, batch_size: Math.min(100, results.length) });
      pipelineRunId = trig.pipeline_run_id;
      pipelineError = trig.error;
    }

    return new Response(JSON.stringify({
      success: true,
      staged: results.length,
      errors: errors.length,
      results,
      errorDetails: errors,
      pipeline_run_id: pipelineRunId,
      pipeline_error: pipelineError,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in bulk-create-personalities function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function fetchPersonalityData(supabaseClient: SupabaseClient, searchTerm: string, sources: unknown, profession: string | null = null): Promise<PersonalityData | null> {
  try {
    if (!sources.wikidata) {
      console.log(`Wikidata source disabled for: ${searchTerm}`);
      return null;
    }
    if (!profession || !profession.trim()) {
      console.log(`No profession supplied for "${searchTerm}" — refusing to guess a Wikidata entity by name alone.`);
      return null;
    }

    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log(`Starting enhanced LGBTI-focused data fetch for: ${searchTerm}`);

    // Multi-source data collection including OpenSanctions
    const sourceData = {
      wikidata: null,
      openSanctions: null
    };

    // Resolve the entity via the disambiguating resolver.
    //
    // This used to be `wbsearchentities&limit=1` → search[0], with no personhood
    // or occupation check. Stage names collide with famous namesakes, so that
    // bound performer records to strangers ("Carl Sagan" → Q410) and copied the
    // stranger's dates and social handles across. resolveByNameAndProfession
    // requires P31=Q5 plus an occupation overlap and refuses ambiguous matches;
    // returning null here means the caller creates the row without Wikidata
    // enrichment rather than with someone else's facts.
    const resolved = await resolveByNameAndProfession(searchTerm, profession);
    if (!resolved) {
      console.log(`No confident Wikidata match for: ${searchTerm} (profession: ${profession ?? 'none'})`);
      return null;
    }
    const entityId = resolved.qid;
    const entityInfo = resolved.entity;

    // resolveByNameAndProfession returns a structurally-typed entity
    // (Record<string, unknown>), so the label/claim shapes are narrowed once
    // here rather than at each of the dozen read sites below.
    // `value` is a string for media/identifier claims (P18) and an object for
    // entity-valued ones (P106/P27/P19), hence the union.
    type WdSnak = {
      mainsnak?: { datavalue?: { value?: string | { id?: string; time?: string } } };
    };
    const labels = entityInfo.labels as Record<string, { value?: string }> | undefined;
    const descriptions = entityInfo.descriptions as Record<string, { value?: string }> | undefined;
    const sitelinks = entityInfo.sitelinks as Record<string, { title?: string }> | undefined;
    const claims = (entityInfo.claims ?? {}) as Record<string, WdSnak[] | undefined>;
    const snakId = (s?: WdSnak) => {
      const v = s?.mainsnak?.datavalue?.value;
      return typeof v === 'object' ? v?.id : undefined;
    };

    // Extract data from Wikidata
    const name = labels?.en?.value || searchTerm;
    const description = descriptions?.en?.value || '';

    // Birth/death dates (P569/P570) — rank- and precision-aware. Reading
    // claims[0].…time and formatting it blind treats a decade-precision snak
    // ("+1800-00-00T00:00:00Z") as 1 January 1800 and lets a deprecated
    // statement outrank the preferred one.
    const birthTime = readTimeClaim(entityInfo, 'P569');
    const deathTime = readTimeClaim(entityInfo, 'P570');
    const birthDate = birthTime?.date ?? null;
    const deathDate = deathTime?.date ?? null;

    // Occupation (P106)
    const occupationClaim = claims.P106?.[0];
    let occupation = '';
    if (occupationClaim) {
      const occupationId = snakId(occupationClaim);
      if (occupationId) {
        occupation = await fetchWikidataEntityLabel(occupationId);
      }
    }
    
    // Nationality (P27)
    const nationalityClaim = claims.P27?.[0];
    let nationality = '';
    if (nationalityClaim) {
      const nationalityId = snakId(nationalityClaim);
      if (nationalityId) {
        nationality = await fetchWikidataEntityLabel(nationalityId);
      }
    }
    
    // Birth place (P19)
    const birthPlaceClaim = claims.P19?.[0];
    let birthPlace: string | null = null;
    if (birthPlaceClaim) {
      const birthPlaceId = snakId(birthPlaceClaim);
      if (birthPlaceId) {
        const label = await fetchWikidataEntityLabel(birthPlaceId);
        birthPlace = label || null;
      }
    }

    // Get Wikipedia page and bio
    let bio = description;
    const wikipediaTitle = sitelinks?.enwiki?.title;
    if (wikipediaTitle && sources.wikipedia) {
      try {
        const wikiResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikipediaTitle)}`);
        const wikiData = await wikiResponse.json();
        if (wikiData.extract) {
          bio = wikiData.extract;
        }
      } catch (error) {
        console.error('Error fetching Wikipedia bio:', error);
      }
    }

    // Get image from Wikidata (P18)
    let imageUrl = null;
    const imageClaim = claims.P18?.[0];
    if (imageClaim) {
      const imageFile = imageClaim.mainsnak?.datavalue?.value;
      if (typeof imageFile === 'string') {
        // Convert to Wikimedia Commons URL
        const fileName = imageFile.replace(/ /g, '_');
        imageUrl = `https://upload.wikimedia.org/wikipedia/commons/thumb/${fileName}`;
      }
    }

    // Fetch top book if the person is an author and Open Library is enabled
    let topBook = null;
    if (sources.openLibrary && occupation && (occupation.toLowerCase().includes('author') || occupation.toLowerCase().includes('writer') || occupation.toLowerCase().includes('novelist') || occupation.toLowerCase().includes('poet'))) {
      topBook = await fetchTopBook(name);
    }

    // Fetch upcoming concerts if the person is a musician and Bandsintown is enabled
    let nextConcerts = null;
    if (sources.bandsintown && occupation && (occupation.toLowerCase().includes('musician') || occupation.toLowerCase().includes('singer') || occupation.toLowerCase().includes('composer') || occupation.toLowerCase().includes('rapper') || occupation.toLowerCase().includes('band') || occupation.toLowerCase().includes('artist'))) {
      nextConcerts = await fetchUpcomingConcerts(name);
    }

    // Fetch OpenSanctions data if enabled
    if (sources.openSanctions) {
      sourceData.openSanctions = await fetchOpenSanctionsData(name);
    }

    // Enhanced AI-powered LGBTI/queer community description generation with all source data
    const enhancedData = await enhanceWithLGBTIContext(supabaseClient, {
      name,
      description,
      bio,
      profession: occupation,
      nationality,
      birth_place: birthPlace,
      // Already normalised ISO dates — readTimeClaim did the formatting, so do
      // NOT re-run formatWikidataDate here (it expects a raw "+YYYY-…" snak and
      // would reject an already-formatted value).
      birth_date: birthDate,
      death_date: deathDate,
      // Presence of a P570 statement is the death signal, even when the snak
      // itself was too coarse to format into a date.
      is_living: !(claims.P570?.length),
      openSanctionsData: sourceData.openSanctions
    });

    return {
      name: enhancedData.name,
      description: enhancedData.description,
      birth_date: enhancedData.birth_date,
      death_date: enhancedData.death_date,
      is_living: enhancedData.is_living,
      profession: enhancedData.profession,
      nationality: enhancedData.nationality,
      birth_place: enhancedData.birth_place,
      image_url: imageUrl,
      bio: enhancedData.bio,
      top_book: topBook,
      next_concerts: nextConcerts,
      // Carry the QID so stagePersonality records it as source_entity_id. This
      // was previously never set (the caller always read null); it is only safe
      // to propagate now that the resolver verifies personhood and occupation.
      wikidata_qid: entityId
    };

  } catch (error) {
    console.error('Error fetching personality data:', error);
    return null;
  }
}

async function enhanceWithLGBTIContext(supabaseClient: SupabaseClient, basicData: unknown): Promise<unknown> {
  try {
    if (!(await isOpenAIAvailable(supabaseClient))) {
      console.log('OpenAI not available, returning basic data');
      return basicData;
    }

    console.log(`Enhancing LGBTI context for: ${basicData.name}`);

    // Create a source-based prompt that strictly adheres to existing data
    const prompt = `You are an expert researcher specializing in LGBTI/queer history. Your task is to enhance biographical information while STRICTLY adhering to the provided source data and never contradicting it.

SOURCE DATA FOR: ${basicData.name}
===========================================
Description: ${basicData.description || 'Not provided'}
Biography: ${basicData.bio || 'Not provided'}
Profession: ${basicData.profession || 'Not specified'}
Nationality: ${basicData.nationality || 'Not specified'}
Birth Place: ${basicData.birth_place || 'Not specified'}
Birth Date: ${basicData.birth_date || 'Not specified'}
Death Date: ${basicData.death_date || 'Still living'}
Is Living: ${basicData.is_living}
OpenSanctions Data: ${basicData.openSanctionsData ? JSON.stringify(basicData.openSanctionsData, null, 2) : 'No sanctions data available'}

INSTRUCTIONS:
You MUST base your response ONLY on the source data provided above. Do NOT add, contradict, or modify any factual information. Your role is to:

1. Preserve all source facts exactly as stated
2. Only enhance with LGBTI context if it's explicitly mentioned or clearly implied in the source data
3. If no LGBTI connection is mentioned in sources, state that clearly

Please provide enhanced information in JSON format with these fields:
1. "name" - Keep exactly: ${basicData.name}
2. "description" - Rewrite the source description to be concise (1-2 sentences) while preserving all facts. Only mention LGBTI connection if explicitly stated in source
3. "bio" - Enhance the source biography by organizing it into 2-3 clear paragraphs while preserving ALL source facts. Only add LGBTI context if explicitly mentioned
4. "profession" - Use the profession from source data, do not modify
5. "lgbti_connection" - Based ONLY on source content: "community_member", "ally", "activist", "representation", "none_known", "unclear"
6. "lgbti_details" - ONLY include details that are explicitly mentioned in the source content

CRITICAL RULES:
- NEVER contradict source information
- NEVER add biographical facts not in source data
- NEVER assume LGBTI connections not explicitly mentioned
- If source doesn't mention LGBTI connection, clearly state "none_known"
- Preserve all source dates, places, and factual details exactly
- Only reorganize and clarify the existing source content
- If OpenSanctions data is available, accurately reflect any sanctions, PEP status, or regulatory information
- Be transparent about any compliance or regulatory concerns

Return ONLY valid JSON, no additional text.`;

    const aiResult = await chatCompletion(supabaseClient, {
      model: 'gpt-4.1-2025-04-14',
      messages: [
        { role: 'system', content: 'You are an expert LGBTI historian and researcher. Provide accurate, factual information about people\'s relationship to the LGBTI/queer community.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.3
    });

    const enhancedContent = aiResult.content;

    try {
      // Remove potential markdown code blocks from AI response
      const cleanedResponse = enhancedContent.replace(/^```json\s*|\s*```$/g, '').trim();
      const enhancedData = JSON.parse(cleanedResponse);

      // Merge enhanced data with basic data, keeping all original fields
      return {
        ...basicData,
        name: enhancedData.name || basicData.name,
        description: enhancedData.description || basicData.description,
        bio: enhancedData.bio || basicData.bio,
        profession: enhancedData.profession || basicData.profession,
        lgbti_connection: enhancedData.lgbti_connection,
        lgbti_details: enhancedData.lgbti_details,
        sanctions_status: enhancedData.sanctions_status,
        regulatory_notes: enhancedData.regulatory_notes
      };
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.log('AI Response:', enhancedContent);
      return basicData;
    }

  } catch (error) {
    console.error('Error enhancing with LGBTI context:', error);
    return basicData;
  }
}

