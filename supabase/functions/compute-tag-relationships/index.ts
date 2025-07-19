import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TagData {
  id: string;
  name: string;
  description?: string;
  category?: string;
}

interface TagRelationship {
  tag1_id: string;
  tag2_id: string;
  similarity_score: number;
  relationship_type: 'semantic' | 'categorical';
}

// Cosine similarity function
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

// Simple text preprocessing
function preprocessText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Basic text vectorization using TF-IDF-like approach
function createVocabulary(texts: string[]): Map<string, number> {
  const vocabulary = new Map<string, number>();
  let index = 0;
  
  for (const text of texts) {
    const words = preprocessText(text).split(' ');
    for (const word of words) {
      if (word.length > 2 && !vocabulary.has(word)) {
        vocabulary.set(word, index++);
      }
    }
  }
  
  return vocabulary;
}

function textToVector(text: string, vocabulary: Map<string, number>): number[] {
  const vector = new Array(vocabulary.size).fill(0);
  const words = preprocessText(text).split(' ');
  const wordCounts = new Map<string, number>();
  
  // Count word frequencies
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }
  
  // Create TF vector
  for (const [word, count] of wordCounts) {
    const index = vocabulary.get(word);
    if (index !== undefined) {
      vector[index] = count / words.length; // Term frequency
    }
  }
  
  return vector;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting tag relationship computation...');
    
    // Fetch all tags from the database
    const { data: tags, error: fetchError } = await supabase
      .from('unified_tags')
      .select('id, name, description, category')
      .order('name');

    if (fetchError) {
      console.error('Error fetching tags:', fetchError);
      throw new Error(`Failed to fetch tags: ${fetchError.message}`);
    }

    if (!tags || tags.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No tags found to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${tags.length} tags...`);

    // Prepare text data for each tag
    const tagTexts: string[] = [];
    const tagData: TagData[] = [];

    for (const tag of tags) {
      // Combine name and description for richer semantic understanding
      const text = `${tag.name} ${tag.description || ''}`.trim();
      tagTexts.push(text);
      tagData.push({
        id: tag.id,
        name: tag.name,
        description: tag.description,
        category: tag.category
      });
    }

    // Create vocabulary and compute vectors
    console.log('Creating vocabulary and computing vectors...');
    const vocabulary = createVocabulary(tagTexts);
    console.log(`Vocabulary size: ${vocabulary.size}`);

    const vectors: number[][] = [];
    for (const text of tagTexts) {
      vectors.push(textToVector(text, vocabulary));
    }

    // Compute pairwise similarities
    console.log('Computing pairwise similarities...');
    const relationships: TagRelationship[] = [];
    const semanticThreshold = 0.1; // Minimum similarity score for semantic relationships
    const categoryBonus = 0.2; // Additional score for shared categories

    for (let i = 0; i < tagData.length; i++) {
      for (let j = i + 1; j < tagData.length; j++) {
        const tag1 = tagData[i];
        const tag2 = tagData[j];
        
        // Calculate semantic similarity
        let similarity = cosineSimilarity(vectors[i], vectors[j]);
        
        // Check for shared categories and boost similarity
        const hasSameCategory = tag1.category && tag2.category && tag1.category === tag2.category;
        
        let relationshipType: 'semantic' | 'categorical' = 'semantic';
        
        if (hasSameCategory) {
          similarity += categoryBonus;
          relationshipType = 'categorical';
        }
        
        // Only include relationships above threshold
        if (similarity > semanticThreshold) {
          relationships.push({
            tag1_id: tag1.id,
            tag2_id: tag2.id,
            similarity_score: Math.min(similarity, 1.0), // Cap at 1.0
            relationship_type: relationshipType
          });
        }
      }
    }

    console.log(`Found ${relationships.length} relationships`);

    // Store relationships in database (create table if it doesn't exist)
    const { error: createTableError } = await supabase.rpc('create_tag_relationships_table_if_not_exists', {});
    
    if (createTableError) {
      console.log('Tag relationships table might already exist, continuing...');
    }

    // Clear existing relationships and insert new ones
    const { error: deleteError } = await supabase
      .from('tag_relationships')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('Error clearing existing relationships:', deleteError);
    }

    // Insert new relationships in batches
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < relationships.length; i += batchSize) {
      const batch = relationships.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('tag_relationships')
        .insert(batch);

      if (insertError) {
        console.error(`Error inserting batch ${i / batchSize + 1}:`, insertError);
      } else {
        insertedCount += batch.length;
      }
    }

    console.log(`Successfully inserted ${insertedCount} relationships`);

    return new Response(
      JSON.stringify({
        success: true,
        processed_tags: tags.length,
        relationships_found: relationships.length,
        relationships_stored: insertedCount,
        vocabulary_size: vocabulary.size
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in compute-tag-relationships function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});