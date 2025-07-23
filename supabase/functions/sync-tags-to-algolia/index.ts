import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlgoliaRecord {
  objectID: string;
  [key: string]: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const algoliaAppId = Deno.env.get('ALGOLIA_APPLICATION_ID');
    const algoliaApiKey = Deno.env.get('ALGOLIA_API_KEY');

    console.log('Environment check:', {
      supabaseUrl: !!supabaseUrl,
      supabaseServiceKey: !!supabaseServiceKey,
      algoliaAppId: !!algoliaAppId,
      algoliaApiKey: !!algoliaApiKey
    });

    if (!algoliaAppId || !algoliaApiKey) {
      console.error('Missing Algolia credentials');
      return new Response(
        JSON.stringify({ 
          error: 'Algolia credentials not configured. Please add ALGOLIA_APPLICATION_ID and ALGOLIA_API_KEY to your Supabase secrets.',
          configured: false
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action = 'sync_all', tag_id, relationship_id } = await req.json();

    console.log(`Starting Algolia sync action: ${action}`);

    // Initialize Algolia indices
    const algoliaHeaders = {
      'X-Algolia-Application-Id': algoliaAppId,
      'X-Algolia-API-Key': algoliaApiKey,
      'Content-Type': 'application/json',
    };

    const tagsIndexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/tags`;
    const relationshipsIndexUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes/tag_relationships`;

    switch (action) {
      case 'sync_all':
        await syncAllTags(supabase, tagsIndexUrl, algoliaHeaders);
        await syncAllRelationships(supabase, relationshipsIndexUrl, algoliaHeaders);
        break;

      case 'sync_tag':
        if (!tag_id) throw new Error('tag_id required for sync_tag action');
        await syncSingleTag(supabase, tagsIndexUrl, algoliaHeaders, tag_id);
        break;

      case 'delete_tag':
        if (!tag_id) throw new Error('tag_id required for delete_tag action');
        await deleteTagFromAlgolia(tagsIndexUrl, algoliaHeaders, tag_id);
        break;

      case 'sync_relationship':
        if (!relationship_id) throw new Error('relationship_id required for sync_relationship action');
        await syncSingleRelationship(supabase, relationshipsIndexUrl, algoliaHeaders, relationship_id);
        break;

      case 'delete_relationship':
        if (!relationship_id) throw new Error('relationship_id required for delete_relationship action');
        await deleteRelationshipFromAlgolia(relationshipsIndexUrl, algoliaHeaders, relationship_id);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, action, processed_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error syncing to Algolia:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function syncAllTags(supabase: any, indexUrl: string, headers: any) {
  console.log('Syncing all tags to Algolia...');
  
  const { data: tags, error } = await supabase
    .from('unified_tags')
    .select('*')
    .order('usage_count', { ascending: false });

  if (error) throw error;

  if (!tags || tags.length === 0) {
    console.log('No tags found to sync');
    return;
  }

  const algoliaRecords: AlgoliaRecord[] = tags.map((tag: any) => ({
    objectID: tag.id,
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description,
    category: tag.category,
    color: tag.color,
    usage_count: tag.usage_count || 0,
    created_at: tag.created_at,
    updated_at: tag.updated_at,
  }));

  // Batch upload to Algolia
  const response = await fetch(`${indexUrl}/batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: algoliaRecords.map(record => ({
        action: 'updateObject',
        body: record
      }))
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to sync tags: ${await response.text()}`);
  }

  console.log(`Successfully synced ${algoliaRecords.length} tags to Algolia`);
}

async function syncAllRelationships(supabase: any, indexUrl: string, headers: any) {
  console.log('Syncing all tag relationships to Algolia...');
  
  const { data: relationships, error } = await supabase
    .from('tag_relationships')
    .select(`
      *,
      tag1:unified_tags!tag_relationships_tag1_id_fkey(name),
      tag2:unified_tags!tag_relationships_tag2_id_fkey(name)
    `)
    .order('similarity_score', { ascending: false });

  if (error) throw error;

  if (!relationships || relationships.length === 0) {
    console.log('No relationships found to sync');
    return;
  }

  const algoliaRecords: AlgoliaRecord[] = relationships.map((rel: any) => ({
    objectID: rel.id,
    id: rel.id,
    tag1_id: rel.tag1_id,
    tag2_id: rel.tag2_id,
    tag1_name: rel.tag1?.name || '',
    tag2_name: rel.tag2?.name || '',
    similarity_score: rel.similarity_score,
    relationship_type: rel.relationship_type,
    created_at: rel.created_at,
  }));

  // Batch upload to Algolia
  const response = await fetch(`${indexUrl}/batch`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: algoliaRecords.map(record => ({
        action: 'updateObject',
        body: record
      }))
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to sync relationships: ${await response.text()}`);
  }

  console.log(`Successfully synced ${algoliaRecords.length} relationships to Algolia`);
}

async function syncSingleTag(supabase: any, indexUrl: string, headers: any, tagId: string) {
  console.log(`Syncing single tag ${tagId} to Algolia...`);
  
  const { data: tag, error } = await supabase
    .from('unified_tags')
    .select('*')
    .eq('id', tagId)
    .single();

  if (error) throw error;

  const algoliaRecord: AlgoliaRecord = {
    objectID: tag.id,
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description,
    category: tag.category,
    color: tag.color,
    usage_count: tag.usage_count || 0,
    created_at: tag.created_at,
    updated_at: tag.updated_at,
  };

  const response = await fetch(`${indexUrl}/${tag.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(algoliaRecord)
  });

  if (!response.ok) {
    throw new Error(`Failed to sync tag: ${await response.text()}`);
  }

  console.log(`Successfully synced tag ${tagId} to Algolia`);
}

async function syncSingleRelationship(supabase: any, indexUrl: string, headers: any, relationshipId: string) {
  console.log(`Syncing single relationship ${relationshipId} to Algolia...`);
  
  const { data: relationship, error } = await supabase
    .from('tag_relationships')
    .select(`
      *,
      tag1:unified_tags!tag_relationships_tag1_id_fkey(name),
      tag2:unified_tags!tag_relationships_tag2_id_fkey(name)
    `)
    .eq('id', relationshipId)
    .single();

  if (error) throw error;

  const algoliaRecord: AlgoliaRecord = {
    objectID: relationship.id,
    id: relationship.id,
    tag1_id: relationship.tag1_id,
    tag2_id: relationship.tag2_id,
    tag1_name: relationship.tag1?.name || '',
    tag2_name: relationship.tag2?.name || '',
    similarity_score: relationship.similarity_score,
    relationship_type: relationship.relationship_type,
    created_at: relationship.created_at,
  };

  const response = await fetch(`${indexUrl}/${relationship.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(algoliaRecord)
  });

  if (!response.ok) {
    throw new Error(`Failed to sync relationship: ${await response.text()}`);
  }

  console.log(`Successfully synced relationship ${relationshipId} to Algolia`);
}

async function deleteTagFromAlgolia(indexUrl: string, headers: any, tagId: string) {
  console.log(`Deleting tag ${tagId} from Algolia...`);
  
  const response = await fetch(`${indexUrl}/${tagId}`, {
    method: 'DELETE',
    headers
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete tag: ${await response.text()}`);
  }

  console.log(`Successfully deleted tag ${tagId} from Algolia`);
}

async function deleteRelationshipFromAlgolia(indexUrl: string, headers: any, relationshipId: string) {
  console.log(`Deleting relationship ${relationshipId} from Algolia...`);
  
  const response = await fetch(`${indexUrl}/${relationshipId}`, {
    method: 'DELETE',
    headers
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete relationship: ${await response.text()}`);
  }

  console.log(`Successfully deleted relationship ${relationshipId} from Algolia`);
}