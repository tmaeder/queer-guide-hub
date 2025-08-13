export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      access_logs: {
        Row: {
          created_at: string
          endpoint: string | null
          id: string
          ip_address: unknown
          method: string | null
          response_time_ms: number | null
          status_code: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          id?: string
          ip_address: unknown
          method?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          id?: string
          ip_address?: unknown
          method?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      accessibility_attributes: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      amenities: {
        Row: {
          icon_name: string | null
          id: string
          name: string
        }
        Insert: {
          icon_name?: string | null
          id?: string
          name: string
        }
        Update: {
          icon_name?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      attributes: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      auth_rate_limit: {
        Row: {
          attempt_count: number | null
          blocked_until: string | null
          created_at: string | null
          id: string
          ip_address: unknown
          last_attempt: string | null
        }
        Insert: {
          attempt_count?: number | null
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          ip_address: unknown
          last_attempt?: string | null
        }
        Update: {
          attempt_count?: number | null
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          ip_address?: unknown
          last_attempt?: string | null
        }
        Relationships: []
      }
      auth_rate_limit_keys: {
        Row: {
          attempt_count: number
          blocked_until: string | null
          created_at: string
          id: string
          key: string
          last_attempt: string
        }
        Insert: {
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          id?: string
          key: string
          last_attempt?: string
        }
        Update: {
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          id?: string
          key?: string
          last_attempt?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          arrival_airport: string | null
          booking_reference: string
          booking_type: string
          check_in_date: string | null
          check_out_date: string | null
          created_at: string
          currency: string | null
          departure_airport: string | null
          departure_date: string | null
          encryption_key_id: string | null
          flight_data: Json | null
          flight_data_encrypted: string | null
          guests: number | null
          hotel_data: Json | null
          hotel_data_encrypted: string | null
          hotel_location: string | null
          hotel_name: string | null
          id: string
          passengers: number | null
          payment_method_last4: string | null
          payment_method_type: string | null
          payment_status: string | null
          payment_token: string | null
          return_date: string | null
          rooms: number | null
          status: string
          total_price: number | null
          traveler_details: Json | null
          traveler_details_encrypted: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          arrival_airport?: string | null
          booking_reference: string
          booking_type: string
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string
          currency?: string | null
          departure_airport?: string | null
          departure_date?: string | null
          encryption_key_id?: string | null
          flight_data?: Json | null
          flight_data_encrypted?: string | null
          guests?: number | null
          hotel_data?: Json | null
          hotel_data_encrypted?: string | null
          hotel_location?: string | null
          hotel_name?: string | null
          id?: string
          passengers?: number | null
          payment_method_last4?: string | null
          payment_method_type?: string | null
          payment_status?: string | null
          payment_token?: string | null
          return_date?: string | null
          rooms?: number | null
          status?: string
          total_price?: number | null
          traveler_details?: Json | null
          traveler_details_encrypted?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          arrival_airport?: string | null
          booking_reference?: string
          booking_type?: string
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string
          currency?: string | null
          departure_airport?: string | null
          departure_date?: string | null
          encryption_key_id?: string | null
          flight_data?: Json | null
          flight_data_encrypted?: string | null
          guests?: number | null
          hotel_data?: Json | null
          hotel_data_encrypted?: string | null
          hotel_location?: string | null
          hotel_name?: string | null
          id?: string
          passengers?: number | null
          payment_method_last4?: string | null
          payment_method_type?: string | null
          payment_status?: string | null
          payment_token?: string | null
          return_date?: string | null
          rooms?: number | null
          status?: string
          total_price?: number | null
          traveler_details?: Json | null
          traveler_details_encrypted?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_feed_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          revoked: boolean
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked?: boolean
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked?: boolean
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      captcha_verifications: {
        Row: {
          created_at: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          success: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cities: {
        Row: {
          airport_codes: string[] | null
          area_codes: string[] | null
          area_km2: number | null
          best_time_to_visit: string | null
          climate_type: string | null
          cost_of_living: Json | null
          country_id: string
          created_at: string
          demographics: Json | null
          description: string | null
          economy_sectors: string[] | null
          elevation_m: number | null
          founded_year: number | null
          id: string
          image_metadata: Json | null
          image_url: string | null
          is_capital: boolean | null
          is_major_city: boolean | null
          latitude: number | null
          lgbt_friendly_rating: number | null
          local_customs: string | null
          local_language: string | null
          longitude: number | null
          major_airport_code: string | null
          mayor: string | null
          name: string
          notable_landmarks: string[] | null
          official_website: string | null
          population: number | null
          postal_codes: string[] | null
          region_name: string | null
          sister_cities: string[] | null
          timezone: string | null
          transportation_info: Json | null
          universities: string[] | null
          updated_at: string
        }
        Insert: {
          airport_codes?: string[] | null
          area_codes?: string[] | null
          area_km2?: number | null
          best_time_to_visit?: string | null
          climate_type?: string | null
          cost_of_living?: Json | null
          country_id: string
          created_at?: string
          demographics?: Json | null
          description?: string | null
          economy_sectors?: string[] | null
          elevation_m?: number | null
          founded_year?: number | null
          id?: string
          image_metadata?: Json | null
          image_url?: string | null
          is_capital?: boolean | null
          is_major_city?: boolean | null
          latitude?: number | null
          lgbt_friendly_rating?: number | null
          local_customs?: string | null
          local_language?: string | null
          longitude?: number | null
          major_airport_code?: string | null
          mayor?: string | null
          name: string
          notable_landmarks?: string[] | null
          official_website?: string | null
          population?: number | null
          postal_codes?: string[] | null
          region_name?: string | null
          sister_cities?: string[] | null
          timezone?: string | null
          transportation_info?: Json | null
          universities?: string[] | null
          updated_at?: string
        }
        Update: {
          airport_codes?: string[] | null
          area_codes?: string[] | null
          area_km2?: number | null
          best_time_to_visit?: string | null
          climate_type?: string | null
          cost_of_living?: Json | null
          country_id?: string
          created_at?: string
          demographics?: Json | null
          description?: string | null
          economy_sectors?: string[] | null
          elevation_m?: number | null
          founded_year?: number | null
          id?: string
          image_metadata?: Json | null
          image_url?: string | null
          is_capital?: boolean | null
          is_major_city?: boolean | null
          latitude?: number | null
          lgbt_friendly_rating?: number | null
          local_customs?: string | null
          local_language?: string | null
          longitude?: number | null
          major_airport_code?: string | null
          mayor?: string | null
          name?: string
          notable_landmarks?: string[] | null
          official_website?: string | null
          population?: number | null
          postal_codes?: string[] | null
          region_name?: string | null
          sister_cities?: string[] | null
          timezone?: string | null
          transportation_info?: Json | null
          universities?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      city_favorites: {
        Row: {
          city_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          city_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          city_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      community_groups: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          image_url: string | null
          is_private: boolean
          member_count: number
          name: string
          rules: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_private?: boolean
          member_count?: number
          name: string
          rules?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_private?: boolean
          member_count?: number
          name?: string
          rules?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          comments_count: number | null
          content: string
          created_at: string
          id: string
          images: string[] | null
          likes_count: number | null
          link_description: string | null
          link_title: string | null
          link_url: string | null
          mentions: Json | null
          pinned: boolean | null
          poll_options: Json | null
          post_type: string | null
          referenced_id: string | null
          referenced_type: string | null
          shares_count: number | null
          tags: string[] | null
          updated_at: string
          user_id: string
          visibility: string | null
        }
        Insert: {
          comments_count?: number | null
          content: string
          created_at?: string
          id?: string
          images?: string[] | null
          likes_count?: number | null
          link_description?: string | null
          link_title?: string | null
          link_url?: string | null
          mentions?: Json | null
          pinned?: boolean | null
          poll_options?: Json | null
          post_type?: string | null
          referenced_id?: string | null
          referenced_type?: string | null
          shares_count?: number | null
          tags?: string[] | null
          updated_at?: string
          user_id: string
          visibility?: string | null
        }
        Update: {
          comments_count?: number | null
          content?: string
          created_at?: string
          id?: string
          images?: string[] | null
          likes_count?: number | null
          link_description?: string | null
          link_title?: string | null
          link_url?: string | null
          mentions?: Json | null
          pinned?: boolean | null
          poll_options?: Json | null
          post_type?: string | null
          referenced_id?: string | null
          referenced_type?: string | null
          shares_count?: number | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      content_embeddings: {
        Row: {
          content_id: string
          content_text: string
          content_type: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json | null
          updated_at: string
        }
        Insert: {
          content_id: string
          content_text: string
          content_type: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          updated_at?: string
        }
        Update: {
          content_id?: string
          content_text?: string
          content_type?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      continents: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          is_admin: boolean | null
          is_muted: boolean | null
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_admin?: boolean | null
          is_muted?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_admin?: boolean | null
          is_muted?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_conversation_participants_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_conversation_participants_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_conversation_participants_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversations: {
        Row: {
          conversation_type: string | null
          created_at: string
          description: string | null
          id: string
          last_message_at: string | null
          last_message_id: string | null
          participants_count: number | null
          title: string | null
          updated_at: string
        }
        Insert: {
          conversation_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_message_at?: string | null
          last_message_id?: string | null
          participants_count?: number | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          conversation_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          last_message_at?: string | null
          last_message_id?: string | null
          participants_count?: number | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          airport_codes: string[] | null
          area_km2: number | null
          calling_code: string | null
          capital: string | null
          capital_coordinates: Json | null
          climate_zones: string[] | null
          code: string
          continent_id: string
          created_at: string
          currency: string | null
          description: string | null
          driving_side: string | null
          exports: string[] | null
          flag_emoji: string | null
          gdp_per_capita_usd: number | null
          gdp_usd: number | null
          government_type: string | null
          human_development_index: number | null
          id: string
          imports: string[] | null
          internet_tld: string | null
          languages: string[] | null
          latitude: number | null
          lgbt_legal_status: string | null
          lgbt_rights_status: string | null
          lgbti_adoption_rights: string | null
          lgbti_association_restrictions: Json | null
          lgbti_bullying_protection: Json | null
          lgbti_constitutional_protection: Json | null
          lgbti_conversion_therapy_regulation: string | null
          lgbti_criminalization: Json | null
          lgbti_data_last_updated: string | null
          lgbti_education_protection: Json | null
          lgbti_employment_protection: Json | null
          lgbti_expression_restrictions: Json | null
          lgbti_gender_recognition: Json | null
          lgbti_goods_services_protection: Json | null
          lgbti_hate_crime_law: Json | null
          lgbti_health_protection: Json | null
          lgbti_housing_protection: Json | null
          lgbti_incitement_prohibition: Json | null
          lgbti_intersex_protection: string | null
          lgbti_same_sex_unions: string | null
          life_expectancy: number | null
          literacy_rate: number | null
          longitude: number | null
          major_airports: string[] | null
          major_industries: string[] | null
          major_religions: string[] | null
          name: string
          national_anthem: string | null
          national_day: string | null
          national_symbols: Json | null
          natural_resources: string[] | null
          population: number | null
          region_id: string | null
          timezone: string | null
          unesco_sites: string[] | null
          updated_at: string
          visa_requirements: Json | null
        }
        Insert: {
          airport_codes?: string[] | null
          area_km2?: number | null
          calling_code?: string | null
          capital?: string | null
          capital_coordinates?: Json | null
          climate_zones?: string[] | null
          code: string
          continent_id: string
          created_at?: string
          currency?: string | null
          description?: string | null
          driving_side?: string | null
          exports?: string[] | null
          flag_emoji?: string | null
          gdp_per_capita_usd?: number | null
          gdp_usd?: number | null
          government_type?: string | null
          human_development_index?: number | null
          id?: string
          imports?: string[] | null
          internet_tld?: string | null
          languages?: string[] | null
          latitude?: number | null
          lgbt_legal_status?: string | null
          lgbt_rights_status?: string | null
          lgbti_adoption_rights?: string | null
          lgbti_association_restrictions?: Json | null
          lgbti_bullying_protection?: Json | null
          lgbti_constitutional_protection?: Json | null
          lgbti_conversion_therapy_regulation?: string | null
          lgbti_criminalization?: Json | null
          lgbti_data_last_updated?: string | null
          lgbti_education_protection?: Json | null
          lgbti_employment_protection?: Json | null
          lgbti_expression_restrictions?: Json | null
          lgbti_gender_recognition?: Json | null
          lgbti_goods_services_protection?: Json | null
          lgbti_hate_crime_law?: Json | null
          lgbti_health_protection?: Json | null
          lgbti_housing_protection?: Json | null
          lgbti_incitement_prohibition?: Json | null
          lgbti_intersex_protection?: string | null
          lgbti_same_sex_unions?: string | null
          life_expectancy?: number | null
          literacy_rate?: number | null
          longitude?: number | null
          major_airports?: string[] | null
          major_industries?: string[] | null
          major_religions?: string[] | null
          name: string
          national_anthem?: string | null
          national_day?: string | null
          national_symbols?: Json | null
          natural_resources?: string[] | null
          population?: number | null
          region_id?: string | null
          timezone?: string | null
          unesco_sites?: string[] | null
          updated_at?: string
          visa_requirements?: Json | null
        }
        Update: {
          airport_codes?: string[] | null
          area_km2?: number | null
          calling_code?: string | null
          capital?: string | null
          capital_coordinates?: Json | null
          climate_zones?: string[] | null
          code?: string
          continent_id?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          driving_side?: string | null
          exports?: string[] | null
          flag_emoji?: string | null
          gdp_per_capita_usd?: number | null
          gdp_usd?: number | null
          government_type?: string | null
          human_development_index?: number | null
          id?: string
          imports?: string[] | null
          internet_tld?: string | null
          languages?: string[] | null
          latitude?: number | null
          lgbt_legal_status?: string | null
          lgbt_rights_status?: string | null
          lgbti_adoption_rights?: string | null
          lgbti_association_restrictions?: Json | null
          lgbti_bullying_protection?: Json | null
          lgbti_constitutional_protection?: Json | null
          lgbti_conversion_therapy_regulation?: string | null
          lgbti_criminalization?: Json | null
          lgbti_data_last_updated?: string | null
          lgbti_education_protection?: Json | null
          lgbti_employment_protection?: Json | null
          lgbti_expression_restrictions?: Json | null
          lgbti_gender_recognition?: Json | null
          lgbti_goods_services_protection?: Json | null
          lgbti_hate_crime_law?: Json | null
          lgbti_health_protection?: Json | null
          lgbti_housing_protection?: Json | null
          lgbti_incitement_prohibition?: Json | null
          lgbti_intersex_protection?: string | null
          lgbti_same_sex_unions?: string | null
          life_expectancy?: number | null
          literacy_rate?: number | null
          longitude?: number | null
          major_airports?: string[] | null
          major_industries?: string[] | null
          major_religions?: string[] | null
          name?: string
          national_anthem?: string | null
          national_day?: string | null
          national_symbols?: Json | null
          natural_resources?: string[] | null
          population?: number | null
          region_id?: string | null
          timezone?: string | null
          unesco_sites?: string[] | null
          updated_at?: string
          visa_requirements?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "countries_continent_id_fkey"
            columns: ["continent_id"]
            isOneToOne: false
            referencedRelation: "continents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "countries_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      country_favorites: {
        Row: {
          country_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          country_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          country_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      crawl_jobs: {
        Row: {
          created_at: string
          credits_used: number | null
          expires_at: string | null
          id: string
          pages_crawled: number | null
          result_data: Json | null
          status: string
          total_pages: number | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          credits_used?: number | null
          expires_at?: string | null
          id?: string
          pages_crawled?: number | null
          result_data?: Json | null
          status?: string
          total_pages?: number | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          credits_used?: number | null
          expires_at?: string | null
          id?: string
          pages_crawled?: number | null
          result_data?: Json | null
          status?: string
          total_pages?: number | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          id: string
          name: string
          symbol: string | null
        }
        Insert: {
          code: string
          id?: string
          name: string
          symbol?: string | null
        }
        Update: {
          code?: string
          id?: string
          name?: string
          symbol?: string | null
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount: number
          created_at: string
          currency: string | null
          donor_name: string | null
          email: string
          id: string
          is_anonymous: boolean | null
          message: string | null
          status: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string | null
          donor_name?: string | null
          email: string
          id?: string
          is_anonymous?: boolean | null
          message?: string | null
          status?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string | null
          donor_name?: string | null
          email?: string
          id?: string
          is_anonymous?: boolean | null
          message?: string | null
          status?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          html_content: string
          id: string
          is_active: boolean
          name: string
          subject: string
          template_key: string
          text_content: string | null
          updated_at: string
          updated_by: string | null
          variables: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          html_content: string
          id?: string
          is_active?: boolean
          name: string
          subject: string
          template_key: string
          text_content?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          html_content?: string
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          template_key?: string
          text_content?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      entity_attribute_assignments: {
        Row: {
          attribute_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_attribute_assignments_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_amenities: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      event_attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_categories: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      event_favorites: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      event_services: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      event_types: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          accessibility_attributes: string[] | null
          accessibility_notes: string | null
          address: string | null
          age_restriction: string | null
          city: string
          country: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          event_type: string
          featured: boolean | null
          group_id: string | null
          id: string
          images: string[] | null
          is_free: boolean | null
          is_public: boolean
          is_recurring: boolean | null
          latitude: number | null
          longitude: number | null
          max_attendees: number | null
          organizer_contact: string | null
          organizer_name: string | null
          price_max: number | null
          price_min: number | null
          recurrence_pattern: string | null
          start_date: string
          state: string | null
          status: string | null
          target_groups: string[] | null
          ticket_url: string | null
          title: string
          updated_at: string
          venue_id: string | null
          venue_name: string | null
          website: string | null
        }
        Insert: {
          accessibility_attributes?: string[] | null
          accessibility_notes?: string | null
          address?: string | null
          age_restriction?: string | null
          city: string
          country?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type: string
          featured?: boolean | null
          group_id?: string | null
          id?: string
          images?: string[] | null
          is_free?: boolean | null
          is_public?: boolean
          is_recurring?: boolean | null
          latitude?: number | null
          longitude?: number | null
          max_attendees?: number | null
          organizer_contact?: string | null
          organizer_name?: string | null
          price_max?: number | null
          price_min?: number | null
          recurrence_pattern?: string | null
          start_date: string
          state?: string | null
          status?: string | null
          target_groups?: string[] | null
          ticket_url?: string | null
          title: string
          updated_at?: string
          venue_id?: string | null
          venue_name?: string | null
          website?: string | null
        }
        Update: {
          accessibility_attributes?: string[] | null
          accessibility_notes?: string | null
          address?: string | null
          age_restriction?: string | null
          city?: string
          country?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: string
          featured?: boolean | null
          group_id?: string | null
          id?: string
          images?: string[] | null
          is_free?: boolean | null
          is_public?: boolean
          is_recurring?: boolean | null
          latitude?: number | null
          longitude?: number | null
          max_attendees?: number | null
          organizer_contact?: string | null
          organizer_name?: string | null
          price_max?: number | null
          price_min?: number | null
          recurrence_pattern?: string | null
          start_date?: string
          state?: string | null
          status?: string | null
          target_groups?: string[] | null
          ticket_url?: string | null
          title?: string
          updated_at?: string
          venue_id?: string | null
          venue_name?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_login_attempts: {
        Row: {
          attempt_type: string
          blocked_until: string | null
          created_at: string
          id: string
          identifier: string
          ip_address: unknown
          user_agent: string | null
        }
        Insert: {
          attempt_type?: string
          blocked_until?: string | null
          created_at?: string
          id?: string
          identifier: string
          ip_address: unknown
          user_agent?: string | null
        }
        Update: {
          attempt_type?: string
          blocked_until?: string | null
          created_at?: string
          id?: string
          identifier?: string
          ip_address?: unknown
          user_agent?: string | null
        }
        Relationships: []
      }
      group_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "group_post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      group_memberships: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_notifications: {
        Row: {
          content: string | null
          created_at: string
          group_id: string
          id: string
          notification_type: string
          read_at: string | null
          related_comment_id: string | null
          related_post_id: string | null
          triggered_by_user_id: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          group_id: string
          id?: string
          notification_type: string
          read_at?: string | null
          related_comment_id?: string | null
          related_post_id?: string | null
          triggered_by_user_id: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          group_id?: string
          id?: string
          notification_type?: string
          read_at?: string | null
          related_comment_id?: string | null
          related_post_id?: string | null
          triggered_by_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_notifications_related_comment_id_fkey"
            columns: ["related_comment_id"]
            isOneToOne: false
            referencedRelation: "group_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_notifications_related_post_id_fkey"
            columns: ["related_post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      group_poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      group_post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          likes_count: number
          mentions: Json | null
          parent_comment_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          mentions?: Json | null
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          mentions?: Json | null
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "group_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      group_post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "group_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      group_posts: {
        Row: {
          comments_count: number
          content: string
          created_at: string
          group_id: string
          id: string
          images: string[] | null
          is_pinned: boolean
          likes_count: number
          mentions: Json | null
          poll_data: Json | null
          post_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comments_count?: number
          content: string
          created_at?: string
          group_id: string
          id?: string
          images?: string[] | null
          is_pinned?: boolean
          likes_count?: number
          mentions?: Json | null
          poll_data?: Json | null
          post_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comments_count?: number
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          images?: string[] | null
          is_pinned?: boolean
          likes_count?: number
          mentions?: Json | null
          poll_data?: Json | null
          post_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: string
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          metadata: Json | null
          name: string
          slug: string | null
          sort_order: number | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category: string
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          slug?: string | null
          sort_order?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          slug?: string | null
          sort_order?: number | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      languages: {
        Row: {
          id: string
          iso_639_1_code: string | null
          name: string
        }
        Insert: {
          id?: string
          iso_639_1_code?: string | null
          name: string
        }
        Update: {
          id?: string
          iso_639_1_code?: string | null
          name?: string
        }
        Relationships: []
      }
      marketplace_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          business_name: string
          business_type: string | null
          category: string
          category_id: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string | null
          featured: boolean | null
          id: string
          images: string[] | null
          location: string | null
          price: number | null
          price_type: string | null
          shipping_available: boolean | null
          shipping_info: string | null
          social_media: Json | null
          status: string | null
          subcategory: string | null
          title: string
          updated_at: string
          venue_id: string | null
          views_count: number | null
          website: string | null
        }
        Insert: {
          business_name: string
          business_type?: string | null
          category: string
          category_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          featured?: boolean | null
          id?: string
          images?: string[] | null
          location?: string | null
          price?: number | null
          price_type?: string | null
          shipping_available?: boolean | null
          shipping_info?: string | null
          social_media?: Json | null
          status?: string | null
          subcategory?: string | null
          title: string
          updated_at?: string
          venue_id?: string | null
          views_count?: number | null
          website?: string | null
        }
        Update: {
          business_name?: string
          business_type?: string | null
          category?: string
          category_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string | null
          featured?: boolean | null
          id?: string
          images?: string[] | null
          location?: string | null
          price?: number | null
          price_type?: string | null
          shipping_available?: boolean | null
          shipping_info?: string | null
          social_media?: Json | null
          status?: string | null
          subcategory?: string | null
          title?: string
          updated_at?: string
          venue_id?: string | null
          views_count?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "marketplace_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_listings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_listings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_listings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reviews: {
        Row: {
          content: string | null
          created_at: string
          helpful_count: number | null
          id: string
          listing_id: string
          purchase_verified: boolean | null
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          listing_id: string
          purchase_verified?: boolean | null
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          listing_id?: string
          purchase_verified?: boolean | null
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          message_type: string | null
          metadata: Json | null
          reply_to_id: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          message_type?: string | null
          metadata?: Json | null
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_profiles_user_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_sender_id_profiles_user_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_sender_id_profiles_user_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      news_article_cities: {
        Row: {
          article_id: string
          city_id: string
          created_at: string
          id: string
        }
        Insert: {
          article_id: string
          city_id: string
          created_at?: string
          id?: string
        }
        Update: {
          article_id?: string
          city_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_article_cities_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_article_cities_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      news_article_countries: {
        Row: {
          article_id: string
          country_id: string
          created_at: string
          id: string
        }
        Insert: {
          article_id: string
          country_id: string
          created_at?: string
          id?: string
        }
        Update: {
          article_id?: string
          country_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_article_countries_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_article_countries_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      news_articles: {
        Row: {
          author: string | null
          category: string
          city_ids: string[] | null
          content: string | null
          country_ids: string[] | null
          created_at: string
          excerpt: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          published_at: string
          sentiment: string | null
          source_id: string
          tags: string[] | null
          title: string
          updated_at: string
          url: string
          views_count: number | null
        }
        Insert: {
          author?: string | null
          category?: string
          city_ids?: string[] | null
          content?: string | null
          country_ids?: string[] | null
          created_at?: string
          excerpt?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          published_at: string
          sentiment?: string | null
          source_id: string
          tags?: string[] | null
          title: string
          updated_at?: string
          url: string
          views_count?: number | null
        }
        Update: {
          author?: string | null
          category?: string
          city_ids?: string[] | null
          content?: string | null
          country_ids?: string[] | null
          created_at?: string
          excerpt?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          published_at?: string
          sentiment?: string | null
          source_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_category_id: string | null
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_category_id?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_category_id?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "news_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      news_favorites: {
        Row: {
          article_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      news_sources: {
        Row: {
          articles_fetched: number | null
          category: string
          created_at: string
          fetch_frequency: number
          id: string
          is_active: boolean
          keywords: string[] | null
          last_error: string | null
          last_fetched_at: string | null
          name: string
          source_type: string
          status: string | null
          updated_at: string
          url: string
        }
        Insert: {
          articles_fetched?: number | null
          category?: string
          created_at?: string
          fetch_frequency?: number
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          last_error?: string | null
          last_fetched_at?: string | null
          name: string
          source_type?: string
          status?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          articles_fetched?: number | null
          category?: string
          created_at?: string
          fetch_frequency?: number
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          last_error?: string | null
          last_fetched_at?: string | null
          name?: string
          source_type?: string
          status?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          content: string | null
          created_at: string
          id: string
          metadata: Json | null
          read: boolean
          related_id: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          read?: boolean
          related_id?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          content?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          read?: boolean
          related_id?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      passkey_challenges: {
        Row: {
          action: string
          challenge: number[]
          created_at: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          challenge: number[]
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          challenge?: number[]
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          likes_count: number | null
          mentions: Json | null
          parent_comment_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes_count?: number | null
          mentions?: Json | null
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes_count?: number | null
          mentions?: Json | null
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      presence_statuses: {
        Row: {
          description: string | null
          id: string
          is_selectable: boolean | null
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          is_selectable?: boolean | null
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          is_selectable?: boolean | null
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accessibility_needs: string | null
          activism_involvement: string[] | null
          age_range: string | null
          avatar_config: Json | null
          avatar_url: string | null
          background_check: boolean | null
          bdsm_role: string | null
          bio: string | null
          body_type: string | null
          boundaries_and_limits: string[] | null
          causes_supported: string[] | null
          chosen_family_status: string | null
          chosen_name: string | null
          coming_out_status: Json | null
          communication_about_sex: string | null
          communication_preferences: Json | null
          communication_style: string | null
          community_involvement: string[] | null
          community_roles: string[] | null
          company: string | null
          consent_practices: string[] | null
          content_warnings: string[] | null
          created_at: string
          cultural_background: string[] | null
          current_relationship_status: string | null
          date_of_birth: string | null
          dating_preferences: Json | null
          diet_preferences: string[] | null
          disability_status: string | null
          display_name: string | null
          drinking_preference: string | null
          education: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_phone_encrypted: string | null
          emergency_contact_relationship: string | null
          ethnicity: string | null
          exercise_frequency: string | null
          eye_color: string | null
          family_acceptance_level: string | null
          favorite_books: string[] | null
          favorite_movies: string[] | null
          favorite_music_genres: string[] | null
          financial_situation: string | null
          first_name: string | null
          food_preferences: string[] | null
          gender_identity: string | null
          gender_identity_encrypted: string | null
          hair_color: string | null
          has_children: boolean | null
          has_pets: boolean | null
          height_cm: number | null
          hobbies: string[] | null
          housing_situation: string | null
          id: string
          immigration_status: string | null
          income_range: string | null
          income_range_encrypted: string | null
          industry: string | null
          interests: Json | null
          intimacy_preferences: Json | null
          is_business: boolean | null
          is_online: boolean | null
          jealousy_comfort_level: string | null
          job_title: string | null
          kink_experience_level: string | null
          kink_interests: string[] | null
          languages: Json | null
          last_active_at: string | null
          last_name: string | null
          last_seen_at: string | null
          life_philosophy: string | null
          location: string | null
          looking_for: string[] | null
          love_languages: string[] | null
          medication_status: string | null
          mental_health_advocacy: boolean | null
          mental_health_openness: string | null
          mutual_aid_interests: string[] | null
          name_pronunciation: string | null
          neighborhood_preference: string | null
          neurodivergent_status: string | null
          occupation: string | null
          partner_preferences: Json | null
          personality_type: string | null
          pet_preferences: string | null
          phone: string | null
          phone_encrypted: string | null
          physical_affection_preference: string | null
          political_views: string | null
          political_views_encrypted: string | null
          preferences: Json | null
          privacy_settings: Json | null
          profile_completion_percentage: number | null
          pronouns: string | null
          protection_preferences: string[] | null
          relationship_goals: string[] | null
          relationship_goals_detailed: string[] | null
          relationship_status: string | null
          relationship_status_encrypted: string | null
          relationship_structure_preference: string[] | null
          relationship_style: string | null
          religious_beliefs: string | null
          religious_beliefs_encrypted: string | null
          response_time_preference: string | null
          romance_style: string | null
          romantic_orientation: string | null
          safe_space_preferences: string[] | null
          sexual_exploration_openness: string | null
          sexual_frequency_preference: string | null
          sexual_health_status: string | null
          sexual_orientation: string | null
          sexual_orientation_details: Json | null
          sexual_orientation_encrypted: string | null
          sleep_schedule: string | null
          smoking_preference: string | null
          social_links: Json | null
          support_offering: string[] | null
          support_seeking: string[] | null
          therapy_friendly: boolean | null
          transportation_method: string | null
          travel_preferences: Json | null
          updated_at: string
          user_id: string
          user_mode: Database["public"]["Enums"]["user_mode"] | null
          verified_email: boolean | null
          verified_identity: boolean | null
          verified_phone: boolean | null
          volunteer_work: string[] | null
          wants_children: string | null
          website: string | null
          willing_to_relocate: boolean | null
          work_schedule: string | null
          workplace_safety: string | null
          zodiac_sign: string | null
        }
        Insert: {
          accessibility_needs?: string | null
          activism_involvement?: string[] | null
          age_range?: string | null
          avatar_config?: Json | null
          avatar_url?: string | null
          background_check?: boolean | null
          bdsm_role?: string | null
          bio?: string | null
          body_type?: string | null
          boundaries_and_limits?: string[] | null
          causes_supported?: string[] | null
          chosen_family_status?: string | null
          chosen_name?: string | null
          coming_out_status?: Json | null
          communication_about_sex?: string | null
          communication_preferences?: Json | null
          communication_style?: string | null
          community_involvement?: string[] | null
          community_roles?: string[] | null
          company?: string | null
          consent_practices?: string[] | null
          content_warnings?: string[] | null
          created_at?: string
          cultural_background?: string[] | null
          current_relationship_status?: string | null
          date_of_birth?: string | null
          dating_preferences?: Json | null
          diet_preferences?: string[] | null
          disability_status?: string | null
          display_name?: string | null
          drinking_preference?: string | null
          education?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_phone_encrypted?: string | null
          emergency_contact_relationship?: string | null
          ethnicity?: string | null
          exercise_frequency?: string | null
          eye_color?: string | null
          family_acceptance_level?: string | null
          favorite_books?: string[] | null
          favorite_movies?: string[] | null
          favorite_music_genres?: string[] | null
          financial_situation?: string | null
          first_name?: string | null
          food_preferences?: string[] | null
          gender_identity?: string | null
          gender_identity_encrypted?: string | null
          hair_color?: string | null
          has_children?: boolean | null
          has_pets?: boolean | null
          height_cm?: number | null
          hobbies?: string[] | null
          housing_situation?: string | null
          id?: string
          immigration_status?: string | null
          income_range?: string | null
          income_range_encrypted?: string | null
          industry?: string | null
          interests?: Json | null
          intimacy_preferences?: Json | null
          is_business?: boolean | null
          is_online?: boolean | null
          jealousy_comfort_level?: string | null
          job_title?: string | null
          kink_experience_level?: string | null
          kink_interests?: string[] | null
          languages?: Json | null
          last_active_at?: string | null
          last_name?: string | null
          last_seen_at?: string | null
          life_philosophy?: string | null
          location?: string | null
          looking_for?: string[] | null
          love_languages?: string[] | null
          medication_status?: string | null
          mental_health_advocacy?: boolean | null
          mental_health_openness?: string | null
          mutual_aid_interests?: string[] | null
          name_pronunciation?: string | null
          neighborhood_preference?: string | null
          neurodivergent_status?: string | null
          occupation?: string | null
          partner_preferences?: Json | null
          personality_type?: string | null
          pet_preferences?: string | null
          phone?: string | null
          phone_encrypted?: string | null
          physical_affection_preference?: string | null
          political_views?: string | null
          political_views_encrypted?: string | null
          preferences?: Json | null
          privacy_settings?: Json | null
          profile_completion_percentage?: number | null
          pronouns?: string | null
          protection_preferences?: string[] | null
          relationship_goals?: string[] | null
          relationship_goals_detailed?: string[] | null
          relationship_status?: string | null
          relationship_status_encrypted?: string | null
          relationship_structure_preference?: string[] | null
          relationship_style?: string | null
          religious_beliefs?: string | null
          religious_beliefs_encrypted?: string | null
          response_time_preference?: string | null
          romance_style?: string | null
          romantic_orientation?: string | null
          safe_space_preferences?: string[] | null
          sexual_exploration_openness?: string | null
          sexual_frequency_preference?: string | null
          sexual_health_status?: string | null
          sexual_orientation?: string | null
          sexual_orientation_details?: Json | null
          sexual_orientation_encrypted?: string | null
          sleep_schedule?: string | null
          smoking_preference?: string | null
          social_links?: Json | null
          support_offering?: string[] | null
          support_seeking?: string[] | null
          therapy_friendly?: boolean | null
          transportation_method?: string | null
          travel_preferences?: Json | null
          updated_at?: string
          user_id: string
          user_mode?: Database["public"]["Enums"]["user_mode"] | null
          verified_email?: boolean | null
          verified_identity?: boolean | null
          verified_phone?: boolean | null
          volunteer_work?: string[] | null
          wants_children?: string | null
          website?: string | null
          willing_to_relocate?: boolean | null
          work_schedule?: string | null
          workplace_safety?: string | null
          zodiac_sign?: string | null
        }
        Update: {
          accessibility_needs?: string | null
          activism_involvement?: string[] | null
          age_range?: string | null
          avatar_config?: Json | null
          avatar_url?: string | null
          background_check?: boolean | null
          bdsm_role?: string | null
          bio?: string | null
          body_type?: string | null
          boundaries_and_limits?: string[] | null
          causes_supported?: string[] | null
          chosen_family_status?: string | null
          chosen_name?: string | null
          coming_out_status?: Json | null
          communication_about_sex?: string | null
          communication_preferences?: Json | null
          communication_style?: string | null
          community_involvement?: string[] | null
          community_roles?: string[] | null
          company?: string | null
          consent_practices?: string[] | null
          content_warnings?: string[] | null
          created_at?: string
          cultural_background?: string[] | null
          current_relationship_status?: string | null
          date_of_birth?: string | null
          dating_preferences?: Json | null
          diet_preferences?: string[] | null
          disability_status?: string | null
          display_name?: string | null
          drinking_preference?: string | null
          education?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_phone_encrypted?: string | null
          emergency_contact_relationship?: string | null
          ethnicity?: string | null
          exercise_frequency?: string | null
          eye_color?: string | null
          family_acceptance_level?: string | null
          favorite_books?: string[] | null
          favorite_movies?: string[] | null
          favorite_music_genres?: string[] | null
          financial_situation?: string | null
          first_name?: string | null
          food_preferences?: string[] | null
          gender_identity?: string | null
          gender_identity_encrypted?: string | null
          hair_color?: string | null
          has_children?: boolean | null
          has_pets?: boolean | null
          height_cm?: number | null
          hobbies?: string[] | null
          housing_situation?: string | null
          id?: string
          immigration_status?: string | null
          income_range?: string | null
          income_range_encrypted?: string | null
          industry?: string | null
          interests?: Json | null
          intimacy_preferences?: Json | null
          is_business?: boolean | null
          is_online?: boolean | null
          jealousy_comfort_level?: string | null
          job_title?: string | null
          kink_experience_level?: string | null
          kink_interests?: string[] | null
          languages?: Json | null
          last_active_at?: string | null
          last_name?: string | null
          last_seen_at?: string | null
          life_philosophy?: string | null
          location?: string | null
          looking_for?: string[] | null
          love_languages?: string[] | null
          medication_status?: string | null
          mental_health_advocacy?: boolean | null
          mental_health_openness?: string | null
          mutual_aid_interests?: string[] | null
          name_pronunciation?: string | null
          neighborhood_preference?: string | null
          neurodivergent_status?: string | null
          occupation?: string | null
          partner_preferences?: Json | null
          personality_type?: string | null
          pet_preferences?: string | null
          phone?: string | null
          phone_encrypted?: string | null
          physical_affection_preference?: string | null
          political_views?: string | null
          political_views_encrypted?: string | null
          preferences?: Json | null
          privacy_settings?: Json | null
          profile_completion_percentage?: number | null
          pronouns?: string | null
          protection_preferences?: string[] | null
          relationship_goals?: string[] | null
          relationship_goals_detailed?: string[] | null
          relationship_status?: string | null
          relationship_status_encrypted?: string | null
          relationship_structure_preference?: string[] | null
          relationship_style?: string | null
          religious_beliefs?: string | null
          religious_beliefs_encrypted?: string | null
          response_time_preference?: string | null
          romance_style?: string | null
          romantic_orientation?: string | null
          safe_space_preferences?: string[] | null
          sexual_exploration_openness?: string | null
          sexual_frequency_preference?: string | null
          sexual_health_status?: string | null
          sexual_orientation?: string | null
          sexual_orientation_details?: Json | null
          sexual_orientation_encrypted?: string | null
          sleep_schedule?: string | null
          smoking_preference?: string | null
          social_links?: Json | null
          support_offering?: string[] | null
          support_seeking?: string[] | null
          therapy_friendly?: boolean | null
          transportation_method?: string | null
          travel_preferences?: Json | null
          updated_at?: string
          user_id?: string
          user_mode?: Database["public"]["Enums"]["user_mode"] | null
          verified_email?: boolean | null
          verified_identity?: boolean | null
          verified_phone?: boolean | null
          volunteer_work?: string[] | null
          wants_children?: string | null
          website?: string | null
          willing_to_relocate?: boolean | null
          work_schedule?: string | null
          workplace_safety?: string | null
          zodiac_sign?: string | null
        }
        Relationships: []
      }
      push_notification_logs: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          notification_type: string
          sent_at: string | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          notification_type: string
          sent_at?: string | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          notification_type?: string
          sent_at?: string | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      rag_conversations: {
        Row: {
          context_used: Json | null
          created_at: string
          embedding: string | null
          id: string
          query: string
          response: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          context_used?: Json | null
          created_at?: string
          embedding?: string | null
          id?: string
          query: string
          response: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          context_used?: Json | null
          created_at?: string
          embedding?: string | null
          id?: string
          query?: string
          response?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      regions: {
        Row: {
          continent_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          continent_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          continent_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_continent_id_fkey"
            columns: ["continent_id"]
            isOneToOne: false
            referencedRelation: "continents"
            referencedColumns: ["id"]
          },
        ]
      }
      role_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          performed_by: string
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          performed_by: string
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          performed_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          ip_address: unknown | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      session_config: {
        Row: {
          created_at: string
          id: string
          max_concurrent_sessions: number
          require_reauthentication_minutes: number
          timeout_minutes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_concurrent_sessions?: number
          require_reauthentication_minutes?: number
          timeout_minutes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_concurrent_sessions?: number
          require_reauthentication_minutes?: number
          timeout_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      suspicious_activities: {
        Row: {
          activity_type: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown | null
          is_resolved: boolean
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          is_resolved?: boolean
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          is_resolved?: boolean
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tag_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      tag_favorites: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tag_relationships: {
        Row: {
          created_at: string
          id: string
          relationship_type: string
          similarity_score: number
          tag1_id: string
          tag2_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          relationship_type?: string
          similarity_score: number
          tag1_id: string
          tag2_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relationship_type?: string
          similarity_score?: number
          tag1_id?: string
          tag2_id?: string
        }
        Relationships: []
      }
      target_groups: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ui_themes: {
        Row: {
          id: string
          is_dark: boolean | null
          name: string
        }
        Insert: {
          id?: string
          is_dark?: boolean | null
          name: string
        }
        Update: {
          id?: string
          is_dark?: boolean | null
          name?: string
        }
        Relationships: []
      }
      unified_tag_assignments: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          tag_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unified_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_tags: {
        Row: {
          category: string | null
          category_id: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          slug: string
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          slug: string
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_passkeys: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          id: string
          is_revoked: boolean
          last_used_at: string | null
          public_key: string
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          id?: string
          is_revoked?: boolean
          last_used_at?: string | null
          public_key: string
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          id?: string
          is_revoked?: boolean
          last_used_at?: string | null
          public_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_photos: {
        Row: {
          caption: string | null
          content_type: string | null
          created_at: string
          display_order: number | null
          file_size: number | null
          filename: string
          id: string
          is_profile_picture: boolean | null
          is_public: boolean
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          display_order?: number | null
          file_size?: number | null
          filename: string
          id?: string
          is_profile_picture?: boolean | null
          is_public?: boolean
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          content_type?: string | null
          created_at?: string
          display_order?: number | null
          file_size?: number | null
          filename?: string
          id?: string
          is_profile_picture?: boolean | null
          is_public?: boolean
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_relationships: {
        Row: {
          created_at: string
          id: string
          relationship_type: string
          status: string
          target_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          relationship_type: string
          status?: string
          target_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          relationship_type?: string
          status?: string
          target_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_role_audit_log: {
        Row: {
          action_type: string
          admin_user_id: string
          id: string
          role_changed: Database["public"]["Enums"]["app_role"]
          target_user_id: string
          timestamp: string
        }
        Insert: {
          action_type: string
          admin_user_id: string
          id?: string
          role_changed: Database["public"]["Enums"]["app_role"]
          target_user_id: string
          timestamp?: string
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          id?: string
          role_changed?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string
          timestamp?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: unknown | null
          is_active: boolean
          last_activity: string
          session_token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: unknown | null
          is_active?: boolean
          last_activity?: string
          session_token: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: unknown | null
          is_active?: boolean
          last_activity?: string
          session_token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      venue_amenities: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      venue_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      venue_checkins: {
        Row: {
          checked_in_at: string
          created_at: string
          distance_meters: number | null
          id: string
          latitude: number
          longitude: number
          user_id: string
          venue_id: string
        }
        Insert: {
          checked_in_at?: string
          created_at?: string
          distance_meters?: number | null
          id?: string
          latitude: number
          longitude: number
          user_id: string
          venue_id: string
        }
        Update: {
          checked_in_at?: string
          created_at?: string
          distance_meters?: number | null
          id?: string
          latitude?: number
          longitude?: number
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_checkins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_favorites: {
        Row: {
          created_at: string
          id: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      venue_reviews: {
        Row: {
          content: string | null
          created_at: string
          helpful_count: number | null
          id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "venue_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "venue_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "venue_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_services: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      venue_tag_assignments: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_tag_assignments_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          accessibility_attributes: string[] | null
          accessibility_notes: string | null
          address: string
          amenities: string[] | null
          category: string
          city: string
          city_id: string | null
          country: string
          country_id: string | null
          created_at: string
          created_by: string | null
          data_source: string | null
          description: string | null
          email: string | null
          external_id: string | null
          featured: boolean | null
          foursquare_data: Json | null
          foursquare_id: string | null
          foursquare_rating: number | null
          hours: Json | null
          id: string
          images: string[] | null
          instagram: string | null
          last_synced_at: string | null
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          postal_code: string | null
          price_range: number | null
          services: string[] | null
          state: string | null
          sync_status: string | null
          tags: string[] | null
          target_groups: string[] | null
          tomtom_data: Json | null
          tomtom_id: string | null
          tomtom_rating: number | null
          tripadvisor_id: string | null
          tripadvisor_rating: number | null
          tripadvisor_review_count: number | null
          updated_at: string
          verified: boolean | null
          website: string | null
        }
        Insert: {
          accessibility_attributes?: string[] | null
          accessibility_notes?: string | null
          address: string
          amenities?: string[] | null
          category: string
          city: string
          city_id?: string | null
          country?: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          email?: string | null
          external_id?: string | null
          featured?: boolean | null
          foursquare_data?: Json | null
          foursquare_id?: string | null
          foursquare_rating?: number | null
          hours?: Json | null
          id?: string
          images?: string[] | null
          instagram?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          postal_code?: string | null
          price_range?: number | null
          services?: string[] | null
          state?: string | null
          sync_status?: string | null
          tags?: string[] | null
          target_groups?: string[] | null
          tomtom_data?: Json | null
          tomtom_id?: string | null
          tomtom_rating?: number | null
          tripadvisor_id?: string | null
          tripadvisor_rating?: number | null
          tripadvisor_review_count?: number | null
          updated_at?: string
          verified?: boolean | null
          website?: string | null
        }
        Update: {
          accessibility_attributes?: string[] | null
          accessibility_notes?: string | null
          address?: string
          amenities?: string[] | null
          category?: string
          city?: string
          city_id?: string | null
          country?: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          email?: string | null
          external_id?: string | null
          featured?: boolean | null
          foursquare_data?: Json | null
          foursquare_id?: string | null
          foursquare_rating?: number | null
          hours?: Json | null
          id?: string
          images?: string[] | null
          instagram?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          price_range?: number | null
          services?: string[] | null
          state?: string | null
          sync_status?: string | null
          tags?: string[] | null
          target_groups?: string[] | null
          tomtom_data?: Json | null
          tomtom_id?: string | null
          tomtom_rating?: number | null
          tripadvisor_id?: string | null
          tripadvisor_rating?: number | null
          tripadvisor_review_count?: number | null
          updated_at?: string
          verified?: boolean | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      events_public: {
        Row: {
          address: string | null
          age_restriction: string | null
          city: string | null
          country: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string | null
          images: string[] | null
          is_free: boolean | null
          latitude: number | null
          longitude: number | null
          price_max: number | null
          price_min: number | null
          start_date: string | null
          state: string | null
          ticket_url: string | null
          title: string | null
          updated_at: string | null
          venue_id: string | null
          venue_name: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          age_restriction?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string | null
          images?: string[] | null
          is_free?: boolean | null
          latitude?: number | null
          longitude?: number | null
          price_max?: number | null
          price_min?: number | null
          start_date?: string | null
          state?: string | null
          ticket_url?: string | null
          title?: string | null
          updated_at?: string | null
          venue_id?: string | null
          venue_name?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          age_restriction?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string | null
          images?: string[] | null
          is_free?: boolean | null
          latitude?: number | null
          longitude?: number | null
          price_max?: number | null
          price_min?: number | null
          start_date?: string | null
          state?: string | null
          ticket_url?: string | null
          title?: string | null
          updated_at?: string | null
          venue_id?: string | null
          venue_name?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          interests: Json | null
          last_active_at: string | null
          location: string | null
          pronouns: string | null
          user_id: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          interests?: Json | null
          last_active_at?: string | null
          location?: string | null
          pronouns?: string | null
          user_id?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          interests?: Json | null
          last_active_at?: string | null
          location?: string | null
          pronouns?: string | null
          user_id?: string | null
          website?: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          display_name: string | null
          gender_identity: string | null
          location: string | null
          pronouns: string | null
          sexual_orientation: string | null
          social_links: Json | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: never
          display_name?: string | null
          gender_identity?: never
          location?: never
          pronouns?: never
          sexual_orientation?: never
          social_links?: Json | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: never
          display_name?: string | null
          gender_identity?: never
          location?: never
          pronouns?: never
          sexual_orientation?: never
          social_links?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      secure_booking_summary: {
        Row: {
          arrival_airport: string | null
          booking_reference: string | null
          booking_type: string | null
          check_in_date: string | null
          check_out_date: string | null
          created_at: string | null
          currency: string | null
          departure_airport: string | null
          departure_date: string | null
          guests: number | null
          hotel_location: string | null
          hotel_name: string | null
          id: string | null
          passengers: number | null
          payment_method_masked: string | null
          payment_method_type: string | null
          return_date: string | null
          rooms: number | null
          status: string | null
          total_price: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          arrival_airport?: string | null
          booking_reference?: string | null
          booking_type?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          currency?: string | null
          departure_airport?: string | null
          departure_date?: string | null
          guests?: number | null
          hotel_location?: string | null
          hotel_name?: string | null
          id?: string | null
          passengers?: number | null
          payment_method_masked?: never
          payment_method_type?: string | null
          return_date?: string | null
          rooms?: number | null
          status?: string | null
          total_price?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          arrival_airport?: string | null
          booking_reference?: string | null
          booking_type?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          currency?: string | null
          departure_airport?: string | null
          departure_date?: string | null
          guests?: number | null
          hotel_location?: string | null
          hotel_name?: string | null
          id?: string | null
          passengers?: number | null
          payment_method_masked?: never
          payment_method_type?: string | null
          return_date?: string | null
          rooms?: number | null
          status?: string | null
          total_price?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      venue_checkin_stats: {
        Row: {
          activity_level: string | null
          days_with_checkins: number | null
          last_checkin: string | null
          total_checkins: number | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_checkins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      analyze_rls_policy_performance: {
        Args: Record<PropertyKey, never>
        Returns: {
          policy_name: string
          table_name: string
          performance_score: number
          optimization_suggestion: string
        }[]
      }
      assign_admin_by_id: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      assign_first_admin: {
        Args: { user_email: string }
        Returns: boolean
      }
      assign_role: {
        Args: {
          target_user_id: string
          role_to_assign: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      assign_user_role: {
        Args:
          | {
              p_target_user_id: string
              p_role: Database["public"]["Enums"]["app_role"]
            }
          | {
              target_user_id: string
              new_role: Database["public"]["Enums"]["app_role"]
              action_type?: string
            }
        Returns: boolean
      }
      calculate_profile_completion: {
        Args: { user_id_param: string }
        Returns: number
      }
      can_view_sensitive_profile_data: {
        Args:
          | { profile_user_id: string; requesting_user_id: string }
          | {
              profile_user_id: string
              requesting_user_id: string
              privacy_field: string
            }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          identifier: string
          max_attempts?: number
          time_window_minutes?: number
        }
        Returns: boolean
      }
      check_rate_limit_enhanced: {
        Args: {
          identifier: string
          max_attempts?: number
          time_window_minutes?: number
          action_type?: string
        }
        Returns: boolean
      }
      check_rate_limit_key: {
        Args: {
          identifier: string
          max_attempts?: number
          time_window_minutes?: number
        }
        Returns: boolean
      }
      cleanup_expired_bookings: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_expired_passkey_challenges: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_old_cancelled_bookings: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      consolidate_all_multiple_policies: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      consolidate_all_policies: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      consolidate_policies: {
        Args:
          | Record<PropertyKey, never>
          | { p_schema_name: string; p_table_name: string }
        Returns: undefined
      }
      consolidate_rls_policies: {
        Args: {
          p_schema_name: string
          p_table_name: string
          p_role_name: string
          p_action: string
        }
        Returns: undefined
      }
      consolidate_rls_policies_v2: {
        Args: {
          p_schema_name: string
          p_table_name: string
          p_role_name: string
          p_action: string
        }
        Returns: undefined
      }
      consolidate_table_policies: {
        Args:
          | Record<PropertyKey, never>
          | { p_schema_name: string; p_table_name: string }
          | { p_table_name: string; p_role_name: string; p_action: string }
        Returns: undefined
      }
      create_notification: {
        Args: {
          target_user_id: string
          notification_type: string
          notification_title: string
          notification_content?: string
          notification_action_url?: string
          notification_related_id?: string
          notification_metadata?: Json
        }
        Returns: string
      }
      create_tag_relationships_table_if_not_exists: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      decrement_comment_likes: {
        Args: { comment_id: string }
        Returns: undefined
      }
      decrement_post_likes: {
        Args: { post_id: string }
        Returns: undefined
      }
      decrypt_booking_data: {
        Args: { encrypted_data: string; user_salt: string }
        Returns: string
      }
      decrypt_sensitive_data: {
        Args: { encrypted_data: string; user_salt: string }
        Returns: string
      }
      encrypt_booking_data: {
        Args: { data_text: string; user_salt: string }
        Returns: string
      }
      encrypt_sensitive_data: {
        Args: { data_text: string; user_salt: string }
        Returns: string
      }
      examine_table_policies: {
        Args:
          | { p_schema_name: string; p_table_name: string }
          | { table_name_param: string }
        Returns: {
          policy_name: string
          role_names: string[]
          command: string
          using_expression: string
          with_check_expression: string
        }[]
      }
      expire_old_location_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      fix_rls_policies: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      fix_table_rls_policies: {
        Args: { table_name: string }
        Returns: undefined
      }
      generate_optimized_rls_policy: {
        Args:
          | Record<PropertyKey, never>
          | {
              p_schema_name: string
              p_table_name: string
              p_role_name: string
              p_action: string
            }
        Returns: string
      }
      generate_optimized_rls_policy_v2: {
        Args: {
          p_schema_name: string
          p_table_name: string
          p_role_name: string
          p_action: string
        }
        Returns: string
      }
      generate_rls_optimization_report: {
        Args: { p_schema_name?: string }
        Returns: string
      }
      generate_secure_payment_token: {
        Args: { payment_data: Json; user_id: string }
        Returns: string
      }
      generate_table_optimization_script: {
        Args: { p_schema_name: string; p_table_name: string }
        Returns: string
      }
      get_algolia_sync_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          jobname: string
          schedule: string
          active: boolean
        }[]
      }
      get_booking_details: {
        Args: { booking_id: string }
        Returns: Json
      }
      get_entity_attributes: {
        Args:
          | { entity_id_param: string; entity_type_param: string }
          | { entity_type_param: string; entity_id_param: string }
        Returns: {
          attribute_id: string
          attribute_name: string
          attribute_description: string
          attribute_icon: string
          attribute_type: string
          attribute_category: string
        }[]
      }
      get_entity_tags: {
        Args:
          | { entity_id_param: string; entity_type_param: string }
          | { entity_type_param: string; entity_id_param: string }
        Returns: {
          tag_id: string
          tag_name: string
          tag_description: string
          tag_color: string
          category_name: string
        }[]
      }
      get_news_cron_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          jobname: string
          schedule: string
          active: boolean
          jobid: number
        }[]
      }
      get_or_create_direct_conversation: {
        Args: { user1_id: string; user2_id: string }
        Returns: string
      }
      get_or_create_marketplace_category: {
        Args: { category_name: string; parent_category_name?: string }
        Returns: string
      }
      get_table_policies: {
        Args:
          | { p_schema_name: string; p_table_name: string }
          | { table_name_param: string }
        Returns: {
          policy_name: string
          role_name: string
          command: string
          using_expr: string
          with_check_expr: string
        }[]
      }
      get_user_conversation_ids: {
        Args: Record<PropertyKey, never> | { user_id_param: string }
        Returns: {
          conversation_id: string
        }[]
      }
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      identify_missing_rls_indexes: {
        Args: Record<PropertyKey, never> | { p_schema_name?: string }
        Returns: {
          schema_name: string
          table_name: string
          column_name: string
          suggested_index_sql: string
        }[]
      }
      increment_article_views: {
        Args: { article_id: string }
        Returns: undefined
      }
      increment_comment_likes: {
        Args: { comment_id: string }
        Returns: undefined
      }
      increment_listing_views: {
        Args: { listing_id: string }
        Returns: undefined
      }
      increment_post_comments: {
        Args: { post_id: string }
        Returns: undefined
      }
      increment_post_likes: {
        Args: { post_id: string }
        Returns: undefined
      }
      is_conversation_participant: {
        Args:
          | { conversation_id: string }
          | { conversation_id_param: string; user_id_param: string }
          | { p_conversation_id: number; p_user_id: string }
        Returns: boolean
      }
      is_group_member_or_admin: {
        Args: { group_id: string; check_admin?: boolean }
        Returns: boolean
      }
      jwt_claim: {
        Args: { claim: string }
        Returns: string
      }
      list_tables_with_multiple_policies: {
        Args: Record<PropertyKey, never>
        Returns: {
          table_schema: string
          table_name: string
          role_name: string
          action_name: string
          policy_count: number
        }[]
      }
      log_enhanced_security_event: {
        Args: {
          p_event_type: string
          p_user_id: string
          p_metadata?: Json
          p_severity?: string
        }
        Returns: undefined
      }
      log_security_event: {
        Args:
          | { event_type: string; user_id_param: string; details?: Json }
          | {
              event_type: string
              user_id_param: string
              ip_address_param?: unknown
              user_agent_param?: string
              details?: Json
            }
        Returns: undefined
      }
      match_content_embeddings: {
        Args: {
          query_embedding: string
          similarity_threshold?: number
          match_count?: number
        }
        Returns: {
          content_id: string
          content_type: string
          content_text: string
          metadata: Json
          similarity: number
        }[]
      }
      optimize_auth_uid_in_policies: {
        Args: { p_schema_name?: string }
        Returns: {
          table_name: string
          policy_name: string
          original_definition: string
          optimized_definition: string
        }[]
      }
      optimize_auth_uid_in_policy: {
        Args: {
          p_schema_name: string
          p_table_name: string
          p_policy_name: string
        }
        Returns: string
      }
      refresh_dashboard_stats: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      revoke_role: {
        Args: {
          target_user_id: string
          role_to_revoke: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      sanitize_payment_data: {
        Args: { traveler_data: Json }
        Returns: Json
      }
      schedule_privacy_cleanup: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      secure_assign_user_role: {
        Args: {
          p_target_user_id: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      validate_content_security: {
        Args: { content: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      user_mode:
        | "dating"
        | "friends"
        | "exploration"
        | "fun"
        | "networking"
        | "community"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      user_mode: [
        "dating",
        "friends",
        "exploration",
        "fun",
        "networking",
        "community",
      ],
    },
  },
} as const
