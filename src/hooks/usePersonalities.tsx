import { useState, useEffect } from 'react';
import { api } from '@/integrations/api/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { Database } from '@/types/database';

type PersonalityRow = Database['public']['Tables']['personalities']['Row'];
type PersonalityInsert = Database['public']['Tables']['personalities']['Insert'];

export interface Personality {
  id: string;
  name: string;
  pronouns?: string;
  description?: string;
  bio?: string;
  birth_date?: string;
  death_date?: string;
  is_living: boolean;
  profession?: string;
  fields: string[];
  achievements: string[];
  image_url?: string;
  social_links: Record<string, any>;
  website_url?: string;
  nationality?: string;
  birth_place?: string;
  tags: string[];
  verification_status: 'pending' | 'verified' | 'disputed';
  visibility: 'public' | 'private' | 'draft';
  created_by?: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  is_featured: boolean;
}

export interface PersonalityFilters {
  search?: string;
  fields?: string[];
  profession?: string;
  verification_status?: string;
  is_living?: boolean;
  featured_only?: boolean;
  limit?: number;
  offset?: number;
  page?: number;
}

export function usePersonalities(filters?: PersonalityFilters) {
  const { user } = useAuth();
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPersonalities = async () => {
    try {
      setLoading(true);
      setError(null);

      // First get total count
      let countQuery = api
        .from('personalities')
        .select('*', { count: 'exact', head: true })
        .eq('visibility', 'public');

      if (filters?.search) {
        countQuery = countQuery.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,profession.ilike.%${filters.search}%`);
      }

      if (filters?.profession) {
        countQuery = countQuery.ilike('profession', `%${filters.profession}%`);
      }

      if (filters?.fields && filters.fields.length > 0) {
        countQuery = countQuery.contains('fields', filters.fields);
      }

      if (filters?.verification_status) {
        countQuery = countQuery.eq('verification_status', filters.verification_status);
      }

      if (filters?.is_living !== undefined) {
        countQuery = countQuery.eq('is_living', filters.is_living);
      }

      if (filters?.featured_only) {
        countQuery = countQuery.eq('is_featured', true);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Then get the actual data
      let query = api
        .from('personalities')
        .select('*')
        .eq('visibility', 'public')
        .order('view_count', { ascending: false });

      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,profession.ilike.%${filters.search}%`);
      }

      if (filters?.profession) {
        query = query.ilike('profession', `%${filters.profession}%`);
      }

      if (filters?.fields && filters.fields.length > 0) {
        query = query.contains('fields', filters.fields);
      }

      if (filters?.verification_status) {
        query = query.eq('verification_status', filters.verification_status);
      }

      if (filters?.is_living !== undefined) {
        query = query.eq('is_living', filters.is_living);
      }

      if (filters?.featured_only) {
        query = query.eq('is_featured', true);
      }

      // Apply pagination
      const limit = filters?.limit || 100;
      const page = filters?.page || 1;
      const offset = (page - 1) * limit;
      
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching personalities:', error);
        setError(error.message);
        return;
      }

      // Transform the data to match our interface
      const transformedData = (data || []).map((row: PersonalityRow): Personality => ({
        ...row,
        name: row.name || '',
        pronouns: row.pronouns || undefined,
        description: row.description || undefined,
        bio: row.bio || undefined,
        birth_date: row.birth_date || undefined,
        death_date: row.death_date || undefined,
        profession: row.profession || undefined,
        image_url: row.image_url || undefined,
        website_url: row.website_url || undefined,
        nationality: row.nationality || undefined,
        birth_place: row.birth_place || undefined,
        created_by: row.created_by || undefined,
        fields: Array.isArray(row.fields) ? row.fields as string[] : [],
        achievements: Array.isArray(row.achievements) ? row.achievements as string[] : [],
        social_links: (row.social_links as Record<string, any>) || {},
        tags: row.tags || [],
        verification_status: (row.verification_status as 'pending' | 'verified' | 'disputed') || 'pending',
        visibility: (row.visibility as 'public' | 'private' | 'draft') || 'public'
      }));

      setPersonalities(transformedData);
    } catch (err) {
      console.error('Unexpected error fetching personalities:', err);
      setError('Failed to load personalities');
    } finally {
      setLoading(false);
    }
  };

  const createPersonality = async (personality: Omit<Personality, 'id' | 'created_at' | 'updated_at' | 'view_count' | 'created_by'>) => {
    console.log('=== CREATE PERSONALITY HOOK ===');
    console.log('User:', user);
    console.log('Personality input:', personality);
    
    if (!user) {
      console.log('No user found, authentication required');
      toast({
        title: "Authentication required",
        description: "Please log in to add a personality",
        variant: "destructive"
      });
      return;
    }

    try {
      const insertData: PersonalityInsert = {
        name: personality.name,
        pronouns: personality.pronouns || null,
        description: personality.description || null,
        bio: personality.bio || null,
        birth_date: personality.birth_date || null,
        death_date: personality.death_date || null,
        is_living: personality.is_living,
        profession: personality.profession || null,
        fields: personality.fields as any, // jsonb column
        achievements: personality.achievements as any, // jsonb column
        image_url: personality.image_url || null,
        social_links: personality.social_links,
        website_url: personality.website_url || null,
        nationality: personality.nationality || null,
        birth_place: personality.birth_place || null,
        tags: personality.tags,
        verification_status: personality.verification_status,
        visibility: personality.visibility,
        is_featured: personality.is_featured,
        created_by: user.id
      };

      console.log('Insert data prepared:', insertData);

      const { error } = await api
        .from('personalities')
        .insert(insertData);

      if (error) {
        console.error('Supabase insert error:', error);
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
        return;
      }

      console.log('Insert successful');
      
      toast({
        title: "Success",
        description: "Personality added successfully"
      });

      await fetchPersonalities();
    } catch (err) {
      console.error('Unexpected error creating personality:', err);
      toast({
        title: "Error",
        description: "Failed to add personality",
        variant: "destructive"
      });
    }
  };

  const updatePersonality = async (id: string, updates: Partial<Personality>) => {
    try {
      const { error } = await api
        .from('personalities')
        .update(updates)
        .eq('id', id);

      if (error) {
        console.error('Error updating personality:', error);
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Success",
        description: "Personality updated successfully"
      });

      await fetchPersonalities();
    } catch (err) {
      console.error('Unexpected error updating personality:', err);
      toast({
        title: "Error",
        description: "Failed to update personality",
        variant: "destructive"
      });
    }
  };

  const incrementViews = async (personalityId: string) => {
    try {
      await api.rpc('increment_personality_views', {
        personality_id: personalityId
      });
    } catch (error) {
      console.error('Error incrementing personality views:', error);
    }
  };

  useEffect(() => {
    fetchPersonalities();
  }, [filters?.search, filters?.profession, filters?.fields, filters?.verification_status, filters?.is_living, filters?.featured_only, filters?.page]);

  return {
    personalities,
    totalCount,
    loading,
    error,
    createPersonality,
    updatePersonality,
    incrementViews,
    refetchPersonalities: fetchPersonalities
  };
}