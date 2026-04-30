export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      _cleanup_personalities_2026_04_26: {
        Row: {
          bio: string | null
          birth_date: string | null
          classification: string | null
          death_date: string | null
          description: string | null
          disposition: string | null
          external_ids: Json | null
          image_url: string | null
          name: string | null
          normalized_data: Json | null
          personality_id: string | null
          profession: string | null
          raw_data: Json | null
          slug: string | null
          staged_at: string | null
          staging_id: string | null
          tags: string[] | null
          wikidata_qid: string | null
        }
        Insert: {
          bio?: string | null
          birth_date?: string | null
          classification?: string | null
          death_date?: string | null
          description?: string | null
          disposition?: string | null
          external_ids?: Json | null
          image_url?: string | null
          name?: string | null
          normalized_data?: Json | null
          personality_id?: string | null
          profession?: string | null
          raw_data?: Json | null
          slug?: string | null
          staged_at?: string | null
          staging_id?: string | null
          tags?: string[] | null
          wikidata_qid?: string | null
        }
        Update: {
          bio?: string | null
          birth_date?: string | null
          classification?: string | null
          death_date?: string | null
          description?: string | null
          disposition?: string | null
          external_ids?: Json | null
          image_url?: string | null
          name?: string | null
          normalized_data?: Json | null
          personality_id?: string | null
          profession?: string | null
          raw_data?: Json | null
          slug?: string | null
          staged_at?: string | null
          staging_id?: string | null
          tags?: string[] | null
          wikidata_qid?: string | null
        }
        Relationships: []
      }
      _geonames_stage: {
        Row: {
          asciiname: string | null
          cc: string | null
          country_id: string | null
          geoid: string | null
          lat: number | null
          lng: number | null
          name: string | null
          pop: number | null
          tz: string | null
        }
        Insert: {
          asciiname?: string | null
          cc?: string | null
          country_id?: string | null
          geoid?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          pop?: number | null
          tz?: string | null
        }
        Update: {
          asciiname?: string | null
          cc?: string | null
          country_id?: string | null
          geoid?: string | null
          lat?: number | null
          lng?: number | null
          name?: string | null
          pop?: number | null
          tz?: string | null
        }
        Relationships: []
      }
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
      admin_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          encrypted_key: string
          id: string
          is_active: boolean
          key_name: string
          last_used_at: string | null
          service_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          encrypted_key: string
          id?: string
          is_active?: boolean
          key_name: string
          last_used_at?: string | null
          service_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          encrypted_key?: string
          id?: string
          is_active?: boolean
          key_name?: string
          last_used_at?: string | null
          service_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_edit_log: {
        Row: {
          after_data: Json
          before_data: Json
          changed_fields: string[]
          content_id: string
          content_type: string
          created_at: string
          editor_id: string
          id: string
        }
        Insert: {
          after_data: Json
          before_data: Json
          changed_fields?: string[]
          content_id: string
          content_type: string
          created_at?: string
          editor_id: string
          id?: string
        }
        Update: {
          after_data?: Json
          before_data?: Json
          changed_fields?: string[]
          content_id?: string
          content_type?: string
          created_at?: string
          editor_id?: string
          id?: string
        }
        Relationships: []
      }
      affiliate_partners: {
        Row: {
          created_at: string
          domains: string[]
          enabled: boolean
          id: string
          notes: string | null
          parameters: Json
          partner_name: string
          provider_type: string | null
          redirect_template: string | null
          search_api_key_env: string | null
          search_api_url: string | null
          supports_in_app: boolean | null
          updated_at: string
          url_patterns: string[] | null
          vertical: string | null
        }
        Insert: {
          created_at?: string
          domains?: string[]
          enabled?: boolean
          id?: string
          notes?: string | null
          parameters?: Json
          partner_name: string
          provider_type?: string | null
          redirect_template?: string | null
          search_api_key_env?: string | null
          search_api_url?: string | null
          supports_in_app?: boolean | null
          updated_at?: string
          url_patterns?: string[] | null
          vertical?: string | null
        }
        Update: {
          created_at?: string
          domains?: string[]
          enabled?: boolean
          id?: string
          notes?: string | null
          parameters?: Json
          partner_name?: string
          provider_type?: string | null
          redirect_template?: string | null
          search_api_key_env?: string | null
          search_api_url?: string | null
          supports_in_app?: boolean | null
          updated_at?: string
          url_patterns?: string[] | null
          vertical?: string | null
        }
        Relationships: []
      }
      airports: {
        Row: {
          city_iata: string | null
          city_name: string | null
          country_code: string | null
          created_at: string | null
          iata_code: string
          is_major: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
        }
        Insert: {
          city_iata?: string | null
          city_name?: string | null
          country_code?: string | null
          created_at?: string | null
          iata_code: string
          is_major?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
        }
        Update: {
          city_iata?: string | null
          city_name?: string | null
          country_code?: string | null
          created_at?: string | null
          iata_code?: string
          is_major?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
        }
        Relationships: []
      }
      alert_integrations: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          kind: string
          last_error: string | null
          last_triggered_at: string | null
          min_severity: string
          name: string
          total_sent: number
          updated_at: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          kind: string
          last_error?: string | null
          last_triggered_at?: string | null
          min_severity?: string
          name: string
          total_sent?: number
          updated_at?: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          kind?: string
          last_error?: string | null
          last_triggered_at?: string | null
          min_severity?: string
          name?: string
          total_sent?: number
          updated_at?: string
          webhook_url?: string
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
      api_circuit_breakers: {
        Row: {
          api_name: string
          created_at: string | null
          failure_count: number | null
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          open_until: string | null
          reset_timeout_seconds: number | null
          state: string
          success_count: number | null
          threshold: number | null
          updated_at: string | null
        }
        Insert: {
          api_name: string
          created_at?: string | null
          failure_count?: number | null
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          open_until?: string | null
          reset_timeout_seconds?: number | null
          state?: string
          success_count?: number | null
          threshold?: number | null
          updated_at?: string | null
        }
        Update: {
          api_name?: string
          created_at?: string | null
          failure_count?: number | null
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          open_until?: string | null
          reset_timeout_seconds?: number | null
          state?: string
          success_count?: number | null
          threshold?: number | null
          updated_at?: string | null
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
      audio_files: {
        Row: {
          album: string | null
          artist: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          metadata: Json | null
          original_filename: string
          poster_image_path: string | null
          processing_job_id: string | null
          status: string
          storage_path: string
          title: string
          transcript_path: string | null
          updated_at: string
        }
        Insert: {
          album?: string | null
          artist?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          original_filename: string
          poster_image_path?: string | null
          processing_job_id?: string | null
          status?: string
          storage_path: string
          title: string
          transcript_path?: string | null
          updated_at?: string
        }
        Update: {
          album?: string | null
          artist?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          original_filename?: string
          poster_image_path?: string | null
          processing_job_id?: string | null
          status?: string
          storage_path?: string
          title?: string
          transcript_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audio_processing_jobs: {
        Row: {
          audio_id: string
          completed_at: string | null
          completed_renditions: number | null
          created_at: string
          current_stage: string | null
          error_message: string | null
          id: string
          processing_config: Json
          progress_percent: number | null
          started_at: string | null
          status: string
          total_renditions: number | null
          updated_at: string
        }
        Insert: {
          audio_id: string
          completed_at?: string | null
          completed_renditions?: number | null
          created_at?: string
          current_stage?: string | null
          error_message?: string | null
          id?: string
          processing_config?: Json
          progress_percent?: number | null
          started_at?: string | null
          status?: string
          total_renditions?: number | null
          updated_at?: string
        }
        Update: {
          audio_id?: string
          completed_at?: string | null
          completed_renditions?: number | null
          created_at?: string
          current_stage?: string | null
          error_message?: string | null
          id?: string
          processing_config?: Json
          progress_percent?: number | null
          started_at?: string | null
          status?: string
          total_renditions?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_processing_jobs_audio_id_fkey"
            columns: ["audio_id"]
            isOneToOne: false
            referencedRelation: "audio_files"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_renditions: {
        Row: {
          audio_id: string
          bitrate_kbps: number | null
          codec: string
          container: string
          created_at: string
          file_path: string
          file_size: number
          format: string
          id: string
        }
        Insert: {
          audio_id: string
          bitrate_kbps?: number | null
          codec: string
          container: string
          created_at?: string
          file_path: string
          file_size: number
          format: string
          id?: string
        }
        Update: {
          audio_id?: string
          bitrate_kbps?: number | null
          codec?: string
          container?: string
          created_at?: string
          file_path?: string
          file_size?: number
          format?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_renditions_audio_id_fkey"
            columns: ["audio_id"]
            isOneToOne: false
            referencedRelation: "audio_files"
            referencedColumns: ["id"]
          },
        ]
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
      automated_review_rules: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          last_run_at: string | null
          rule_name: string
          rule_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          rule_name: string
          rule_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          rule_name?: string
          rule_type?: string
        }
        Relationships: []
      }
      automation_modules: {
        Row: {
          auto_approve_threshold: number | null
          batch_size: number | null
          config: Json | null
          content_types: string[]
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          is_enabled: boolean | null
          last_run_at: string | null
          last_run_status: string | null
          module_type: string
          rate_limit_per_hour: number | null
          slug: string
          total_changes_applied: number | null
          total_changes_proposed: number | null
          total_runs: number | null
          updated_at: string | null
          workflow_definition_id: string | null
        }
        Insert: {
          auto_approve_threshold?: number | null
          batch_size?: number | null
          config?: Json | null
          content_types?: string[]
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_enabled?: boolean | null
          last_run_at?: string | null
          last_run_status?: string | null
          module_type: string
          rate_limit_per_hour?: number | null
          slug: string
          total_changes_applied?: number | null
          total_changes_proposed?: number | null
          total_runs?: number | null
          updated_at?: string | null
          workflow_definition_id?: string | null
        }
        Update: {
          auto_approve_threshold?: number | null
          batch_size?: number | null
          config?: Json | null
          content_types?: string[]
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_enabled?: boolean | null
          last_run_at?: string | null
          last_run_status?: string | null
          module_type?: string
          rate_limit_per_hour?: number | null
          slug?: string
          total_changes_applied?: number | null
          total_changes_proposed?: number | null
          total_runs?: number | null
          updated_at?: string | null
          workflow_definition_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_modules_workflow_definition_id_fkey"
            columns: ["workflow_definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          auto_fix: boolean | null
          content_type: string
          created_at: string | null
          description: string | null
          field_name: string
          id: string
          is_enabled: boolean | null
          module_id: string
          name: string
          rule_config: Json | null
          rule_type: string
          severity: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          auto_fix?: boolean | null
          content_type: string
          created_at?: string | null
          description?: string | null
          field_name: string
          id?: string
          is_enabled?: boolean | null
          module_id: string
          name: string
          rule_config?: Json | null
          rule_type: string
          severity?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_fix?: boolean | null
          content_type?: string
          created_at?: string | null
          description?: string | null
          field_name?: string
          id?: string
          is_enabled?: boolean | null
          module_id?: string
          name?: string
          rule_config?: Json | null
          rule_type?: string
          severity?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "automation_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_run_log: {
        Row: {
          changes_auto_approved: number | null
          changes_pending_review: number | null
          changes_proposed: number | null
          content_type: string | null
          created_at: string | null
          duration_ms: number | null
          errors: number | null
          id: string
          items_scanned: number | null
          module_id: string
          run_config: Json | null
          workflow_run_id: string | null
        }
        Insert: {
          changes_auto_approved?: number | null
          changes_pending_review?: number | null
          changes_proposed?: number | null
          content_type?: string | null
          created_at?: string | null
          duration_ms?: number | null
          errors?: number | null
          id?: string
          items_scanned?: number | null
          module_id: string
          run_config?: Json | null
          workflow_run_id?: string | null
        }
        Update: {
          changes_auto_approved?: number | null
          changes_pending_review?: number | null
          changes_proposed?: number | null
          content_type?: string | null
          created_at?: string | null
          duration_ms?: number | null
          errors?: number | null
          id?: string
          items_scanned?: number | null
          module_id?: string
          run_config?: Json | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_run_log_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "automation_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_run_log_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      boundaries: {
        Row: {
          bbox: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          geometry_geojson: Json
          id: string
          precision: string
          source: string
          source_id: string | null
          updated_at: string
          vertex_count: number | null
        }
        Insert: {
          bbox?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          geometry_geojson: Json
          id?: string
          precision?: string
          source?: string
          source_id?: string | null
          updated_at?: string
          vertex_count?: number | null
        }
        Update: {
          bbox?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          geometry_geojson?: Json
          id?: string
          precision?: string
          source?: string
          source_id?: string | null
          updated_at?: string
          vertex_count?: number | null
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
          canonical_key: string | null
          climate_type: string | null
          cost_of_living: Json | null
          country_id: string
          created_at: string
          curated_image_url: string | null
          data_source: string | null
          demographics: Json | null
          description: string | null
          duplicate_of_id: string | null
          economy_sectors: string[] | null
          elevation_m: number | null
          founded_year: number | null
          id: string
          image_flagged: boolean
          image_metadata: Json | null
          image_url: string | null
          is_capital: boolean | null
          is_major_city: boolean | null
          last_refreshed_at: string | null
          last_synced_at: string | null
          latitude: number | null
          lgbt_friendly_rating: number | null
          local_customs: string | null
          local_language: string | null
          longitude: number | null
          major_airport_code: string | null
          mayor: string | null
          name: string
          name_de: string | null
          name_en: string | null
          name_normalized: string | null
          notable_landmarks: string[] | null
          official_website: string | null
          population: number | null
          postal_codes: string[] | null
          region_name: string | null
          sister_cities: string[] | null
          slug: string
          timezone: string | null
          transportation_info: Json | null
          universities: string[] | null
          updated_at: string
          wolfram_enriched_at: string | null
        }
        Insert: {
          airport_codes?: string[] | null
          area_codes?: string[] | null
          area_km2?: number | null
          best_time_to_visit?: string | null
          canonical_key?: string | null
          climate_type?: string | null
          cost_of_living?: Json | null
          country_id: string
          created_at?: string
          curated_image_url?: string | null
          data_source?: string | null
          demographics?: Json | null
          description?: string | null
          duplicate_of_id?: string | null
          economy_sectors?: string[] | null
          elevation_m?: number | null
          founded_year?: number | null
          id?: string
          image_flagged?: boolean
          image_metadata?: Json | null
          image_url?: string | null
          is_capital?: boolean | null
          is_major_city?: boolean | null
          last_refreshed_at?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          lgbt_friendly_rating?: number | null
          local_customs?: string | null
          local_language?: string | null
          longitude?: number | null
          major_airport_code?: string | null
          mayor?: string | null
          name: string
          name_de?: string | null
          name_en?: string | null
          name_normalized?: string | null
          notable_landmarks?: string[] | null
          official_website?: string | null
          population?: number | null
          postal_codes?: string[] | null
          region_name?: string | null
          sister_cities?: string[] | null
          slug: string
          timezone?: string | null
          transportation_info?: Json | null
          universities?: string[] | null
          updated_at?: string
          wolfram_enriched_at?: string | null
        }
        Update: {
          airport_codes?: string[] | null
          area_codes?: string[] | null
          area_km2?: number | null
          best_time_to_visit?: string | null
          canonical_key?: string | null
          climate_type?: string | null
          cost_of_living?: Json | null
          country_id?: string
          created_at?: string
          curated_image_url?: string | null
          data_source?: string | null
          demographics?: Json | null
          description?: string | null
          duplicate_of_id?: string | null
          economy_sectors?: string[] | null
          elevation_m?: number | null
          founded_year?: number | null
          id?: string
          image_flagged?: boolean
          image_metadata?: Json | null
          image_url?: string | null
          is_capital?: boolean | null
          is_major_city?: boolean | null
          last_refreshed_at?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          lgbt_friendly_rating?: number | null
          local_customs?: string | null
          local_language?: string | null
          longitude?: number | null
          major_airport_code?: string | null
          mayor?: string | null
          name?: string
          name_de?: string | null
          name_en?: string | null
          name_normalized?: string | null
          notable_landmarks?: string[] | null
          official_website?: string | null
          population?: number | null
          postal_codes?: string[] | null
          region_name?: string | null
          sister_cities?: string[] | null
          slug?: string
          timezone?: string | null
          transportation_info?: Json | null
          universities?: string[] | null
          updated_at?: string
          wolfram_enriched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cities_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cities_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
        ]
      }
      city_aliases: {
        Row: {
          alias: string
          alias_key: string | null
          city_id: string
          created_at: string
          id: string
          locale: string | null
        }
        Insert: {
          alias: string
          alias_key?: string | null
          city_id: string
          created_at?: string
          id?: string
          locale?: string | null
        }
        Update: {
          alias?: string
          alias_key?: string | null
          city_id?: string
          created_at?: string
          id?: string
          locale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "city_aliases_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "city_aliases_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
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
      cms_ai_cache: {
        Row: {
          cache_key: string
          content_type: string
          created_at: string
          locale: string
          op: string
          output: Json
          record_id: string
        }
        Insert: {
          cache_key: string
          content_type: string
          created_at?: string
          locale?: string
          op: string
          output: Json
          record_id: string
        }
        Update: {
          cache_key?: string
          content_type?: string
          created_at?: string
          locale?: string
          op?: string
          output?: Json
          record_id?: string
        }
        Relationships: []
      }
      cms_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          content_id: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          source_id: string | null
          source_table: string | null
          timestamp: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          content_id?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          source_id?: string | null
          source_table?: string | null
          timestamp?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          content_id?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          source_id?: string | null
          source_table?: string | null
          timestamp?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_audit_log_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "cms_content"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_connectors: {
        Row: {
          config: Json
          connector_type: string
          created_at: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          config?: Json
          connector_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          config?: Json
          connector_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      cms_content: {
        Row: {
          body_html: string | null
          body_json: Json | null
          content_data: Json
          content_type: Database["public"]["Enums"]["cms_content_type"]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: Json | null
          external_ids: Json | null
          featured_weight: number | null
          id: string
          meta_description: Json | null
          meta_title: Json | null
          published_at: string | null
          published_by: string | null
          slug: string
          source_metadata: Json | null
          tags: string[] | null
          title: Json
          updated_at: string
          updated_by: string | null
          visibility_level: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Insert: {
          body_html?: string | null
          body_json?: Json | null
          content_data?: Json
          content_type: Database["public"]["Enums"]["cms_content_type"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: Json | null
          external_ids?: Json | null
          featured_weight?: number | null
          id?: string
          meta_description?: Json | null
          meta_title?: Json | null
          published_at?: string | null
          published_by?: string | null
          slug: string
          source_metadata?: Json | null
          tags?: string[] | null
          title?: Json
          updated_at?: string
          updated_by?: string | null
          visibility_level?: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state?: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Update: {
          body_html?: string | null
          body_json?: Json | null
          content_data?: Json
          content_type?: Database["public"]["Enums"]["cms_content_type"]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: Json | null
          external_ids?: Json | null
          featured_weight?: number | null
          id?: string
          meta_description?: Json | null
          meta_title?: Json | null
          published_at?: string | null
          published_by?: string | null
          slug?: string
          source_metadata?: Json | null
          tags?: string[] | null
          title?: Json
          updated_at?: string
          updated_by?: string | null
          visibility_level?: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state?: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Relationships: []
      }
      cms_content_media: {
        Row: {
          content_id: string
          created_at: string
          id: string
          media_id: string
          media_role: Database["public"]["Enums"]["cms_media_role"]
          metadata: Json | null
          sort_order: number | null
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          media_id: string
          media_role?: Database["public"]["Enums"]["cms_media_role"]
          metadata?: Json | null
          sort_order?: number | null
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          media_id?: string
          media_role?: Database["public"]["Enums"]["cms_media_role"]
          metadata?: Json | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_content_media_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "cms_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_content_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "cms_media"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_content_metadata: {
        Row: {
          canonical_url: string | null
          created_at: string
          editor_notes: string | null
          id: string
          last_edited_at: string | null
          last_edited_by: string | null
          locked_at: string | null
          locked_by: string | null
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          published_by: string | null
          scheduled_publish_at: string | null
          scheduled_unpublish_at: string | null
          source_id: string
          source_table: string
          updated_at: string
          visibility_level: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          editor_notes?: string | null
          id?: string
          last_edited_at?: string | null
          last_edited_by?: string | null
          locked_at?: string | null
          locked_by?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          published_by?: string | null
          scheduled_publish_at?: string | null
          scheduled_unpublish_at?: string | null
          source_id: string
          source_table: string
          updated_at?: string
          visibility_level?: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state?: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          editor_notes?: string | null
          id?: string
          last_edited_at?: string | null
          last_edited_by?: string | null
          locked_at?: string | null
          locked_by?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          published_by?: string | null
          scheduled_publish_at?: string | null
          scheduled_unpublish_at?: string | null
          source_id?: string
          source_table?: string
          updated_at?: string
          visibility_level?: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state?: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Relationships: []
      }
      cms_content_relationships: {
        Row: {
          created_at: string
          created_by: string | null
          from_content_id: string
          id: string
          relationship_type: string
          role_metadata: Json | null
          sort_order: number | null
          to_content_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_content_id: string
          id?: string
          relationship_type: string
          role_metadata?: Json | null
          sort_order?: number | null
          to_content_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_content_id?: string
          id?: string
          relationship_type?: string
          role_metadata?: Json | null
          sort_order?: number | null
          to_content_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_content_relationships_from_content_id_fkey"
            columns: ["from_content_id"]
            isOneToOne: false
            referencedRelation: "cms_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_content_relationships_to_content_id_fkey"
            columns: ["to_content_id"]
            isOneToOne: false
            referencedRelation: "cms_content"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_content_revisions: {
        Row: {
          change_summary: string | null
          content_data: Json
          content_id: string
          created_at: string
          created_by: string | null
          description: Json | null
          id: string
          meta_description: Json | null
          meta_title: Json | null
          revision_number: number
          tags: string[] | null
          title: Json
          visibility_level: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Insert: {
          change_summary?: string | null
          content_data: Json
          content_id: string
          created_at?: string
          created_by?: string | null
          description?: Json | null
          id?: string
          meta_description?: Json | null
          meta_title?: Json | null
          revision_number: number
          tags?: string[] | null
          title: Json
          visibility_level: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Update: {
          change_summary?: string | null
          content_data?: Json
          content_id?: string
          created_at?: string
          created_by?: string | null
          description?: Json | null
          id?: string
          meta_description?: Json | null
          meta_title?: Json | null
          revision_number?: number
          tags?: string[] | null
          title?: Json
          visibility_level?: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state?: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Relationships: [
          {
            foreignKeyName: "cms_content_revisions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "cms_content"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_duplicate_candidates: {
        Row: {
          content_id_1: string
          content_id_2: string
          created_at: string
          decision_reason: string | null
          id: string
          matching_criteria: Json
          reviewed_at: string | null
          reviewed_by: string | null
          similarity_score: number
          status: string
        }
        Insert: {
          content_id_1: string
          content_id_2: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          matching_criteria?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity_score: number
          status?: string
        }
        Update: {
          content_id_1?: string
          content_id_2?: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          matching_criteria?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          similarity_score?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_duplicate_candidates_content_id_1_fkey"
            columns: ["content_id_1"]
            isOneToOne: false
            referencedRelation: "cms_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_duplicate_candidates_content_id_2_fkey"
            columns: ["content_id_2"]
            isOneToOne: false
            referencedRelation: "cms_content"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_media: {
        Row: {
          alt_text: Json | null
          attribution: string | null
          author: string | null
          caption: Json | null
          created_at: string
          external_id: string | null
          external_source: string | null
          file_size: number
          filename: string
          height: number | null
          id: string
          license: string | null
          mime_type: string
          original_filename: string
          source_url: string | null
          storage_path: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: Json | null
          attribution?: string | null
          author?: string | null
          caption?: Json | null
          created_at?: string
          external_id?: string | null
          external_source?: string | null
          file_size: number
          filename: string
          height?: number | null
          id?: string
          license?: string | null
          mime_type: string
          original_filename: string
          source_url?: string | null
          storage_path: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: Json | null
          attribution?: string | null
          author?: string | null
          caption?: Json | null
          created_at?: string
          external_id?: string | null
          external_source?: string | null
          file_size?: number
          filename?: string
          height?: number | null
          id?: string
          license?: string | null
          mime_type?: string
          original_filename?: string
          source_url?: string | null
          storage_path?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: []
      }
      cms_media_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          media_id: string
          media_role: Database["public"]["Enums"]["cms_media_role"]
          metadata: Json | null
          sort_order: number | null
          source_id: string
          source_table: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          media_id: string
          media_role?: Database["public"]["Enums"]["cms_media_role"]
          metadata?: Json | null
          sort_order?: number | null
          source_id: string
          source_table: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          media_id?: string
          media_role?: Database["public"]["Enums"]["cms_media_role"]
          metadata?: Json | null
          sort_order?: number | null
          source_id?: string
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_media_attachments_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "cms_media"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          author_id: string | null
          body_html: string | null
          body_json: Json | null
          canonical_url: string | null
          category: string | null
          cover_image_alt: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          page_type: string
          parent_slug: string | null
          published_at: string | null
          published_by: string | null
          scheduled_publish_at: string | null
          slug: string
          subtitle: string | null
          tags: string[] | null
          title: string
          updated_at: string
          updated_by: string | null
          visibility_level: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Insert: {
          author_id?: string | null
          body_html?: string | null
          body_json?: Json | null
          canonical_url?: string | null
          category?: string | null
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          page_type?: string
          parent_slug?: string | null
          published_at?: string | null
          published_by?: string | null
          scheduled_publish_at?: string | null
          slug: string
          subtitle?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          updated_by?: string | null
          visibility_level?: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state?: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Update: {
          author_id?: string | null
          body_html?: string | null
          body_json?: Json | null
          canonical_url?: string | null
          category?: string | null
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          page_type?: string
          parent_slug?: string | null
          published_at?: string | null
          published_by?: string | null
          scheduled_publish_at?: string | null
          slug?: string
          subtitle?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          visibility_level?: Database["public"]["Enums"]["cms_visibility_level"]
          workflow_state?: Database["public"]["Enums"]["cms_workflow_state"]
        }
        Relationships: [
          {
            foreignKeyName: "cms_pages_parent_slug_fk"
            columns: ["parent_slug"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["slug"]
          },
        ]
      }
      cms_review_comments: {
        Row: {
          body: string
          comment_type: string
          created_at: string
          created_by: string | null
          id: string
          parent_comment_id: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          revision_id: string | null
          source_id: string
          source_table: string
          updated_at: string
        }
        Insert: {
          body: string
          comment_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_comment_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          revision_id?: string | null
          source_id: string
          source_table: string
          updated_at?: string
        }
        Update: {
          body?: string
          comment_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_comment_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          revision_id?: string | null
          source_id?: string
          source_table?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_review_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "cms_review_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_review_comments_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "cms_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_review_queue: {
        Row: {
          assigned_to: string | null
          content_id: string
          created_at: string
          id: string
          metadata: Json | null
          notes: string | null
          priority: number | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_type: string
        }
        Insert: {
          assigned_to?: string | null
          content_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          priority?: number | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_type: string
        }
        Update: {
          assigned_to?: string | null
          content_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          priority?: number | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_review_queue_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "cms_content"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_revisions: {
        Row: {
          change_summary: string | null
          changes: Json | null
          created_at: string
          created_by: string | null
          id: string
          revision_number: number
          snapshot: Json
          source_id: string
          source_table: string
          workflow_state:
            | Database["public"]["Enums"]["cms_workflow_state"]
            | null
        }
        Insert: {
          change_summary?: string | null
          changes?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          revision_number: number
          snapshot: Json
          source_id: string
          source_table: string
          workflow_state?:
            | Database["public"]["Enums"]["cms_workflow_state"]
            | null
        }
        Update: {
          change_summary?: string | null
          changes?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          revision_number?: number
          snapshot?: Json
          source_id?: string
          source_table?: string
          workflow_state?:
            | Database["public"]["Enums"]["cms_workflow_state"]
            | null
        }
        Relationships: []
      }
      cms_scheduled_publish: {
        Row: {
          action: string
          content_id: string
          content_type: string
          created_at: string
          created_by: string | null
          error: string | null
          executed_at: string | null
          id: string
          scheduled_at: string
          status: string
        }
        Insert: {
          action: string
          content_id: string
          content_type: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          scheduled_at: string
          status?: string
        }
        Update: {
          action?: string
          content_id?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          scheduled_at?: string
          status?: string
        }
        Relationships: []
      }
      cms_sync_jobs: {
        Row: {
          completed_at: string | null
          connector_id: string
          created_at: string
          error_log: Json | null
          id: string
          items_failed: number | null
          items_synced: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          connector_id: string
          created_at?: string
          error_log?: Json | null
          id?: string
          items_failed?: number | null
          items_synced?: number | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          connector_id?: string
          created_at?: string
          error_log?: Json | null
          id?: string
          items_failed?: number | null
          items_synced?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_sync_jobs_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "cms_connectors"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      community_submissions: {
        Row: {
          assignee_id: string | null
          confidence_score: number | null
          content_type: string
          data: Json
          duplicate_of: string | null
          embedding: string | null
          feedback_status: string
          fingerprint: string | null
          flyer_scan_id: string | null
          forwarded_at: string | null
          github_issue_number: number | null
          github_issue_url: string | null
          github_last_synced_at: string | null
          id: string
          ip_address: unknown
          is_spam: boolean
          labels: string[]
          last_seen_at: string | null
          media_processing_errors: Json | null
          media_processing_status: string | null
          media_storage_paths: string[] | null
          media_urls: string[] | null
          notify_submitter: boolean
          occurrence_count: number
          ocr_text: string | null
          permission_level: string | null
          platform: string | null
          priority: number
          promoted_to_id: string | null
          promoted_to_table: string | null
          queer_relevance_score: number | null
          raw_html: string | null
          raw_json: Json | null
          raw_text: string | null
          resolution: string | null
          resolved_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          safety_flags: Json | null
          screenshot_paths: string[] | null
          sensitivity_level: string | null
          source_url: string | null
          status: string
          sub_source_type: string | null
          submitted_at: string
          submitted_by: string | null
          submitter_metadata: Json | null
          transcript_text: string | null
          user_agent: string | null
          vision_summary: string | null
        }
        Insert: {
          assignee_id?: string | null
          confidence_score?: number | null
          content_type: string
          data?: Json
          duplicate_of?: string | null
          embedding?: string | null
          feedback_status?: string
          fingerprint?: string | null
          flyer_scan_id?: string | null
          forwarded_at?: string | null
          github_issue_number?: number | null
          github_issue_url?: string | null
          github_last_synced_at?: string | null
          id?: string
          ip_address?: unknown
          is_spam?: boolean
          labels?: string[]
          last_seen_at?: string | null
          media_processing_errors?: Json | null
          media_processing_status?: string | null
          media_storage_paths?: string[] | null
          media_urls?: string[] | null
          notify_submitter?: boolean
          occurrence_count?: number
          ocr_text?: string | null
          permission_level?: string | null
          platform?: string | null
          priority?: number
          promoted_to_id?: string | null
          promoted_to_table?: string | null
          queer_relevance_score?: number | null
          raw_html?: string | null
          raw_json?: Json | null
          raw_text?: string | null
          resolution?: string | null
          resolved_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          safety_flags?: Json | null
          screenshot_paths?: string[] | null
          sensitivity_level?: string | null
          source_url?: string | null
          status?: string
          sub_source_type?: string | null
          submitted_at?: string
          submitted_by?: string | null
          submitter_metadata?: Json | null
          transcript_text?: string | null
          user_agent?: string | null
          vision_summary?: string | null
        }
        Update: {
          assignee_id?: string | null
          confidence_score?: number | null
          content_type?: string
          data?: Json
          duplicate_of?: string | null
          embedding?: string | null
          feedback_status?: string
          fingerprint?: string | null
          flyer_scan_id?: string | null
          forwarded_at?: string | null
          github_issue_number?: number | null
          github_issue_url?: string | null
          github_last_synced_at?: string | null
          id?: string
          ip_address?: unknown
          is_spam?: boolean
          labels?: string[]
          last_seen_at?: string | null
          media_processing_errors?: Json | null
          media_processing_status?: string | null
          media_storage_paths?: string[] | null
          media_urls?: string[] | null
          notify_submitter?: boolean
          occurrence_count?: number
          ocr_text?: string | null
          permission_level?: string | null
          platform?: string | null
          priority?: number
          promoted_to_id?: string | null
          promoted_to_table?: string | null
          queer_relevance_score?: number | null
          raw_html?: string | null
          raw_json?: Json | null
          raw_text?: string | null
          resolution?: string | null
          resolved_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          safety_flags?: Json | null
          screenshot_paths?: string[] | null
          sensitivity_level?: string | null
          source_url?: string | null
          status?: string
          sub_source_type?: string | null
          submitted_at?: string
          submitted_by?: string | null
          submitter_metadata?: Json | null
          transcript_text?: string | null
          user_agent?: string | null
          vision_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_submissions_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "community_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_submissions_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "v_api_error_daily"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "community_submissions_flyer_scan_id_fkey"
            columns: ["flyer_scan_id"]
            isOneToOne: false
            referencedRelation: "flyer_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      community_submissions_audit: {
        Row: {
          actor_id: string | null
          at: string
          field: string
          id: number
          new_value: Json | null
          old_value: Json | null
          submission_id: string
        }
        Insert: {
          actor_id?: string | null
          at?: string
          field: string
          id?: number
          new_value?: Json | null
          old_value?: Json | null
          submission_id: string
        }
        Update: {
          actor_id?: string | null
          at?: string
          field?: string
          id?: number
          new_value?: Json | null
          old_value?: Json | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_submissions_audit_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "community_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_submissions_audit_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "v_api_error_daily"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      content_changes: {
        Row: {
          applied_at: string | null
          batch_id: string | null
          change_type: string
          confidence: number
          content_id: string
          content_name: string | null
          content_type: string
          created_at: string | null
          field_name: string
          id: string
          metadata: Json | null
          module_id: string
          new_value: Json
          old_value: Json | null
          reasoning: string | null
          reverted_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string | null
          status: string
          workflow_run_id: string | null
        }
        Insert: {
          applied_at?: string | null
          batch_id?: string | null
          change_type: string
          confidence: number
          content_id: string
          content_name?: string | null
          content_type: string
          created_at?: string | null
          field_name: string
          id?: string
          metadata?: Json | null
          module_id: string
          new_value: Json
          old_value?: Json | null
          reasoning?: string | null
          reverted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          status?: string
          workflow_run_id?: string | null
        }
        Update: {
          applied_at?: string | null
          batch_id?: string | null
          change_type?: string
          confidence?: number
          content_id?: string
          content_name?: string | null
          content_type?: string
          created_at?: string | null
          field_name?: string
          id?: string
          metadata?: Json | null
          module_id?: string
          new_value?: Json
          old_value?: Json | null
          reasoning?: string | null
          reverted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string | null
          status?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_changes_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "automation_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_changes_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_changes_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
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
      content_flags: {
        Row: {
          applied_at: string | null
          auto_approved: boolean | null
          confidence: number | null
          content_id: string
          content_type: string
          created_at: string | null
          current_value: Json | null
          description: string | null
          expires_at: string | null
          flag_type: string
          id: string
          module_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          status: string
          suggested_value: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          applied_at?: string | null
          auto_approved?: boolean | null
          confidence?: number | null
          content_id: string
          content_type: string
          created_at?: string | null
          current_value?: Json | null
          description?: string | null
          expires_at?: string | null
          flag_type: string
          id?: string
          module_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
          suggested_value?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          applied_at?: string | null
          auto_approved?: boolean | null
          confidence?: number | null
          content_id?: string
          content_type?: string
          created_at?: string | null
          current_value?: Json | null
          description?: string | null
          expires_at?: string | null
          flag_type?: string
          id?: string
          module_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          status?: string
          suggested_value?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      content_links: {
        Row: {
          auto_removed_at: string | null
          check_count: number
          cleaned_url: string | null
          content_id: string
          content_type: string
          created_at: string
          field_name: string
          final_url: string | null
          http_status: number | null
          id: string
          is_scraped_source: boolean | null
          is_social: boolean | null
          last_checked_at: string | null
          original_url: string
          scan_brands: string[] | null
          scan_categories: string[] | null
          scan_id: string | null
          scan_score: number | null
          scan_screenshot_url: string | null
          scan_verdict: string | null
          scanned_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auto_removed_at?: string | null
          check_count?: number
          cleaned_url?: string | null
          content_id: string
          content_type: string
          created_at?: string
          field_name: string
          final_url?: string | null
          http_status?: number | null
          id?: string
          is_scraped_source?: boolean | null
          is_social?: boolean | null
          last_checked_at?: string | null
          original_url: string
          scan_brands?: string[] | null
          scan_categories?: string[] | null
          scan_id?: string | null
          scan_score?: number | null
          scan_screenshot_url?: string | null
          scan_verdict?: string | null
          scanned_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auto_removed_at?: string | null
          check_count?: number
          cleaned_url?: string | null
          content_id?: string
          content_type?: string
          created_at?: string
          field_name?: string
          final_url?: string | null
          http_status?: number | null
          id?: string
          is_scraped_source?: boolean | null
          is_social?: boolean | null
          last_checked_at?: string | null
          original_url?: string
          scan_brands?: string[] | null
          scan_categories?: string[] | null
          scan_id?: string | null
          scan_score?: number | null
          scan_screenshot_url?: string | null
          scan_verdict?: string | null
          scanned_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_metadata: {
        Row: {
          canonical_url: string | null
          content_id: string
          content_type: string
          created_at: string
          editor_notes: string | null
          last_edited_at: string
          last_edited_by: string | null
          locked_at: string | null
          locked_by: string | null
          meta_description: string | null
          meta_title: string | null
          publish_at: string | null
          published_at: string | null
          published_by: string | null
          unpublish_at: string | null
          updated_at: string
          visibility_level: string
          workflow_state: string
        }
        Insert: {
          canonical_url?: string | null
          content_id: string
          content_type: string
          created_at?: string
          editor_notes?: string | null
          last_edited_at?: string
          last_edited_by?: string | null
          locked_at?: string | null
          locked_by?: string | null
          meta_description?: string | null
          meta_title?: string | null
          publish_at?: string | null
          published_at?: string | null
          published_by?: string | null
          unpublish_at?: string | null
          updated_at?: string
          visibility_level?: string
          workflow_state?: string
        }
        Update: {
          canonical_url?: string | null
          content_id?: string
          content_type?: string
          created_at?: string
          editor_notes?: string | null
          last_edited_at?: string
          last_edited_by?: string | null
          locked_at?: string | null
          locked_by?: string | null
          meta_description?: string | null
          meta_title?: string | null
          publish_at?: string | null
          published_at?: string | null
          published_by?: string | null
          unpublish_at?: string | null
          updated_at?: string
          visibility_level?: string
          workflow_state?: string
        }
        Relationships: []
      }
      content_threads: {
        Row: {
          body: string
          comment_type: string
          content_id: string
          content_type: string
          created_at: string
          created_by: string | null
          id: string
          parent_comment_id: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          thread_kind: string
          updated_at: string
        }
        Insert: {
          body: string
          comment_type?: string
          content_id: string
          content_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_comment_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          thread_kind?: string
          updated_at?: string
        }
        Update: {
          body?: string
          comment_type?: string
          content_id?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          parent_comment_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          thread_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_threads_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "content_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      content_translations: {
        Row: {
          created_at: string
          field_name: string
          id: string
          language: string
          machine_source: string | null
          record_id: string
          status: string
          table_name: string
          translated_by: string | null
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          field_name: string
          id?: string
          language: string
          machine_source?: string | null
          record_id: string
          status?: string
          table_name: string
          translated_by?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          field_name?: string
          id?: string
          language?: string
          machine_source?: string | null
          record_id?: string
          status?: string
          table_name?: string
          translated_by?: string | null
          updated_at?: string
          value?: string
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_conversation_participants_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
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
          curated_image_url: string | null
          currency: string | null
          data_source: string | null
          description: string | null
          driving_side: string | null
          duplicate_of_id: string | null
          equality_score: number | null
          exports: string[] | null
          flag_emoji: string | null
          gdp_per_capita_usd: number | null
          gdp_usd: number | null
          government_type: string | null
          human_development_index: number | null
          id: string
          image_flagged: boolean
          image_metadata: Json | null
          image_url: string | null
          imports: string[] | null
          internet_tld: string | null
          languages: string[] | null
          last_refreshed_at: string | null
          last_synced_at: string | null
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
          name_normalized: string | null
          national_anthem: string | null
          national_day: string | null
          national_symbols: Json | null
          natural_resources: string[] | null
          population: number | null
          region_id: string | null
          slug: string
          timezone: string | null
          unesco_sites: string[] | null
          updated_at: string
          visa_requirements: Json | null
          wolfram_enriched_at: string | null
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
          curated_image_url?: string | null
          currency?: string | null
          data_source?: string | null
          description?: string | null
          driving_side?: string | null
          duplicate_of_id?: string | null
          equality_score?: number | null
          exports?: string[] | null
          flag_emoji?: string | null
          gdp_per_capita_usd?: number | null
          gdp_usd?: number | null
          government_type?: string | null
          human_development_index?: number | null
          id?: string
          image_flagged?: boolean
          image_metadata?: Json | null
          image_url?: string | null
          imports?: string[] | null
          internet_tld?: string | null
          languages?: string[] | null
          last_refreshed_at?: string | null
          last_synced_at?: string | null
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
          name_normalized?: string | null
          national_anthem?: string | null
          national_day?: string | null
          national_symbols?: Json | null
          natural_resources?: string[] | null
          population?: number | null
          region_id?: string | null
          slug: string
          timezone?: string | null
          unesco_sites?: string[] | null
          updated_at?: string
          visa_requirements?: Json | null
          wolfram_enriched_at?: string | null
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
          curated_image_url?: string | null
          currency?: string | null
          data_source?: string | null
          description?: string | null
          driving_side?: string | null
          duplicate_of_id?: string | null
          equality_score?: number | null
          exports?: string[] | null
          flag_emoji?: string | null
          gdp_per_capita_usd?: number | null
          gdp_usd?: number | null
          government_type?: string | null
          human_development_index?: number | null
          id?: string
          image_flagged?: boolean
          image_metadata?: Json | null
          image_url?: string | null
          imports?: string[] | null
          internet_tld?: string | null
          languages?: string[] | null
          last_refreshed_at?: string | null
          last_synced_at?: string | null
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
          name_normalized?: string | null
          national_anthem?: string | null
          national_day?: string | null
          national_symbols?: Json | null
          natural_resources?: string[] | null
          population?: number | null
          region_id?: string | null
          slug?: string
          timezone?: string | null
          unesco_sites?: string[] | null
          updated_at?: string
          visa_requirements?: Json | null
          wolfram_enriched_at?: string | null
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
            foreignKeyName: "countries_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "countries"
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
      cron_job_logs: {
        Row: {
          created_at: string | null
          error_details: string | null
          id: string
          job_name: string
          message: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          error_details?: string | null
          id?: string
          job_name: string
          message?: string | null
          status: string
        }
        Update: {
          created_at?: string | null
          error_details?: string | null
          id?: string
          job_name?: string
          message?: string | null
          status?: string
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
      data_ops_alerts: {
        Row: {
          acked_at: string | null
          acked_by: string | null
          alert_kind: string
          created_at: string
          detail: Json
          fingerprint: string
          id: number
          severity: string
          source_slug: string | null
        }
        Insert: {
          acked_at?: string | null
          acked_by?: string | null
          alert_kind: string
          created_at?: string
          detail: Json
          fingerprint: string
          id?: number
          severity?: string
          source_slug?: string | null
        }
        Update: {
          acked_at?: string | null
          acked_by?: string | null
          alert_kind?: string
          created_at?: string
          detail?: Json
          fingerprint?: string
          id?: number
          severity?: string
          source_slug?: string | null
        }
        Relationships: []
      }
      dedup_decisions_feedback: {
        Row: {
          candidate_venue_id: string | null
          created_at: string
          decided_by: string | null
          human_decision: string
          id: number
          reason: string | null
          rpc_match_type: string | null
          rpc_score: number | null
          staging_id: string | null
        }
        Insert: {
          candidate_venue_id?: string | null
          created_at?: string
          decided_by?: string | null
          human_decision: string
          id?: number
          reason?: string | null
          rpc_match_type?: string | null
          rpc_score?: number | null
          staging_id?: string | null
        }
        Update: {
          candidate_venue_id?: string | null
          created_at?: string
          decided_by?: string | null
          human_decision?: string
          id?: number
          reason?: string | null
          rpc_match_type?: string | null
          rpc_score?: number | null
          staging_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dedup_decisions_feedback_candidate_venue_id_fkey"
            columns: ["candidate_venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "dedup_decisions_feedback_candidate_venue_id_fkey"
            columns: ["candidate_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dedup_decisions_feedback_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "geo_merge_candidates"
            referencedColumns: ["staging_id"]
          },
          {
            foreignKeyName: "dedup_decisions_feedback_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "ingestion_staging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dedup_decisions_feedback_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stuck_items"
            referencedColumns: ["id"]
          },
        ]
      }
      donations: {
        Row: {
          amount: number
          amount_encrypted: string | null
          canceled_at: string | null
          created_at: string
          currency: string | null
          donation_type: string
          donor_info_encrypted: string | null
          donor_name: string | null
          email: string
          id: string
          is_anonymous: boolean | null
          message: string | null
          payment_method_encrypted: string | null
          recurring_interval: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          amount_encrypted?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          donation_type?: string
          donor_info_encrypted?: string | null
          donor_name?: string | null
          email: string
          id?: string
          is_anonymous?: boolean | null
          message?: string | null
          payment_method_encrypted?: string | null
          recurring_interval?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          amount_encrypted?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          donation_type?: string
          donor_info_encrypted?: string | null
          donor_name?: string | null
          email?: string
          id?: string
          is_anonymous?: boolean | null
          message?: string | null
          payment_method_encrypted?: string | null
          recurring_interval?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_ingestions: {
        Row: {
          ai_extraction: Json | null
          body_html: string | null
          body_text: string | null
          created_at: string
          error_message: string | null
          extracted_events: number
          extracted_venues: number
          from_address: string
          id: string
          inserted_event_ids: string[]
          inserted_venue_ids: string[]
          pipeline_staged_at: string | null
          processing_ms: number | null
          received_at: string
          status: string
          subject: string
          to_address: string
        }
        Insert: {
          ai_extraction?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          error_message?: string | null
          extracted_events?: number
          extracted_venues?: number
          from_address: string
          id?: string
          inserted_event_ids?: string[]
          inserted_venue_ids?: string[]
          pipeline_staged_at?: string | null
          processing_ms?: number | null
          received_at?: string
          status?: string
          subject?: string
          to_address?: string
        }
        Update: {
          ai_extraction?: Json | null
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          error_message?: string | null
          extracted_events?: number
          extracted_venues?: number
          from_address?: string
          id?: string
          inserted_event_ids?: string[]
          inserted_venue_ids?: string[]
          pipeline_staged_at?: string | null
          processing_ms?: number | null
          received_at?: string
          status?: string
          subject?: string
          to_address?: string
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
      enrichment_audit: {
        Row: {
          actor: string
          after_data: Json | null
          before_data: Json | null
          changed_fields: string[]
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          pipeline_run_id: string | null
          stage: string
          staging_id: string
          status: string
        }
        Insert: {
          actor?: string
          after_data?: Json | null
          before_data?: Json | null
          changed_fields?: string[]
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          pipeline_run_id?: string | null
          stage: string
          staging_id: string
          status?: string
        }
        Update: {
          actor?: string
          after_data?: Json | null
          before_data?: Json | null
          changed_fields?: string[]
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          pipeline_run_id?: string | null
          stage?: string
          staging_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_audit_pipeline_run_id_fkey"
            columns: ["pipeline_run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_audit_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "geo_merge_candidates"
            referencedColumns: ["staging_id"]
          },
          {
            foreignKeyName: "enrichment_audit_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "ingestion_staging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_audit_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stuck_items"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_log: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          status: string
          step: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          status: string
          step: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          status?: string
          step?: string
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
      entity_link_review: {
        Row: {
          article_id: string
          candidate_id: string | null
          candidate_name: string
          context_snippet: string | null
          created_at: string
          entity_type: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          score: number | null
          status: string
        }
        Insert: {
          article_id: string
          candidate_id?: string | null
          candidate_name: string
          context_snippet?: string | null
          created_at?: string
          entity_type: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number | null
          status?: string
        }
        Update: {
          article_id?: string
          candidate_id?: string | null
          candidate_name?: string
          context_snippet?: string | null
          created_at?: string
          entity_type?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_link_review_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
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
      event_sources: {
        Row: {
          confidence: number | null
          event_id: string
          first_seen_at: string
          id: string
          is_primary: boolean
          last_seen_at: string
          payload: Json | null
          payload_hash: string | null
          source_entity_id: string
          source_slug: string
          source_url: string | null
        }
        Insert: {
          confidence?: number | null
          event_id: string
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          last_seen_at?: string
          payload?: Json | null
          payload_hash?: string | null
          source_entity_id: string
          source_slug: string
          source_url?: string | null
        }
        Update: {
          confidence?: number | null
          event_id?: string
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          last_seen_at?: string
          payload?: Json | null
          payload_hash?: string | null
          source_entity_id?: string
          source_slug?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
        ]
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
          city_id: string | null
          classified_at: string | null
          content_language: string | null
          country: string
          country_id: string | null
          created_at: string
          created_by: string | null
          data_source: string | null
          description: string | null
          duplicate_of_id: string | null
          edition: string | null
          end_date: string | null
          enrichment_status: Json | null
          event_type: string
          external_id: string | null
          featured: boolean | null
          festival_id: string | null
          geo_linked_at: string | null
          group_id: string | null
          id: string
          images: string[] | null
          is_free: boolean | null
          is_public: boolean
          is_recurring: boolean | null
          last_refreshed_at: string | null
          last_synced_at: string | null
          latitude: number | null
          lgbti_relevance_score: number | null
          logo_fetched_at: string | null
          logo_url: string | null
          longitude: number | null
          max_attendees: number | null
          needs_attention: boolean | null
          organizer_contact: string | null
          organizer_name: string | null
          price_max: number | null
          price_min: number | null
          quality_score: number | null
          queer_village_id: string | null
          recurrence_pattern: string | null
          sensitivity_flags: Json | null
          slug: string
          start_date: string
          state: string | null
          status: string | null
          target_groups: string[] | null
          ticket_url: string | null
          timezone: string | null
          title: string
          title_normalized: string | null
          updated_at: string
          venue_id: string | null
          venue_name: string | null
          verification_status: string
          website: string | null
        }
        Insert: {
          accessibility_attributes?: string[] | null
          accessibility_notes?: string | null
          address?: string | null
          age_restriction?: string | null
          city: string
          city_id?: string | null
          classified_at?: string | null
          content_language?: string | null
          country?: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          duplicate_of_id?: string | null
          edition?: string | null
          end_date?: string | null
          enrichment_status?: Json | null
          event_type: string
          external_id?: string | null
          featured?: boolean | null
          festival_id?: string | null
          geo_linked_at?: string | null
          group_id?: string | null
          id?: string
          images?: string[] | null
          is_free?: boolean | null
          is_public?: boolean
          is_recurring?: boolean | null
          last_refreshed_at?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          lgbti_relevance_score?: number | null
          logo_fetched_at?: string | null
          logo_url?: string | null
          longitude?: number | null
          max_attendees?: number | null
          needs_attention?: boolean | null
          organizer_contact?: string | null
          organizer_name?: string | null
          price_max?: number | null
          price_min?: number | null
          quality_score?: number | null
          queer_village_id?: string | null
          recurrence_pattern?: string | null
          sensitivity_flags?: Json | null
          slug: string
          start_date: string
          state?: string | null
          status?: string | null
          target_groups?: string[] | null
          ticket_url?: string | null
          timezone?: string | null
          title: string
          title_normalized?: string | null
          updated_at?: string
          venue_id?: string | null
          venue_name?: string | null
          verification_status?: string
          website?: string | null
        }
        Update: {
          accessibility_attributes?: string[] | null
          accessibility_notes?: string | null
          address?: string | null
          age_restriction?: string | null
          city?: string
          city_id?: string | null
          classified_at?: string | null
          content_language?: string | null
          country?: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          duplicate_of_id?: string | null
          edition?: string | null
          end_date?: string | null
          enrichment_status?: Json | null
          event_type?: string
          external_id?: string | null
          featured?: boolean | null
          festival_id?: string | null
          geo_linked_at?: string | null
          group_id?: string | null
          id?: string
          images?: string[] | null
          is_free?: boolean | null
          is_public?: boolean
          is_recurring?: boolean | null
          last_refreshed_at?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          lgbti_relevance_score?: number | null
          logo_fetched_at?: string | null
          logo_url?: string | null
          longitude?: number | null
          max_attendees?: number | null
          needs_attention?: boolean | null
          organizer_contact?: string | null
          organizer_name?: string | null
          price_max?: number | null
          price_min?: number | null
          quality_score?: number | null
          queer_village_id?: string | null
          recurrence_pattern?: string | null
          sensitivity_flags?: Json | null
          slug?: string
          start_date?: string
          state?: string | null
          status?: string | null
          target_groups?: string[] | null
          ticket_url?: string | null
          timezone?: string | null
          title?: string
          title_normalized?: string | null
          updated_at?: string
          venue_id?: string | null
          venue_name?: string | null
          verification_status?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "events_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_queer_village_id_fkey"
            columns: ["queer_village_id"]
            isOneToOne: false
            referencedRelation: "queer_villages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
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
      feedback: {
        Row: {
          admin_notes: string | null
          attachments: string[] | null
          category: string
          created_at: string
          description: string
          email: string | null
          id: string
          page_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
          title: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          admin_notes?: string | null
          attachments?: string[] | null
          category: string
          created_at?: string
          description: string
          email?: string | null
          id?: string
          page_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          title: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          admin_notes?: string | null
          attachments?: string[] | null
          category?: string
          created_at?: string
          description?: string
          email?: string | null
          id?: string
          page_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: []
      }
      feedback_dispatch_counters: {
        Row: {
          actor_id: string
          bucket_day: string
          bucket_minute: string
          day_count: number
          minute_count: number
        }
        Insert: {
          actor_id: string
          bucket_day: string
          bucket_minute: string
          day_count?: number
          minute_count?: number
        }
        Update: {
          actor_id?: string
          bucket_day?: string
          bucket_minute?: string
          day_count?: number
          minute_count?: number
        }
        Relationships: []
      }
      feedback_duplicate_suggestions: {
        Row: {
          a_id: string
          b_id: string
          created_at: string
          dismissed: boolean
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          similarity: number
        }
        Insert: {
          a_id: string
          b_id: string
          created_at?: string
          dismissed?: boolean
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          similarity: number
        }
        Update: {
          a_id?: string
          b_id?: string
          created_at?: string
          dismissed?: boolean
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          similarity?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedback_duplicate_suggestions_a_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "community_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_duplicate_suggestions_a_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "v_api_error_daily"
            referencedColumns: ["submission_id"]
          },
          {
            foreignKeyName: "feedback_duplicate_suggestions_b_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "community_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_duplicate_suggestions_b_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "v_api_error_daily"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      feedback_retest_runs: {
        Row: {
          created_at: string
          created_by: string | null
          external_ref: string | null
          finished_at: string | null
          id: string
          kind: string
          result: Json | null
          routine_run_id: string
          runner: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          result?: Json | null
          routine_run_id: string
          runner: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_ref?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          result?: Json | null
          routine_run_id?: string
          runner?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_retest_runs_routine_run_id_fkey"
            columns: ["routine_run_id"]
            isOneToOne: false
            referencedRelation: "feedback_routine_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_routine_runs: {
        Row: {
          commit_sha: string | null
          confidence: string | null
          created_at: string
          created_by: string | null
          error: string | null
          external_ref: string | null
          files_changed: string[] | null
          finished_at: string | null
          fix_summary: string | null
          id: string
          pr_url: string | null
          prompt: string
          prompt_hash: string
          risks: string | null
          runner: string
          status: string
          story_id: string
          updated_at: string
        }
        Insert: {
          commit_sha?: string | null
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          external_ref?: string | null
          files_changed?: string[] | null
          finished_at?: string | null
          fix_summary?: string | null
          id?: string
          pr_url?: string | null
          prompt: string
          prompt_hash: string
          risks?: string | null
          runner: string
          status?: string
          story_id: string
          updated_at?: string
        }
        Update: {
          commit_sha?: string | null
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          external_ref?: string | null
          files_changed?: string[] | null
          finished_at?: string | null
          fix_summary?: string | null
          id?: string
          pr_url?: string | null
          prompt?: string
          prompt_hash?: string
          risks?: string | null
          runner?: string
          status?: string
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_routine_runs_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "feedback_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_stories: {
        Row: {
          approved_by: string | null
          approved_for_claude_at: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assignee_id: string | null
          brief_title: string | null
          created_at: string
          created_by: string | null
          handoffs: Json
          id: string
          labels: string[]
          narrative: string | null
          narrative_edited: boolean
          needs_followup_reason: string | null
          origin: string
          priority: number
          resolved_at: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          approved_for_claude_at?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assignee_id?: string | null
          brief_title?: string | null
          created_at?: string
          created_by?: string | null
          handoffs?: Json
          id?: string
          labels?: string[]
          narrative?: string | null
          narrative_edited?: boolean
          needs_followup_reason?: string | null
          origin?: string
          priority?: number
          resolved_at?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          approved_for_claude_at?: string | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          assignee_id?: string | null
          brief_title?: string | null
          created_at?: string
          created_by?: string | null
          handoffs?: Json
          id?: string
          labels?: string[]
          narrative?: string | null
          narrative_edited?: boolean
          needs_followup_reason?: string | null
          origin?: string
          priority?: number
          resolved_at?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_story_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          created_at: string
          id: number
          kind: string
          payload: Json
          retest_run_id: string | null
          routine_run_id: string | null
          story_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          created_at?: string
          id?: number
          kind: string
          payload?: Json
          retest_run_id?: string | null
          routine_run_id?: string | null
          story_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          created_at?: string
          id?: number
          kind?: string
          payload?: Json
          retest_run_id?: string | null
          routine_run_id?: string | null
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_story_events_retest_run_id_fkey"
            columns: ["retest_run_id"]
            isOneToOne: false
            referencedRelation: "feedback_retest_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_story_events_routine_run_id_fkey"
            columns: ["routine_run_id"]
            isOneToOne: false
            referencedRelation: "feedback_routine_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_story_events_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "feedback_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_story_members: {
        Row: {
          added_at: string
          added_by: string | null
          confidence: number | null
          story_id: string
          submission_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          confidence?: number | null
          story_id: string
          submission_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          confidence?: number | null
          story_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_story_members_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "feedback_stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_story_members_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "community_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_story_members_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "v_api_error_daily"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      feedback_story_suggestions: {
        Row: {
          avg_similarity: number
          created_at: string
          dismissed: boolean
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          member_ids: string[]
          method: string
          proposed_title: string
        }
        Insert: {
          avg_similarity: number
          created_at?: string
          dismissed?: boolean
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          member_ids: string[]
          method: string
          proposed_title: string
        }
        Update: {
          avg_similarity?: number
          created_at?: string
          dismissed?: boolean
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          member_ids?: string[]
          method?: string
          proposed_title?: string
        }
        Relationships: []
      }
      feedback_votes: {
        Row: {
          created_at: string
          id: string
          submission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          submission_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          submission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_votes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "community_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_votes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "v_api_error_daily"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      festivals: {
        Row: {
          city: string | null
          city_id: string | null
          country: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          featured: boolean | null
          festival_type: string
          id: string
          images: string[] | null
          is_recurring: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          recurrence_pattern: string | null
          slug: string | null
          start_date: string | null
          tags: string[] | null
          ticket_url: string | null
          timezone: string | null
          updated_at: string
          updated_by: string | null
          venue_id: string | null
          website: string | null
        }
        Insert: {
          city?: string | null
          city_id?: string | null
          country?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          featured?: boolean | null
          festival_type?: string
          id?: string
          images?: string[] | null
          is_recurring?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          recurrence_pattern?: string | null
          slug?: string | null
          start_date?: string | null
          tags?: string[] | null
          ticket_url?: string | null
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
          venue_id?: string | null
          website?: string | null
        }
        Update: {
          city?: string | null
          city_id?: string | null
          country?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          featured?: boolean | null
          festival_type?: string
          id?: string
          images?: string[] | null
          is_recurring?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          recurrence_pattern?: string | null
          slug?: string | null
          start_date?: string | null
          tags?: string[] | null
          ticket_url?: string | null
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
          venue_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "festivals_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festivals_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festivals_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festivals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "festivals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      flyer_scans: {
        Row: {
          created_at: string
          detected_type: string
          duplicate_event_id: string | null
          id: string
          image_url: string
          matched_city_id: string | null
          matched_country_id: string | null
          matched_venue_id: string | null
          model_used: string
          processing_time_ms: number | null
          raw_extraction: Json
          status: string
          submission_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          detected_type?: string
          duplicate_event_id?: string | null
          id?: string
          image_url: string
          matched_city_id?: string | null
          matched_country_id?: string | null
          matched_venue_id?: string | null
          model_used?: string
          processing_time_ms?: number | null
          raw_extraction?: Json
          status?: string
          submission_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          detected_type?: string
          duplicate_event_id?: string | null
          id?: string
          image_url?: string
          matched_city_id?: string | null
          matched_country_id?: string | null
          matched_venue_id?: string | null
          model_used?: string
          processing_time_ms?: number | null
          raw_extraction?: Json
          status?: string
          submission_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flyer_scans_duplicate_event_id_fkey"
            columns: ["duplicate_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flyer_scans_duplicate_event_id_fkey"
            columns: ["duplicate_event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flyer_scans_matched_city_id_fkey"
            columns: ["matched_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flyer_scans_matched_city_id_fkey"
            columns: ["matched_city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flyer_scans_matched_country_id_fkey"
            columns: ["matched_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flyer_scans_matched_venue_id_fkey"
            columns: ["matched_venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "flyer_scans_matched_venue_id_fkey"
            columns: ["matched_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          currency: string
          fetched_at: string
          rate_to_usd: number
          source: string | null
        }
        Insert: {
          currency: string
          fetched_at?: string
          rate_to_usd: number
          source?: string | null
        }
        Update: {
          currency?: string
          fetched_at?: string
          rate_to_usd?: number
          source?: string | null
        }
        Relationships: []
      }
      geo_link_log: {
        Row: {
          created_at: string
          details: Json | null
          entity_type: string
          id: string
          total_linked: number
          total_processed: number
          total_skipped: number
        }
        Insert: {
          created_at?: string
          details?: Json | null
          entity_type: string
          id?: string
          total_linked?: number
          total_processed?: number
          total_skipped?: number
        }
        Update: {
          created_at?: string
          details?: Json | null
          entity_type?: string
          id?: string
          total_linked?: number
          total_processed?: number
          total_skipped?: number
        }
        Relationships: []
      }
      geo_sources: {
        Row: {
          city_id: string | null
          confidence: number | null
          country_id: string | null
          entity_type: string
          first_seen_at: string
          id: string
          is_primary: boolean
          last_seen_at: string
          payload: Json | null
          payload_hash: string | null
          source_entity_id: string
          source_slug: string
          source_url: string | null
        }
        Insert: {
          city_id?: string | null
          confidence?: number | null
          country_id?: string | null
          entity_type: string
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          last_seen_at?: string
          payload?: Json | null
          payload_hash?: string | null
          source_entity_id: string
          source_slug: string
          source_url?: string | null
        }
        Update: {
          city_id?: string | null
          confidence?: number | null
          country_id?: string | null
          entity_type?: string
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          last_seen_at?: string
          payload?: Json | null
          payload_hash?: string | null
          source_entity_id?: string
          source_slug?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_sources_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geo_sources_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geo_sources_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_validations: {
        Row: {
          city: string | null
          confidence: number | null
          content_id: string
          content_type: string
          country: string | null
          created_at: string | null
          geocoded_address: string | null
          has_mismatch: boolean | null
          id: string
          last_validated_at: string | null
          mismatch_details: string | null
          original_lat: number | null
          original_lng: number | null
          queer_village: string | null
          region: string | null
          source: string | null
          timezone: string | null
          validated_lat: number | null
          validated_lng: number | null
        }
        Insert: {
          city?: string | null
          confidence?: number | null
          content_id: string
          content_type: string
          country?: string | null
          created_at?: string | null
          geocoded_address?: string | null
          has_mismatch?: boolean | null
          id?: string
          last_validated_at?: string | null
          mismatch_details?: string | null
          original_lat?: number | null
          original_lng?: number | null
          queer_village?: string | null
          region?: string | null
          source?: string | null
          timezone?: string | null
          validated_lat?: number | null
          validated_lng?: number | null
        }
        Update: {
          city?: string | null
          confidence?: number | null
          content_id?: string
          content_type?: string
          country?: string | null
          created_at?: string | null
          geocoded_address?: string | null
          has_mismatch?: boolean | null
          id?: string
          last_validated_at?: string | null
          mismatch_details?: string | null
          original_lat?: number | null
          original_lng?: number | null
          queer_village?: string | null
          region?: string | null
          source?: string | null
          timezone?: string | null
          validated_lat?: number | null
          validated_lng?: number | null
        }
        Relationships: []
      }
      github_event_ids: {
        Row: {
          id: string
          kind: string
          seen_at: string
        }
        Insert: {
          id: string
          kind: string
          seen_at?: string
        }
        Update: {
          id?: string
          kind?: string
          seen_at?: string
        }
        Relationships: []
      }
      github_poller_state: {
        Row: {
          cursor: string
          id: string
          updated_at: string
        }
        Insert: {
          cursor?: string
          id?: string
          updated_at?: string
        }
        Update: {
          cursor?: string
          id?: string
          updated_at?: string
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
      group_join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          message: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id: string
          id?: string
          message?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string
          id?: string
          message?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
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
      hotels: {
        Row: {
          address: string | null
          amenities: string[] | null
          booking_url: string | null
          city: string | null
          city_id: string | null
          country: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          data_source: string | null
          description: string | null
          email: string | null
          external_id: string | null
          featured: boolean | null
          geo_linked_at: string | null
          hotel_type: string
          id: string
          images: string[] | null
          latitude: number | null
          lgbtq_friendly: boolean | null
          longitude: number | null
          name: string
          phone: string | null
          price_range: number | null
          queer_safety_notes: string | null
          queer_village_id: string | null
          slug: string | null
          star_rating: number | null
          tags: string[] | null
          updated_at: string
          updated_by: string | null
          verified: boolean | null
          website: string | null
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          booking_url?: string | null
          city?: string | null
          city_id?: string | null
          country?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          email?: string | null
          external_id?: string | null
          featured?: boolean | null
          geo_linked_at?: string | null
          hotel_type?: string
          id?: string
          images?: string[] | null
          latitude?: number | null
          lgbtq_friendly?: boolean | null
          longitude?: number | null
          name: string
          phone?: string | null
          price_range?: number | null
          queer_safety_notes?: string | null
          queer_village_id?: string | null
          slug?: string | null
          star_rating?: number | null
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
          verified?: boolean | null
          website?: string | null
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          booking_url?: string | null
          city?: string | null
          city_id?: string | null
          country?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          email?: string | null
          external_id?: string | null
          featured?: boolean | null
          geo_linked_at?: string | null
          hotel_type?: string
          id?: string
          images?: string[] | null
          latitude?: number | null
          lgbtq_friendly?: boolean | null
          longitude?: number | null
          name?: string
          phone?: string | null
          price_range?: number | null
          queer_safety_notes?: string | null
          queer_village_id?: string | null
          slug?: string | null
          star_rating?: number | null
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
          verified?: boolean | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotels_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotels_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotels_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotels_queer_village_id_fkey"
            columns: ["queer_village_id"]
            isOneToOne: false
            referencedRelation: "queer_villages"
            referencedColumns: ["id"]
          },
        ]
      }
      image_optimization_jobs: {
        Row: {
          created_at: string
          failed_images: number
          id: string
          processed_images: number
          results: Json | null
          settings: Json | null
          status: string
          successful_images: number
          total_images: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          failed_images?: number
          id?: string
          processed_images?: number
          results?: Json | null
          settings?: Json | null
          status?: string
          successful_images?: number
          total_images?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          failed_images?: number
          id?: string
          processed_images?: number
          results?: Json | null
          settings?: Json | null
          status?: string
          successful_images?: number
          total_images?: number
          updated_at?: string
        }
        Relationships: []
      }
      import_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          import_job_id: string | null
          ip_address: unknown
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          import_job_id?: string | null
          ip_address?: unknown
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          import_job_id?: string | null
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_audit_log_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs_enhanced"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          batch_size: number
          created_at: string
          current_batch: number
          data: Json
          duplicate_items: number | null
          error_details: string | null
          failed_items: number | null
          id: string
          import_config: Json | null
          max_retries: number
          message: string
          processed_items: number
          progress: number
          retry_count: number
          status: string
          successful_items: number | null
          total_batches: number
          total_items: number
          type: string
          updated_at: string
        }
        Insert: {
          batch_size?: number
          created_at?: string
          current_batch?: number
          data?: Json
          duplicate_items?: number | null
          error_details?: string | null
          failed_items?: number | null
          id?: string
          import_config?: Json | null
          max_retries?: number
          message?: string
          processed_items?: number
          progress?: number
          retry_count?: number
          status?: string
          successful_items?: number | null
          total_batches?: number
          total_items?: number
          type: string
          updated_at?: string
        }
        Update: {
          batch_size?: number
          created_at?: string
          current_batch?: number
          data?: Json
          duplicate_items?: number | null
          error_details?: string | null
          failed_items?: number | null
          id?: string
          import_config?: Json | null
          max_retries?: number
          message?: string
          processed_items?: number
          progress?: number
          retry_count?: number
          status?: string
          successful_items?: number | null
          total_batches?: number
          total_items?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_jobs_enhanced: {
        Row: {
          ai_cost_usd: number | null
          api_endpoint: string | null
          completed_at: string | null
          created_at: string | null
          cursor_state: Json | null
          duplicate_records: number | null
          duplicate_strategy: string
          error_report: Json | null
          failed_records: number | null
          file_hash: string | null
          file_name: string | null
          file_size: number | null
          filters: Json
          id: string
          import_summary: Json | null
          invalid_records: number | null
          ip_address: unknown
          items_ai_approved: number | null
          items_ai_rejected: number | null
          items_committed: number | null
          items_deduplicated: number | null
          items_fetched: number | null
          items_needs_review: number | null
          phase: string
          pipeline_stage: string | null
          processed_records: number | null
          progress_percentage: number | null
          source_data: Json | null
          source_id: string | null
          source_type: string
          started_at: string | null
          status: string
          successful_records: number | null
          total_records: number | null
          type: string
          unique_key_fields: string[]
          updated_at: string | null
          user_agent: string | null
          user_id: string
          valid_records: number | null
          validation_report: Json | null
          validation_rules: Json
        }
        Insert: {
          ai_cost_usd?: number | null
          api_endpoint?: string | null
          completed_at?: string | null
          created_at?: string | null
          cursor_state?: Json | null
          duplicate_records?: number | null
          duplicate_strategy?: string
          error_report?: Json | null
          failed_records?: number | null
          file_hash?: string | null
          file_name?: string | null
          file_size?: number | null
          filters?: Json
          id?: string
          import_summary?: Json | null
          invalid_records?: number | null
          ip_address?: unknown
          items_ai_approved?: number | null
          items_ai_rejected?: number | null
          items_committed?: number | null
          items_deduplicated?: number | null
          items_fetched?: number | null
          items_needs_review?: number | null
          phase?: string
          pipeline_stage?: string | null
          processed_records?: number | null
          progress_percentage?: number | null
          source_data?: Json | null
          source_id?: string | null
          source_type: string
          started_at?: string | null
          status?: string
          successful_records?: number | null
          total_records?: number | null
          type: string
          unique_key_fields?: string[]
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
          valid_records?: number | null
          validation_report?: Json | null
          validation_rules?: Json
        }
        Update: {
          ai_cost_usd?: number | null
          api_endpoint?: string | null
          completed_at?: string | null
          created_at?: string | null
          cursor_state?: Json | null
          duplicate_records?: number | null
          duplicate_strategy?: string
          error_report?: Json | null
          failed_records?: number | null
          file_hash?: string | null
          file_name?: string | null
          file_size?: number | null
          filters?: Json
          id?: string
          import_summary?: Json | null
          invalid_records?: number | null
          ip_address?: unknown
          items_ai_approved?: number | null
          items_ai_rejected?: number | null
          items_committed?: number | null
          items_deduplicated?: number | null
          items_fetched?: number | null
          items_needs_review?: number | null
          phase?: string
          pipeline_stage?: string | null
          processed_records?: number | null
          progress_percentage?: number | null
          source_data?: Json | null
          source_id?: string | null
          source_type?: string
          started_at?: string | null
          status?: string
          successful_records?: number | null
          total_records?: number | null
          type?: string
          unique_key_fields?: string[]
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
          valid_records?: number | null
          validation_report?: Json | null
          validation_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_enhanced_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ingestion_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      import_validation_results: {
        Row: {
          created_at: string | null
          id: string
          import_job_id: string
          is_valid: boolean
          record_data: Json
          record_index: number
          validation_errors: Json | null
          validation_warnings: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          import_job_id: string
          is_valid?: boolean
          record_data: Json
          record_index: number
          validation_errors?: Json | null
          validation_warnings?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          import_job_id?: string
          is_valid?: boolean
          record_data?: Json
          record_index?: number
          validation_errors?: Json | null
          validation_warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_validation_results_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs_enhanced"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_dlq: {
        Row: {
          attempts: number
          created_at: string
          error_code: string | null
          error_message: string | null
          id: number
          last_attempt_at: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          next_retry_at: string
          payload: Json | null
          pipeline_run_id: string | null
          resolved_at: string | null
          source_slug: string | null
          stage: string
          staging_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: number
          last_attempt_at?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_retry_at?: string
          payload?: Json | null
          pipeline_run_id?: string | null
          resolved_at?: string | null
          source_slug?: string | null
          stage: string
          staging_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: number
          last_attempt_at?: string | null
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_retry_at?: string
          payload?: Json | null
          pipeline_run_id?: string | null
          resolved_at?: string | null
          source_slug?: string | null
          stage?: string
          staging_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_dlq_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "geo_merge_candidates"
            referencedColumns: ["staging_id"]
          },
          {
            foreignKeyName: "ingestion_dlq_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "ingestion_staging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_dlq_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stuck_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_events: {
        Row: {
          actor: string
          city_id: string | null
          country_id: string | null
          created_at: string
          id: number
          new_status: string | null
          old_status: string | null
          payload: Json | null
          stage: string
          staging_id: string | null
          venue_id: string | null
        }
        Insert: {
          actor?: string
          city_id?: string | null
          country_id?: string | null
          created_at?: string
          id?: number
          new_status?: string | null
          old_status?: string | null
          payload?: Json | null
          stage: string
          staging_id?: string | null
          venue_id?: string | null
        }
        Update: {
          actor?: string
          city_id?: string | null
          country_id?: string | null
          created_at?: string
          id?: number
          new_status?: string | null
          old_status?: string | null
          payload?: Json | null
          stage?: string
          staging_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_events_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_events_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "geo_merge_candidates"
            referencedColumns: ["staging_id"]
          },
          {
            foreignKeyName: "ingestion_events_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "ingestion_staging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_events_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stuck_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "ingestion_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_rule_hits: {
        Row: {
          applied_actions: Json | null
          created_at: string
          id: string
          matched_terms: Json | null
          rule_id: string
          submission_id: string
        }
        Insert: {
          applied_actions?: Json | null
          created_at?: string
          id?: string
          matched_terms?: Json | null
          rule_id: string
          submission_id: string
        }
        Update: {
          applied_actions?: Json | null
          created_at?: string
          id?: string
          matched_terms?: Json | null
          rule_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_rule_hits_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "ingestion_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_rule_hits_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "community_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_rule_hits_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "v_api_error_daily"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      ingestion_rules: {
        Row: {
          actions: Json
          created_at: string
          created_by: string | null
          description: string | null
          enabled: boolean
          id: string
          match: Json
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          actions: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          match: Json
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled?: boolean
          id?: string
          match?: Json
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      ingestion_sources: {
        Row: {
          config: Json
          created_at: string
          edge_function: string
          id: string
          is_enabled: boolean
          last_error: string | null
          last_rate_reset_at: string | null
          last_run_at: string | null
          last_success_at: string | null
          name: string
          rate_limit_per_day: number | null
          rate_limit_per_minute: number | null
          requests_today: number | null
          requires_api_key: string | null
          schedule: string | null
          slug: string
          source_type: string
          target_table: string
          total_items_approved: number | null
          total_items_fetched: number | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          edge_function: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_rate_reset_at?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          name: string
          rate_limit_per_day?: number | null
          rate_limit_per_minute?: number | null
          requests_today?: number | null
          requires_api_key?: string | null
          schedule?: string | null
          slug: string
          source_type: string
          target_table: string
          total_items_approved?: number | null
          total_items_fetched?: number | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          edge_function?: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_rate_reset_at?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          name?: string
          rate_limit_per_day?: number | null
          rate_limit_per_minute?: number | null
          requests_today?: number | null
          requires_api_key?: string | null
          schedule?: string | null
          slug?: string
          source_type?: string
          target_table?: string
          total_items_approved?: number | null
          total_items_fetched?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ingestion_staging: {
        Row: {
          ai_confidence_score: number | null
          ai_validated_at: string | null
          ai_validation_result: Json | null
          ai_validation_status: string
          classification_result: Json | null
          created_at: string
          dedup_details: Json | null
          dedup_match_id: string | null
          dedup_match_score: number | null
          dedup_match_table: string | null
          dedup_status: string
          disposition: string
          enriched_data: Json | null
          enrichment_status: string
          entity_type: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          job_id: string | null
          node_id: string | null
          normalized_data: Json | null
          payload_hash: string | null
          pipeline_run_id: string | null
          processed_at: string | null
          raw_data: Json
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_entity_id: string | null
          source_name: string | null
          source_type: string
          target_record_id: string | null
          target_table: string
          updated_at: string
        }
        Insert: {
          ai_confidence_score?: number | null
          ai_validated_at?: string | null
          ai_validation_result?: Json | null
          ai_validation_status?: string
          classification_result?: Json | null
          created_at?: string
          dedup_details?: Json | null
          dedup_match_id?: string | null
          dedup_match_score?: number | null
          dedup_match_table?: string | null
          dedup_status?: string
          disposition?: string
          enriched_data?: Json | null
          enrichment_status?: string
          entity_type?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          job_id?: string | null
          node_id?: string | null
          normalized_data?: Json | null
          payload_hash?: string | null
          pipeline_run_id?: string | null
          processed_at?: string | null
          raw_data: Json
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_entity_id?: string | null
          source_name?: string | null
          source_type: string
          target_record_id?: string | null
          target_table: string
          updated_at?: string
        }
        Update: {
          ai_confidence_score?: number | null
          ai_validated_at?: string | null
          ai_validation_result?: Json | null
          ai_validation_status?: string
          classification_result?: Json | null
          created_at?: string
          dedup_details?: Json | null
          dedup_match_id?: string | null
          dedup_match_score?: number | null
          dedup_match_table?: string | null
          dedup_status?: string
          disposition?: string
          enriched_data?: Json | null
          enrichment_status?: string
          entity_type?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          job_id?: string | null
          node_id?: string | null
          normalized_data?: Json | null
          payload_hash?: string | null
          pipeline_run_id?: string | null
          processed_at?: string | null
          raw_data?: Json
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_entity_id?: string | null
          source_name?: string | null
          source_type?: string
          target_record_id?: string | null
          target_table?: string
          updated_at?: string
        }
        Relationships: []
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
      mailbox_emails: {
        Row: {
          attachments: Json | null
          bcc: string[] | null
          body_html: string | null
          body_text: string | null
          cc: string[] | null
          created_at: string
          deleted_at: string | null
          direction: string
          email_date: string
          folder: string
          from_address: string
          from_name: string | null
          id: string
          in_reply_to_email_id: string | null
          in_reply_to_header: string | null
          is_read: boolean
          is_starred: boolean
          message_id_header: string | null
          owner_id: string
          references_header: string[] | null
          reply_to: string | null
          resend_id: string | null
          resend_status: string | null
          snippet: string | null
          status: string
          subject: string
          thread_id: string | null
          to_address: string
          to_name: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          bcc?: string[] | null
          body_html?: string | null
          body_text?: string | null
          cc?: string[] | null
          created_at?: string
          deleted_at?: string | null
          direction: string
          email_date?: string
          folder?: string
          from_address: string
          from_name?: string | null
          id?: string
          in_reply_to_email_id?: string | null
          in_reply_to_header?: string | null
          is_read?: boolean
          is_starred?: boolean
          message_id_header?: string | null
          owner_id: string
          references_header?: string[] | null
          reply_to?: string | null
          resend_id?: string | null
          resend_status?: string | null
          snippet?: string | null
          status?: string
          subject?: string
          thread_id?: string | null
          to_address: string
          to_name?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          bcc?: string[] | null
          body_html?: string | null
          body_text?: string | null
          cc?: string[] | null
          created_at?: string
          deleted_at?: string | null
          direction?: string
          email_date?: string
          folder?: string
          from_address?: string
          from_name?: string | null
          id?: string
          in_reply_to_email_id?: string | null
          in_reply_to_header?: string | null
          is_read?: boolean
          is_starred?: boolean
          message_id_header?: string | null
          owner_id?: string
          references_header?: string[] | null
          reply_to?: string | null
          resend_id?: string | null
          resend_status?: string | null
          snippet?: string | null
          status?: string
          subject?: string
          thread_id?: string | null
          to_address?: string
          to_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailbox_emails_in_reply_to_email_id_fkey"
            columns: ["in_reply_to_email_id"]
            isOneToOne: false
            referencedRelation: "mailbox_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      mailbox_reserved_addresses: {
        Row: {
          address: string
          created_at: string
          reason: string
        }
        Insert: {
          address: string
          created_at?: string
          reason?: string
        }
        Update: {
          address?: string
          created_at?: string
          reason?: string
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      marketplace_listing_sources: {
        Row: {
          confidence: number | null
          first_seen_at: string | null
          id: string
          is_primary: boolean | null
          last_seen_at: string | null
          listing_id: string
          payload_hash: string | null
          raw: Json | null
          source_entity_id: string | null
          source_slug: string
          source_url: string | null
        }
        Insert: {
          confidence?: number | null
          first_seen_at?: string | null
          id?: string
          is_primary?: boolean | null
          last_seen_at?: string | null
          listing_id: string
          payload_hash?: string | null
          raw?: Json | null
          source_entity_id?: string | null
          source_slug: string
          source_url?: string | null
        }
        Update: {
          confidence?: number | null
          first_seen_at?: string | null
          id?: string
          is_primary?: boolean | null
          last_seen_at?: string | null
          listing_id?: string
          payload_hash?: string | null
          raw?: Json | null
          source_entity_id?: string | null
          source_slug?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listing_sources_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          affiliate_url: string | null
          availability: string | null
          brand: string | null
          business_name: string
          business_type: string | null
          category: string
          category_id: string | null
          classified_at: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deprecated_at: string | null
          description: string | null
          external_url: string | null
          featured: boolean | null
          id: string
          image_hashes: Json | null
          images: string[] | null
          in_stock: boolean | null
          last_seen_at: string | null
          last_verified_at: string | null
          lgbti_relevance_score: number | null
          link_health: string | null
          location: string | null
          merchant_domain: string | null
          merchant_id: string | null
          payload_hash: string | null
          price: number | null
          price_type: string | null
          price_usd: number | null
          quality_score: number | null
          review_status: string | null
          sensitivity_flags: Json | null
          shipping_available: boolean | null
          shipping_info: string | null
          slug: string
          social_media: Json | null
          source_entity_id: string | null
          source_type: string | null
          status: string | null
          subcategory: string | null
          title: string
          title_normalized: string | null
          updated_at: string
          venue_id: string | null
          views_count: number | null
          website: string | null
        }
        Insert: {
          affiliate_url?: string | null
          availability?: string | null
          brand?: string | null
          business_name: string
          business_type?: string | null
          category: string
          category_id?: string | null
          classified_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deprecated_at?: string | null
          description?: string | null
          external_url?: string | null
          featured?: boolean | null
          id?: string
          image_hashes?: Json | null
          images?: string[] | null
          in_stock?: boolean | null
          last_seen_at?: string | null
          last_verified_at?: string | null
          lgbti_relevance_score?: number | null
          link_health?: string | null
          location?: string | null
          merchant_domain?: string | null
          merchant_id?: string | null
          payload_hash?: string | null
          price?: number | null
          price_type?: string | null
          price_usd?: number | null
          quality_score?: number | null
          review_status?: string | null
          sensitivity_flags?: Json | null
          shipping_available?: boolean | null
          shipping_info?: string | null
          slug: string
          social_media?: Json | null
          source_entity_id?: string | null
          source_type?: string | null
          status?: string | null
          subcategory?: string | null
          title: string
          title_normalized?: string | null
          updated_at?: string
          venue_id?: string | null
          views_count?: number | null
          website?: string | null
        }
        Update: {
          affiliate_url?: string | null
          availability?: string | null
          brand?: string | null
          business_name?: string
          business_type?: string | null
          category?: string
          category_id?: string | null
          classified_at?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deprecated_at?: string | null
          description?: string | null
          external_url?: string | null
          featured?: boolean | null
          id?: string
          image_hashes?: Json | null
          images?: string[] | null
          in_stock?: boolean | null
          last_seen_at?: string | null
          last_verified_at?: string | null
          lgbti_relevance_score?: number | null
          link_health?: string | null
          location?: string | null
          merchant_domain?: string | null
          merchant_id?: string | null
          payload_hash?: string | null
          price?: number | null
          price_type?: string | null
          price_usd?: number | null
          quality_score?: number | null
          review_status?: string | null
          sensitivity_flags?: Json | null
          shipping_available?: boolean | null
          shipping_info?: string | null
          slug?: string
          social_media?: Json | null
          source_entity_id?: string | null
          source_type?: string | null
          status?: string | null
          subcategory?: string | null
          title?: string
          title_normalized?: string | null
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_listings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_listings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
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
      marketplace_merchants: {
        Row: {
          affiliate_partner_id: string | null
          api_key_env: string | null
          api_key_vault_id: string | null
          config: Json
          created_at: string
          display_name: string
          id: string
          is_enabled: boolean
          last_sync_at: string | null
          last_sync_items: number | null
          last_sync_status: string | null
          provider: string
          shop_domain: string | null
          shop_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          affiliate_partner_id?: string | null
          api_key_env?: string | null
          api_key_vault_id?: string | null
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_enabled?: boolean
          last_sync_at?: string | null
          last_sync_items?: number | null
          last_sync_status?: string | null
          provider: string
          shop_domain?: string | null
          shop_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          affiliate_partner_id?: string | null
          api_key_env?: string | null
          api_key_vault_id?: string | null
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_enabled?: boolean
          last_sync_at?: string | null
          last_sync_items?: number | null
          last_sync_status?: string | null
          provider?: string
          shop_domain?: string | null
          shop_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_merchants_affiliate_partner_id_fkey"
            columns: ["affiliate_partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_price_history: {
        Row: {
          availability: string | null
          currency: string | null
          id: string
          listing_id: string
          observed_at: string
          price: number
          price_usd: number | null
          source_slug: string | null
        }
        Insert: {
          availability?: string | null
          currency?: string | null
          id?: string
          listing_id: string
          observed_at?: string
          price: number
          price_usd?: number | null
          source_slug?: string | null
        }
        Update: {
          availability?: string | null
          currency?: string | null
          id?: string
          listing_id?: string
          observed_at?: string
          price?: number
          price_usd?: number | null
          source_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_price_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketplace_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      media_optimization_status: {
        Row: {
          bucket_name: string
          compression_data: Json | null
          created_at: string
          file_path: string
          id: string
          optimization_status: string
          optimized_at: string | null
          optimized_formats: Json | null
          original_format: string
          original_size: number
          updated_at: string
        }
        Insert: {
          bucket_name: string
          compression_data?: Json | null
          created_at?: string
          file_path: string
          id?: string
          optimization_status?: string
          optimized_at?: string | null
          optimized_formats?: Json | null
          original_format: string
          original_size: number
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          compression_data?: Json | null
          created_at?: string
          file_path?: string
          id?: string
          optimization_status?: string
          optimized_at?: string | null
          optimized_formats?: Json | null
          original_format?: string
          original_size?: number
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_sender_id_profiles_user_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      moderation_flags: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          flag_type: string
          id: string
          reason: string
          reporter_ip: unknown
          reporter_user_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
          status: string
          suggested_changes: Json | null
          updated_at: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          flag_type: string
          id?: string
          reason: string
          reporter_ip?: unknown
          reporter_user_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          suggested_changes?: Json | null
          updated_at?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          flag_type?: string
          id?: string
          reason?: string
          reporter_ip?: unknown
          reporter_user_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          status?: string
          suggested_changes?: Json | null
          updated_at?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "news_article_cities_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
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
          auto_publish_blocked_reasons: string[] | null
          category: string
          city_ids: string[] | null
          classified_at: string | null
          content: string | null
          content_hash: string | null
          country_ids: string[] | null
          created_at: string
          duplicate_of_id: string | null
          enrichment_status: Json | null
          excerpt: string | null
          fingerprint: string
          first_seen_at: string | null
          id: string
          image_attribution: string | null
          image_hash: string | null
          image_url: string | null
          ingestion_run_id: string | null
          ingestion_staging_id: string | null
          is_featured: boolean | null
          last_quality_run_at: string | null
          last_seen_at: string | null
          lgbti_relevance_score: number | null
          needs_attention: boolean | null
          published_at: string
          publisher_name: string | null
          quality_decision: Json | null
          quality_pipeline_version: string | null
          quality_score: number | null
          quality_score_before: number | null
          quality_status: string | null
          relevance_score: number | null
          seen_count: number | null
          sensitivity_flags: Json | null
          sentiment: string | null
          slug: string
          source_id: string
          tags: string[] | null
          title: string
          updated_at: string
          url: string
          views_count: number | null
        }
        Insert: {
          author?: string | null
          auto_publish_blocked_reasons?: string[] | null
          category?: string
          city_ids?: string[] | null
          classified_at?: string | null
          content?: string | null
          content_hash?: string | null
          country_ids?: string[] | null
          created_at?: string
          duplicate_of_id?: string | null
          enrichment_status?: Json | null
          excerpt?: string | null
          fingerprint: string
          first_seen_at?: string | null
          id?: string
          image_attribution?: string | null
          image_hash?: string | null
          image_url?: string | null
          ingestion_run_id?: string | null
          ingestion_staging_id?: string | null
          is_featured?: boolean | null
          last_quality_run_at?: string | null
          last_seen_at?: string | null
          lgbti_relevance_score?: number | null
          needs_attention?: boolean | null
          published_at: string
          publisher_name?: string | null
          quality_decision?: Json | null
          quality_pipeline_version?: string | null
          quality_score?: number | null
          quality_score_before?: number | null
          quality_status?: string | null
          relevance_score?: number | null
          seen_count?: number | null
          sensitivity_flags?: Json | null
          sentiment?: string | null
          slug: string
          source_id: string
          tags?: string[] | null
          title: string
          updated_at?: string
          url: string
          views_count?: number | null
        }
        Update: {
          author?: string | null
          auto_publish_blocked_reasons?: string[] | null
          category?: string
          city_ids?: string[] | null
          classified_at?: string | null
          content?: string | null
          content_hash?: string | null
          country_ids?: string[] | null
          created_at?: string
          duplicate_of_id?: string | null
          enrichment_status?: Json | null
          excerpt?: string | null
          fingerprint?: string
          first_seen_at?: string | null
          id?: string
          image_attribution?: string | null
          image_hash?: string | null
          image_url?: string | null
          ingestion_run_id?: string | null
          ingestion_staging_id?: string | null
          is_featured?: boolean | null
          last_quality_run_at?: string | null
          last_seen_at?: string | null
          lgbti_relevance_score?: number | null
          needs_attention?: boolean | null
          published_at?: string
          publisher_name?: string | null
          quality_decision?: Json | null
          quality_pipeline_version?: string | null
          quality_score?: number | null
          quality_score_before?: number | null
          quality_status?: string | null
          relevance_score?: number | null
          seen_count?: number | null
          sensitivity_flags?: Json | null
          sentiment?: string | null
          slug?: string
          source_id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_articles_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_articles_originals: {
        Row: {
          article_id: string
          original_content: string | null
          original_excerpt: string | null
          original_image_url: string | null
          original_status: string | null
          original_tags: Json | null
          original_title: string | null
          pipeline_version: string
          snapshot_at: string
        }
        Insert: {
          article_id: string
          original_content?: string | null
          original_excerpt?: string | null
          original_image_url?: string | null
          original_status?: string | null
          original_tags?: Json | null
          original_title?: string | null
          pipeline_version: string
          snapshot_at?: string
        }
        Update: {
          article_id?: string
          original_content?: string | null
          original_excerpt?: string | null
          original_image_url?: string | null
          original_status?: string | null
          original_tags?: Json | null
          original_title?: string | null
          pipeline_version?: string
          snapshot_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_originals_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: true
            referencedRelation: "news_articles"
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
      news_dedup_audit: {
        Row: {
          candidate_fingerprint: string | null
          candidate_published_at: string | null
          candidate_title: string | null
          candidate_url: string | null
          created_at: string | null
          details: Json | null
          id: string
          match_decision: string
          match_score: number | null
          match_strategy: string
          matched_article_id: string | null
          pipeline_run_id: string | null
          source_id: string | null
          staging_id: string | null
        }
        Insert: {
          candidate_fingerprint?: string | null
          candidate_published_at?: string | null
          candidate_title?: string | null
          candidate_url?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          match_decision: string
          match_score?: number | null
          match_strategy: string
          matched_article_id?: string | null
          pipeline_run_id?: string | null
          source_id?: string | null
          staging_id?: string | null
        }
        Update: {
          candidate_fingerprint?: string | null
          candidate_published_at?: string | null
          candidate_title?: string | null
          candidate_url?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          match_decision?: string
          match_score?: number | null
          match_strategy?: string
          matched_article_id?: string | null
          pipeline_run_id?: string | null
          source_id?: string | null
          staging_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_dedup_audit_matched_article_id_fkey"
            columns: ["matched_article_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_dedup_audit_pipeline_run_id_fkey"
            columns: ["pipeline_run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_dedup_audit_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
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
      news_quality_settings: {
        Row: {
          auto_publish_enabled: boolean
          enabled: boolean
          id: number
          image_replacement_enabled: boolean
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_publish_enabled?: boolean
          enabled?: boolean
          id?: number
          image_replacement_enabled?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_publish_enabled?: boolean
          enabled?: boolean
          id?: number
          image_replacement_enabled?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      news_sources: {
        Row: {
          articles_fetched: number | null
          auto_paused: boolean
          auto_paused_reason: string | null
          auto_publish: boolean
          auto_publish_since: string | null
          avg_articles_per_fetch: number | null
          backoff_until: string | null
          category: string
          consecutive_failures: number
          created_at: string
          fetch_frequency: number
          id: string
          is_active: boolean
          keywords: string[] | null
          last_error: string | null
          last_fetched_at: string | null
          last_successful_fetch: string | null
          name: string
          reliability_score: number | null
          source_type: string
          status: string | null
          updated_at: string
          url: string
        }
        Insert: {
          articles_fetched?: number | null
          auto_paused?: boolean
          auto_paused_reason?: string | null
          auto_publish?: boolean
          auto_publish_since?: string | null
          avg_articles_per_fetch?: number | null
          backoff_until?: string | null
          category?: string
          consecutive_failures?: number
          created_at?: string
          fetch_frequency?: number
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          last_error?: string | null
          last_fetched_at?: string | null
          last_successful_fetch?: string | null
          name: string
          reliability_score?: number | null
          source_type?: string
          status?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          articles_fetched?: number | null
          auto_paused?: boolean
          auto_paused_reason?: string | null
          auto_publish?: boolean
          auto_publish_since?: string | null
          avg_articles_per_fetch?: number | null
          backoff_until?: string | null
          category?: string
          consecutive_failures?: number
          created_at?: string
          fetch_frequency?: number
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          last_error?: string | null
          last_fetched_at?: string | null
          last_successful_fetch?: string | null
          name?: string
          reliability_score?: number | null
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
      packing_suggestion_cache: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          snapshot_hash: string
          suggestions: Json
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          snapshot_hash: string
          suggestions: Json
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          snapshot_hash?: string
          suggestions?: Json
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_suggestion_cache_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
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
      personalities: {
        Row: {
          achievements: Json | null
          bio: string | null
          birth_date: string | null
          birth_place: string | null
          cause_of_death: string | null
          city_id: string | null
          classified_at: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          death_date: string | null
          death_place: string | null
          description: string | null
          duplicate_of_id: string | null
          enrichment_status: Json | null
          external_ids: Json | null
          fields: Json | null
          geo_linked_at: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          is_living: boolean | null
          last_refreshed_at: string | null
          lgbti_connection: string | null
          lgbti_details: string | null
          lgbti_relevance_score: number | null
          name: string
          name_initial: string | null
          name_normalized: string | null
          nationality: string | null
          needs_attention: boolean | null
          next_concerts: Json | null
          payload_hash: string | null
          profession: string | null
          profile_url: string | null
          pronouns: string | null
          quality_score: number | null
          regulatory_notes: string | null
          sanctions_status: string | null
          sensitivity_flags: Json | null
          slug: string
          social_links: Json | null
          tags: string[] | null
          top_book: string | null
          updated_at: string
          verification_status: string | null
          view_count: number | null
          visibility: string | null
          website_url: string | null
          wikidata_qid: string | null
        }
        Insert: {
          achievements?: Json | null
          bio?: string | null
          birth_date?: string | null
          birth_place?: string | null
          cause_of_death?: string | null
          city_id?: string | null
          classified_at?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          death_date?: string | null
          death_place?: string | null
          description?: string | null
          duplicate_of_id?: string | null
          enrichment_status?: Json | null
          external_ids?: Json | null
          fields?: Json | null
          geo_linked_at?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_living?: boolean | null
          last_refreshed_at?: string | null
          lgbti_connection?: string | null
          lgbti_details?: string | null
          lgbti_relevance_score?: number | null
          name: string
          name_initial?: string | null
          name_normalized?: string | null
          nationality?: string | null
          needs_attention?: boolean | null
          next_concerts?: Json | null
          payload_hash?: string | null
          profession?: string | null
          profile_url?: string | null
          pronouns?: string | null
          quality_score?: number | null
          regulatory_notes?: string | null
          sanctions_status?: string | null
          sensitivity_flags?: Json | null
          slug: string
          social_links?: Json | null
          tags?: string[] | null
          top_book?: string | null
          updated_at?: string
          verification_status?: string | null
          view_count?: number | null
          visibility?: string | null
          website_url?: string | null
          wikidata_qid?: string | null
        }
        Update: {
          achievements?: Json | null
          bio?: string | null
          birth_date?: string | null
          birth_place?: string | null
          cause_of_death?: string | null
          city_id?: string | null
          classified_at?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          death_date?: string | null
          death_place?: string | null
          description?: string | null
          duplicate_of_id?: string | null
          enrichment_status?: Json | null
          external_ids?: Json | null
          fields?: Json | null
          geo_linked_at?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          is_living?: boolean | null
          last_refreshed_at?: string | null
          lgbti_connection?: string | null
          lgbti_details?: string | null
          lgbti_relevance_score?: number | null
          name?: string
          name_initial?: string | null
          name_normalized?: string | null
          nationality?: string | null
          needs_attention?: boolean | null
          next_concerts?: Json | null
          payload_hash?: string | null
          profession?: string | null
          profile_url?: string | null
          pronouns?: string | null
          quality_score?: number | null
          regulatory_notes?: string | null
          sanctions_status?: string | null
          sensitivity_flags?: Json | null
          slug?: string
          social_links?: Json | null
          tags?: string[] | null
          top_book?: string | null
          updated_at?: string
          verification_status?: string | null
          view_count?: number | null
          visibility?: string | null
          website_url?: string | null
          wikidata_qid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personalities_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personalities_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personalities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personalities_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "personalities"
            referencedColumns: ["id"]
          },
        ]
      }
      personality_sources: {
        Row: {
          confidence: number | null
          first_seen_at: string | null
          id: string
          is_primary: boolean | null
          last_seen_at: string | null
          payload_hash: string | null
          personality_id: string
          raw: Json | null
          source_entity_id: string | null
          source_slug: string
          source_url: string | null
        }
        Insert: {
          confidence?: number | null
          first_seen_at?: string | null
          id?: string
          is_primary?: boolean | null
          last_seen_at?: string | null
          payload_hash?: string | null
          personality_id: string
          raw?: Json | null
          source_entity_id?: string | null
          source_slug: string
          source_url?: string | null
        }
        Update: {
          confidence?: number | null
          first_seen_at?: string | null
          id?: string
          is_primary?: boolean | null
          last_seen_at?: string | null
          payload_hash?: string | null
          personality_id?: string
          raw?: Json | null
          source_entity_id?: string | null
          source_slug?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personality_sources_personality_id_fkey"
            columns: ["personality_id"]
            isOneToOne: false
            referencedRelation: "personalities"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_definition_versions: {
        Row: {
          default_context: Json
          description: string | null
          display_name: string | null
          edges: Json
          id: string
          name: string
          nodes: Json
          pipeline_id: string
          saved_at: string
          saved_by: string | null
          schedule: string | null
          version: number
        }
        Insert: {
          default_context?: Json
          description?: string | null
          display_name?: string | null
          edges?: Json
          id?: string
          name: string
          nodes?: Json
          pipeline_id: string
          saved_at?: string
          saved_by?: string | null
          schedule?: string | null
          version: number
        }
        Update: {
          default_context?: Json
          description?: string | null
          display_name?: string | null
          edges?: Json
          id?: string
          name?: string
          nodes?: Json
          pipeline_id?: string
          saved_at?: string
          saved_by?: string | null
          schedule?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_definition_versions_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_definitions: {
        Row: {
          created_at: string | null
          created_by: string | null
          default_context: Json | null
          description: string | null
          display_name: string | null
          edges: Json | null
          id: string
          is_enabled: boolean | null
          is_template: boolean | null
          max_concurrency: number | null
          name: string
          nodes: Json | null
          schedule: string | null
          timeout_seconds: number | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          default_context?: Json | null
          description?: string | null
          display_name?: string | null
          edges?: Json | null
          id?: string
          is_enabled?: boolean | null
          is_template?: boolean | null
          max_concurrency?: number | null
          name: string
          nodes?: Json | null
          schedule?: string | null
          timeout_seconds?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          default_context?: Json | null
          description?: string | null
          display_name?: string | null
          edges?: Json | null
          id?: string
          is_enabled?: boolean | null
          is_template?: boolean | null
          max_concurrency?: number | null
          name?: string
          nodes?: Json | null
          schedule?: string | null
          timeout_seconds?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
      pipeline_errors: {
        Row: {
          context: Json | null
          created_at: string
          function_name: string
          id: number
          message: string
          pipeline_run_id: string | null
          severity: string
          stack: string | null
          staging_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          function_name: string
          id?: number
          message: string
          pipeline_run_id?: string | null
          severity?: string
          stack?: string | null
          staging_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          function_name?: string
          id?: number
          message?: string
          pipeline_run_id?: string | null
          severity?: string
          stack?: string | null
          staging_id?: string | null
        }
        Relationships: []
      }
      pipeline_health_alerts: {
        Row: {
          detail: Json
          escalated_submission_id: string | null
          first_seen_at: string
          id: string
          kind: string
          last_seen_at: string
          resolved_at: string | null
          subject: string
        }
        Insert: {
          detail?: Json
          escalated_submission_id?: string | null
          first_seen_at?: string
          id?: string
          kind: string
          last_seen_at?: string
          resolved_at?: string | null
          subject: string
        }
        Update: {
          detail?: Json
          escalated_submission_id?: string | null
          first_seen_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          resolved_at?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_health_alerts_escalated_submission_id_fkey"
            columns: ["escalated_submission_id"]
            isOneToOne: false
            referencedRelation: "community_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_health_alerts_escalated_submission_id_fkey"
            columns: ["escalated_submission_id"]
            isOneToOne: false
            referencedRelation: "v_api_error_daily"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      pipeline_node_templates: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          edges: Json
          id: string
          name: string
          nodes: Json
          updated_at: string
          use_count: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          id?: string
          name: string
          nodes?: Json
          updated_at?: string
          use_count?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          id?: string
          name?: string
          nodes?: Json
          updated_at?: string
          use_count?: number
        }
        Relationships: []
      }
      pipeline_node_types: {
        Row: {
          category: string
          color: string | null
          config_schema: Json | null
          created_at: string | null
          description: string | null
          display_name: string
          edge_function: string | null
          icon: string | null
          id: string
          input_ports: Json | null
          is_enabled: boolean | null
          output_ports: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          category: string
          color?: string | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          display_name: string
          edge_function?: string | null
          icon?: string | null
          id?: string
          input_ports?: Json | null
          is_enabled?: boolean | null
          output_ports?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          color?: string | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          edge_function?: string | null
          icon?: string | null
          id?: string
          input_ports?: Json | null
          is_enabled?: boolean | null
          output_ports?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pipeline_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          permission: string
          pipeline_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission: string
          pipeline_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          permission?: string
          pipeline_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_permissions_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          completed_at: string | null
          context: Json | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          items_failed: number | null
          items_processed: number | null
          items_succeeded: number | null
          items_total: number | null
          node_states: Json | null
          pipeline_id: string | null
          pipeline_name: string
          pipeline_snapshot: Json | null
          pipeline_version: number | null
          started_at: string | null
          status: string
          triggered_by: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          context?: Json | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_failed?: number | null
          items_processed?: number | null
          items_succeeded?: number | null
          items_total?: number | null
          node_states?: Json | null
          pipeline_id?: string | null
          pipeline_name: string
          pipeline_snapshot?: Json | null
          pipeline_version?: number | null
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          context?: Json | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_failed?: number | null
          items_processed?: number | null
          items_succeeded?: number | null
          items_total?: number | null
          node_states?: Json | null
          pipeline_id?: string | null
          pipeline_name?: string
          pipeline_snapshot?: Json | null
          pipeline_version?: number | null
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      placeholder_images: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          file_size: number | null
          filename: string
          height: number | null
          id: string
          is_active: boolean | null
          mime_type: string | null
          storage_path: string
          updated_at: string | null
          width: number | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_size?: number | null
          filename: string
          height?: number | null
          id?: string
          is_active?: boolean | null
          mime_type?: string | null
          storage_path: string
          updated_at?: string | null
          width?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_size?: number | null
          filename?: string
          height?: number | null
          id?: string
          is_active?: boolean | null
          mime_type?: string | null
          storage_path?: string
          updated_at?: string | null
          width?: number | null
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
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
          avatar_type: string | null
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
          dating_profile: Json | null
          diet_preferences: string[] | null
          disability_status: string | null
          display_name: string | null
          drinking_preference: string | null
          education: string | null
          email: string | null
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
          identity_details: Json | null
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
          lifestyle: Json | null
          location: string | null
          looking_for: string[] | null
          love_languages: string[] | null
          mailbox_address: string | null
          medication_status: string | null
          mental_health_advocacy: boolean | null
          mental_health_openness: string | null
          moderation_status: string
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
          photos_visibility: string | null
          physical_affection_preference: string | null
          physical_attributes: Json | null
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
          avatar_type?: string | null
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
          dating_profile?: Json | null
          diet_preferences?: string[] | null
          disability_status?: string | null
          display_name?: string | null
          drinking_preference?: string | null
          education?: string | null
          email?: string | null
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
          identity_details?: Json | null
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
          lifestyle?: Json | null
          location?: string | null
          looking_for?: string[] | null
          love_languages?: string[] | null
          mailbox_address?: string | null
          medication_status?: string | null
          mental_health_advocacy?: boolean | null
          mental_health_openness?: string | null
          moderation_status?: string
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
          photos_visibility?: string | null
          physical_affection_preference?: string | null
          physical_attributes?: Json | null
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
          avatar_type?: string | null
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
          dating_profile?: Json | null
          diet_preferences?: string[] | null
          disability_status?: string | null
          display_name?: string | null
          drinking_preference?: string | null
          education?: string | null
          email?: string | null
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
          identity_details?: Json | null
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
          lifestyle?: Json | null
          location?: string | null
          looking_for?: string[] | null
          love_languages?: string[] | null
          mailbox_address?: string | null
          medication_status?: string | null
          mental_health_advocacy?: boolean | null
          mental_health_openness?: string | null
          moderation_status?: string
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
          photos_visibility?: string | null
          physical_affection_preference?: string | null
          physical_attributes?: Json | null
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
      profiles_audit_log: {
        Row: {
          accessed_columns: string[] | null
          accessing_user_id: string | null
          action: string
          created_at: string | null
          id: string
          ip_address: unknown
          profile_user_id: string
          user_agent: string | null
        }
        Insert: {
          accessed_columns?: string[] | null
          accessing_user_id?: string | null
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          profile_user_id: string
          user_agent?: string | null
        }
        Update: {
          accessed_columns?: string[] | null
          accessing_user_id?: string | null
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          profile_user_id?: string
          user_agent?: string | null
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
      push_sent: {
        Row: {
          day_bucket: string
          id: string
          kind: string
          ref_id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          day_bucket: string
          id?: string
          kind: string
          ref_id: string
          sent_at?: string
          user_id: string
        }
        Update: {
          day_bucket?: string
          id?: string
          kind?: string
          ref_id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_success_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quality_backfill_jobs: {
        Row: {
          article_id: string
          attempts: number
          created_at: string
          decision: Json | null
          dry_run: boolean
          error: string | null
          id: string
          mode: string
          pipeline_version: string | null
          processed_at: string | null
          status: string
        }
        Insert: {
          article_id: string
          attempts?: number
          created_at?: string
          decision?: Json | null
          dry_run?: boolean
          error?: string | null
          id?: string
          mode?: string
          pipeline_version?: string | null
          processed_at?: string | null
          status?: string
        }
        Update: {
          article_id?: string
          attempts?: number
          created_at?: string
          decision?: Json | null
          dry_run?: boolean
          error?: string | null
          id?: string
          mode?: string
          pipeline_version?: string | null
          processed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_backfill_jobs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "news_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      queer_villages: {
        Row: {
          boundaries: Json | null
          city_id: string
          country_id: string
          created_at: string
          created_by: string | null
          description: string | null
          featured: boolean | null
          history: string | null
          id: string
          image_metadata: Json | null
          image_url: string | null
          images: string[] | null
          latitude: number | null
          longitude: number | null
          name: string
          notable_landmarks: string[] | null
          slug: string
          tags: string[] | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          boundaries?: Json | null
          city_id: string
          country_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          featured?: boolean | null
          history?: string | null
          id?: string
          image_metadata?: Json | null
          image_url?: string | null
          images?: string[] | null
          latitude?: number | null
          longitude?: number | null
          name: string
          notable_landmarks?: string[] | null
          slug: string
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          boundaries?: Json | null
          city_id?: string
          country_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          featured?: boolean | null
          history?: string | null
          id?: string
          image_metadata?: Json | null
          image_url?: string | null
          images?: string[] | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          notable_landmarks?: string[] | null
          slug?: string
          tags?: string[] | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "queer_villages_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queer_villages_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queer_villages_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
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
      redirect_events: {
        Row: {
          country: string | null
          id: number
          ip_hash: string | null
          path: string
          query: string | null
          redirect_id: string
          referer: string | null
          status: number
          ts: string
          user_agent: string | null
        }
        Insert: {
          country?: string | null
          id?: number
          ip_hash?: string | null
          path: string
          query?: string | null
          redirect_id: string
          referer?: string | null
          status: number
          ts?: string
          user_agent?: string | null
        }
        Update: {
          country?: string | null
          id?: number
          ip_hash?: string | null
          path?: string
          query?: string | null
          redirect_id?: string
          referer?: string | null
          status?: number
          ts?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redirect_events_redirect_id_fkey"
            columns: ["redirect_id"]
            isOneToOne: false
            referencedRelation: "redirects"
            referencedColumns: ["id"]
          },
        ]
      }
      redirects: {
        Row: {
          click_count: number
          click_limit: number | null
          created_at: string
          created_by: string | null
          end_at: string | null
          id: string
          is_enabled: boolean
          match_kind: Database["public"]["Enums"]["redirect_match_kind"]
          notes: string | null
          preserve_query: boolean
          query_mode: Database["public"]["Enums"]["redirect_query_mode"]
          query_override: Json | null
          slug: string | null
          source_path: string | null
          start_at: string | null
          status_code: number
          target: string
          type: Database["public"]["Enums"]["redirect_type"]
          updated_at: string
          utm_defaults: Json | null
        }
        Insert: {
          click_count?: number
          click_limit?: number | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          is_enabled?: boolean
          match_kind?: Database["public"]["Enums"]["redirect_match_kind"]
          notes?: string | null
          preserve_query?: boolean
          query_mode?: Database["public"]["Enums"]["redirect_query_mode"]
          query_override?: Json | null
          slug?: string | null
          source_path?: string | null
          start_at?: string | null
          status_code?: number
          target: string
          type?: Database["public"]["Enums"]["redirect_type"]
          updated_at?: string
          utm_defaults?: Json | null
        }
        Update: {
          click_count?: number
          click_limit?: number | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          id?: string
          is_enabled?: boolean
          match_kind?: Database["public"]["Enums"]["redirect_match_kind"]
          notes?: string | null
          preserve_query?: boolean
          query_mode?: Database["public"]["Enums"]["redirect_query_mode"]
          query_override?: Json | null
          slug?: string | null
          source_path?: string | null
          start_at?: string | null
          status_code?: number
          target?: string
          type?: Database["public"]["Enums"]["redirect_type"]
          updated_at?: string
          utm_defaults?: Json | null
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
      reservations: {
        Row: {
          attachment_urls: string[] | null
          booking_url: string | null
          cancellation_policy: Json | null
          cancellation_url: string | null
          city_id: string | null
          confirmation_code: string | null
          country_id: string | null
          created_at: string
          currency: string | null
          end_at: string | null
          id: string
          notes: string | null
          payment_status: string | null
          provider: string | null
          provider_booking_id: string | null
          raw_provider_data: Json | null
          source: string
          start_at: string | null
          status: string
          timezone: string | null
          title: string
          total_amount: number | null
          trip_day_id: string | null
          trip_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_urls?: string[] | null
          booking_url?: string | null
          cancellation_policy?: Json | null
          cancellation_url?: string | null
          city_id?: string | null
          confirmation_code?: string | null
          country_id?: string | null
          created_at?: string
          currency?: string | null
          end_at?: string | null
          id?: string
          notes?: string | null
          payment_status?: string | null
          provider?: string | null
          provider_booking_id?: string | null
          raw_provider_data?: Json | null
          source: string
          start_at?: string | null
          status?: string
          timezone?: string | null
          title: string
          total_amount?: number | null
          trip_day_id?: string | null
          trip_id?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_urls?: string[] | null
          booking_url?: string | null
          cancellation_policy?: Json | null
          cancellation_url?: string | null
          city_id?: string | null
          confirmation_code?: string | null
          country_id?: string | null
          created_at?: string
          currency?: string | null
          end_at?: string | null
          id?: string
          notes?: string | null
          payment_status?: string | null
          provider?: string | null
          provider_booking_id?: string | null
          raw_provider_data?: Json | null
          source?: string
          start_at?: string | null
          status?: string
          timezone?: string | null
          title?: string
          total_amount?: number | null
          trip_day_id?: string | null
          trip_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_trip_day_id_fkey"
            columns: ["trip_day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      review_queue: {
        Row: {
          created_at: string | null
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          review_type: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_type: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_type?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      scrape_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          items_duplicate: number | null
          items_error: number | null
          items_found: number | null
          items_new: number | null
          items_staged: number | null
          job_id: string | null
          pages_crawled: number | null
          run_config: Json | null
          run_log: Json | null
          source_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_duplicate?: number | null
          items_error?: number | null
          items_found?: number | null
          items_new?: number | null
          items_staged?: number | null
          job_id?: string | null
          pages_crawled?: number | null
          run_config?: Json | null
          run_log?: Json | null
          source_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          items_duplicate?: number | null
          items_error?: number | null
          items_found?: number | null
          items_new?: number | null
          items_staged?: number | null
          job_id?: string | null
          pages_crawled?: number | null
          run_config?: Json | null
          run_log?: Json | null
          source_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs_enhanced"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "scrape_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_sources: {
        Row: {
          consecutive_failures: number | null
          content_type: string
          created_at: string | null
          id: string
          is_enabled: boolean | null
          last_error: string | null
          last_run_at: string | null
          last_success_at: string | null
          max_pages_per_run: number | null
          name: string
          priority: number | null
          rate_limit_ms: number | null
          respect_robots_txt: boolean | null
          schedule_cron: string | null
          schedule_interval_hours: number | null
          scrape_config: Json
          scrape_method: string
          slug: string
          target_table: string
          total_items_fetched: number | null
          total_runs: number | null
          updated_at: string | null
          url: string
          user_agent: string | null
        }
        Insert: {
          consecutive_failures?: number | null
          content_type: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          max_pages_per_run?: number | null
          name: string
          priority?: number | null
          rate_limit_ms?: number | null
          respect_robots_txt?: boolean | null
          schedule_cron?: string | null
          schedule_interval_hours?: number | null
          scrape_config?: Json
          scrape_method?: string
          slug: string
          target_table: string
          total_items_fetched?: number | null
          total_runs?: number | null
          updated_at?: string | null
          url: string
          user_agent?: string | null
        }
        Update: {
          consecutive_failures?: number | null
          content_type?: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          last_error?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          max_pages_per_run?: number | null
          name?: string
          priority?: number | null
          rate_limit_ms?: number | null
          respect_robots_txt?: boolean | null
          schedule_cron?: string | null
          schedule_interval_hours?: number | null
          scrape_config?: Json
          scrape_method?: string
          slug?: string
          target_table?: string
          total_items_fetched?: number | null
          total_runs?: number | null
          updated_at?: string | null
          url?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      scraper_dedupe_decisions: {
        Row: {
          action: string | null
          confidence: number
          created_at: string | null
          decided_by: string
          decision: string
          entity_a_id: string
          entity_b_id: string | null
          entity_type: string
          id: string
          incoming_source_id: string | null
          incoming_source_name: string | null
          match_method: string
          pipeline_run_id: string | null
          rules_fired: Json | null
          staging_id: string | null
        }
        Insert: {
          action?: string | null
          confidence: number
          created_at?: string | null
          decided_by?: string
          decision: string
          entity_a_id: string
          entity_b_id?: string | null
          entity_type: string
          id?: string
          incoming_source_id?: string | null
          incoming_source_name?: string | null
          match_method: string
          pipeline_run_id?: string | null
          rules_fired?: Json | null
          staging_id?: string | null
        }
        Update: {
          action?: string | null
          confidence?: number
          created_at?: string | null
          decided_by?: string
          decision?: string
          entity_a_id?: string
          entity_b_id?: string | null
          entity_type?: string
          id?: string
          incoming_source_id?: string | null
          incoming_source_name?: string | null
          match_method?: string
          pipeline_run_id?: string | null
          rules_fired?: Json | null
          staging_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraper_dedupe_decisions_pipeline_run_id_fkey"
            columns: ["pipeline_run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraper_dedupe_decisions_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "geo_merge_candidates"
            referencedColumns: ["staging_id"]
          },
          {
            foreignKeyName: "scraper_dedupe_decisions_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "ingestion_staging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraper_dedupe_decisions_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stuck_items"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_entity_map: {
        Row: {
          canonical_entity_id: string
          confidence: number | null
          created_at: string | null
          entity_type: string
          id: string
          source_id: string
          source_name: string
          updated_at: string | null
        }
        Insert: {
          canonical_entity_id: string
          confidence?: number | null
          created_at?: string | null
          entity_type: string
          id?: string
          source_id: string
          source_name: string
          updated_at?: string | null
        }
        Update: {
          canonical_entity_id?: string
          confidence?: number | null
          created_at?: string | null
          entity_type?: string
          id?: string
          source_id?: string
          source_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scraper_events: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          country: string | null
          created_at: string | null
          description: string | null
          end_datetime: string | null
          first_seen_at: string | null
          id: string
          images: string[] | null
          language: string | null
          last_seen_at: string | null
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          price_range: string | null
          region: string | null
          source_url: string
          start_datetime: string
          tags: string[] | null
          ticket_url: string | null
          timezone: string | null
          updated_at: string | null
          venue_name: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          end_datetime?: string | null
          first_seen_at?: string | null
          id?: string
          images?: string[] | null
          language?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name: string
          price_range?: string | null
          region?: string | null
          source_url: string
          start_datetime: string
          tags?: string[] | null
          ticket_url?: string | null
          timezone?: string | null
          updated_at?: string | null
          venue_name?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          end_datetime?: string | null
          first_seen_at?: string | null
          id?: string
          images?: string[] | null
          language?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name?: string
          price_range?: string | null
          region?: string | null
          source_url?: string
          start_datetime?: string
          tags?: string[] | null
          ticket_url?: string | null
          timezone?: string | null
          updated_at?: string | null
          venue_name?: string | null
          website?: string | null
        }
        Relationships: []
      }
      scraper_ingest_runs: {
        Row: {
          blocked_by_robots: number | null
          coverage_address: number | null
          coverage_description: number | null
          coverage_geo: number | null
          coverage_images: number | null
          coverage_phone: number | null
          coverage_tags: number | null
          coverage_website: number | null
          entities_deduped: number | null
          entities_inserted: number | null
          entities_parsed: number | null
          entities_updated: number | null
          entity_type: string | null
          errors: Json | null
          failed_requests: number | null
          finished_at: string | null
          id: string
          pages_fetched: number | null
          source_name: string
          started_at: string | null
          status: string
        }
        Insert: {
          blocked_by_robots?: number | null
          coverage_address?: number | null
          coverage_description?: number | null
          coverage_geo?: number | null
          coverage_images?: number | null
          coverage_phone?: number | null
          coverage_tags?: number | null
          coverage_website?: number | null
          entities_deduped?: number | null
          entities_inserted?: number | null
          entities_parsed?: number | null
          entities_updated?: number | null
          entity_type?: string | null
          errors?: Json | null
          failed_requests?: number | null
          finished_at?: string | null
          id?: string
          pages_fetched?: number | null
          source_name: string
          started_at?: string | null
          status: string
        }
        Update: {
          blocked_by_robots?: number | null
          coverage_address?: number | null
          coverage_description?: number | null
          coverage_geo?: number | null
          coverage_images?: number | null
          coverage_phone?: number | null
          coverage_tags?: number | null
          coverage_website?: number | null
          entities_deduped?: number | null
          entities_inserted?: number | null
          entities_parsed?: number | null
          entities_updated?: number | null
          entity_type?: string | null
          errors?: Json | null
          failed_requests?: number | null
          finished_at?: string | null
          id?: string
          pages_fetched?: number | null
          source_name?: string
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      scraper_migrations: {
        Row: {
          applied_at: string | null
          id: number
          name: string
        }
        Insert: {
          applied_at?: string | null
          id?: number
          name: string
        }
        Update: {
          applied_at?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      scraper_normalize_rejections: {
        Row: {
          entity_type: string
          id: string
          raw_sample: Json | null
          reject_reason: string
          rejected_at: string | null
          source_id: string
          source_name: string
        }
        Insert: {
          entity_type: string
          id?: string
          raw_sample?: Json | null
          reject_reason: string
          rejected_at?: string | null
          source_id: string
          source_name: string
        }
        Update: {
          entity_type?: string
          id?: string
          raw_sample?: Json | null
          reject_reason?: string
          rejected_at?: string | null
          source_id?: string
          source_name?: string
        }
        Relationships: []
      }
      scraper_places: {
        Row: {
          city: string
          country: string
          created_at: string | null
          description: string | null
          first_seen_at: string | null
          id: string
          images: string[] | null
          language: string | null
          last_seen_at: string | null
          lat: number | null
          lng: number | null
          name: string
          region: string | null
          source_url: string
          tags: string[] | null
          updated_at: string | null
          wikipedia_url: string | null
        }
        Insert: {
          city: string
          country: string
          created_at?: string | null
          description?: string | null
          first_seen_at?: string | null
          id?: string
          images?: string[] | null
          language?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          region?: string | null
          source_url: string
          tags?: string[] | null
          updated_at?: string | null
          wikipedia_url?: string | null
        }
        Update: {
          city?: string
          country?: string
          created_at?: string | null
          description?: string | null
          first_seen_at?: string | null
          id?: string
          images?: string[] | null
          language?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          region?: string | null
          source_url?: string
          tags?: string[] | null
          updated_at?: string | null
          wikipedia_url?: string | null
        }
        Relationships: []
      }
      scraper_snapshots: {
        Row: {
          archived_at: string | null
          content: string | null
          content_encoding: string | null
          content_gz: string | null
          content_hash: string
          content_type: string
          fetched_at: string | null
          id: string
          r2_key: string | null
          source_name: string
          url: string
        }
        Insert: {
          archived_at?: string | null
          content?: string | null
          content_encoding?: string | null
          content_gz?: string | null
          content_hash: string
          content_type: string
          fetched_at?: string | null
          id?: string
          r2_key?: string | null
          source_name: string
          url: string
        }
        Update: {
          archived_at?: string | null
          content?: string | null
          content_encoding?: string | null
          content_gz?: string | null
          content_hash?: string
          content_type?: string
          fetched_at?: string | null
          id?: string
          r2_key?: string | null
          source_name?: string
          url?: string
        }
        Relationships: []
      }
      scraper_stays: {
        Row: {
          address: string | null
          category: string | null
          city: string
          country: string | null
          created_at: string | null
          description: string | null
          first_seen_at: string | null
          id: string
          images: string[] | null
          language: string | null
          last_seen_at: string | null
          lat: number | null
          lng: number | null
          name: string
          phone: string | null
          price_range: string | null
          region: string | null
          source_url: string
          tags: string[] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city: string
          country?: string | null
          created_at?: string | null
          description?: string | null
          first_seen_at?: string | null
          id?: string
          images?: string[] | null
          language?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          phone?: string | null
          price_range?: string | null
          region?: string | null
          source_url: string
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string
          country?: string | null
          created_at?: string | null
          description?: string | null
          first_seen_at?: string | null
          id?: string
          images?: string[] | null
          language?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          phone?: string | null
          price_range?: string | null
          region?: string | null
          source_url?: string
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      scraper_venues: {
        Row: {
          address: string | null
          category: string | null
          city: string
          country: string | null
          created_at: string | null
          description: string | null
          first_seen_at: string | null
          id: string
          images: string[] | null
          language: string | null
          last_seen_at: string | null
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          opening_hours: string | null
          phone: string | null
          price_range: string | null
          region: string | null
          source_url: string
          tags: string[] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city: string
          country?: string | null
          created_at?: string | null
          description?: string | null
          first_seen_at?: string | null
          id?: string
          images?: string[] | null
          language?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name: string
          opening_hours?: string | null
          phone?: string | null
          price_range?: string | null
          region?: string | null
          source_url: string
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string
          country?: string | null
          created_at?: string | null
          description?: string | null
          first_seen_at?: string | null
          id?: string
          images?: string[] | null
          language?: string | null
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name?: string
          opening_hours?: string | null
          phone?: string | null
          price_range?: string | null
          region?: string | null
          source_url?: string
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      search_queries: {
        Row: {
          clicked_entity_id: string | null
          clicked_entity_type: string | null
          created_at: string
          filters: Json | null
          had_rewrite: boolean | null
          id: string
          lang: string | null
          n_results: number | null
          query: string
          query_normalized: string | null
          session_id: string | null
          took_ms: number | null
          user_id: string | null
        }
        Insert: {
          clicked_entity_id?: string | null
          clicked_entity_type?: string | null
          created_at?: string
          filters?: Json | null
          had_rewrite?: boolean | null
          id?: string
          lang?: string | null
          n_results?: number | null
          query: string
          query_normalized?: string | null
          session_id?: string | null
          took_ms?: number | null
          user_id?: string | null
        }
        Update: {
          clicked_entity_id?: string | null
          clicked_entity_type?: string | null
          created_at?: string
          filters?: Json | null
          had_rewrite?: boolean | null
          id?: string
          lang?: string | null
          n_results?: number | null
          query?: string
          query_normalized?: string | null
          session_id?: string | null
          took_ms?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_monitoring: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          severity: string
          target_user_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          severity?: string
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          severity?: string
          target_user_id?: string | null
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
      source_coverage_targets: {
        Row: {
          accommodation_type: string | null
          actual_count: number
          city_id: string | null
          created_at: string
          entity_type: string
          expected_count: number | null
          id: number
          is_enabled: boolean
          last_run_at: string | null
          last_success_at: string | null
          source_slug: string
          success_ratio: number | null
          updated_at: string
        }
        Insert: {
          accommodation_type?: string | null
          actual_count?: number
          city_id?: string | null
          created_at?: string
          entity_type?: string
          expected_count?: number | null
          id?: number
          is_enabled?: boolean
          last_run_at?: string | null
          last_success_at?: string | null
          source_slug: string
          success_ratio?: number | null
          updated_at?: string
        }
        Update: {
          accommodation_type?: string | null
          actual_count?: number
          city_id?: string | null
          created_at?: string
          entity_type?: string
          expected_count?: number | null
          id?: number
          is_enabled?: boolean
          last_run_at?: string | null
          last_success_at?: string | null
          source_slug?: string
          success_ratio?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_coverage_targets_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_coverage_targets_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
        ]
      }
      source_reliability: {
        Row: {
          block_rate: number | null
          computed_at: string
          coverage_ratio: number | null
          entity_type: string
          quality_p25: number | null
          quality_p50: number | null
          rejection_rate: number | null
          sample_size: number
          source_slug: string
          weight: number | null
        }
        Insert: {
          block_rate?: number | null
          computed_at?: string
          coverage_ratio?: number | null
          entity_type: string
          quality_p25?: number | null
          quality_p50?: number | null
          rejection_rate?: number | null
          sample_size?: number
          source_slug: string
          weight?: number | null
        }
        Update: {
          block_rate?: number | null
          computed_at?: string
          coverage_ratio?: number | null
          entity_type?: string
          quality_p25?: number | null
          quality_p50?: number | null
          rejection_rate?: number | null
          sample_size?: number
          source_slug?: string
          weight?: number | null
        }
        Relationships: []
      }
      suspicious_activities: {
        Row: {
          activity_type: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
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
          ip_address?: unknown
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
          ip_address?: unknown
          is_resolved?: boolean
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tag_aliases: {
        Row: {
          alias_name: string
          alias_slug: string
          alias_type: string
          canonical_tag_id: string
          created_at: string
          id: string
          review_status: string | null
        }
        Insert: {
          alias_name: string
          alias_slug: string
          alias_type?: string
          canonical_tag_id: string
          created_at?: string
          id?: string
          review_status?: string | null
        }
        Update: {
          alias_name?: string
          alias_slug?: string
          alias_type?: string
          canonical_tag_id?: string
          created_at?: string
          id?: string
          review_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_aliases_canonical_tag_id_fkey"
            columns: ["canonical_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_aliases_canonical_tag_id_fkey"
            columns: ["canonical_tag_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_aliases_canonical_tag_id_fkey"
            columns: ["canonical_tag_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_aliases_canonical_tag_id_fkey"
            columns: ["canonical_tag_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          level: number
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tag_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_category_assignments: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_primary: boolean
          tag_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          tag_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_category_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tag_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_category_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_category_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_category_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_category_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_change_log: {
        Row: {
          action_type: string
          actor: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string | null
          id: number
          reason: string | null
          tag_id: string | null
        }
        Insert: {
          action_type: string
          actor?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          id?: number
          reason?: string | null
          tag_id?: string | null
        }
        Update: {
          action_type?: string
          actor?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string | null
          id?: number
          reason?: string | null
          tag_id?: string | null
        }
        Relationships: []
      }
      tag_embeddings: {
        Row: {
          embedding: string
          model: string
          source_text: string
          tag_id: string
          updated_at: string | null
        }
        Insert: {
          embedding: string
          model?: string
          source_text: string
          tag_id: string
          updated_at?: string | null
        }
        Update: {
          embedding?: string
          model?: string
          source_text?: string
          tag_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_embeddings_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: true
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_embeddings_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: true
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_embeddings_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: true
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_embeddings_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: true
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
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
      tag_relations: {
        Row: {
          confidence: number | null
          id: string
          relation_type: string
          review_status: string | null
          source_tag_id: string
          target_tag_id: string
        }
        Insert: {
          confidence?: number | null
          id?: string
          relation_type: string
          review_status?: string | null
          source_tag_id: string
          target_tag_id: string
        }
        Update: {
          confidence?: number | null
          id?: string
          relation_type?: string
          review_status?: string | null
          source_tag_id?: string
          target_tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_relations_source_tag_id_fkey"
            columns: ["source_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_relations_source_tag_id_fkey"
            columns: ["source_tag_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_relations_source_tag_id_fkey"
            columns: ["source_tag_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_relations_source_tag_id_fkey"
            columns: ["source_tag_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_relations_target_tag_id_fkey"
            columns: ["target_tag_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_relations_target_tag_id_fkey"
            columns: ["target_tag_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_relations_target_tag_id_fkey"
            columns: ["target_tag_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_relations_target_tag_id_fkey"
            columns: ["target_tag_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
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
      tag_slug_redirects: {
        Row: {
          created_at: string | null
          id: number
          new_slug: string
          old_slug: string
          tag_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          new_slug: string
          old_slug: string
          tag_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          new_slug?: string
          old_slug?: string
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_slug_redirects_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_slug_redirects_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_slug_redirects_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_slug_redirects_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_sources: {
        Row: {
          claim_summary: string | null
          fetched_at: string | null
          id: string
          source_id: string | null
          source_type: string
          source_url: string | null
          tag_id: string
        }
        Insert: {
          claim_summary?: string | null
          fetched_at?: string | null
          id?: string
          source_id?: string | null
          source_type: string
          source_url?: string | null
          tag_id: string
        }
        Update: {
          claim_summary?: string | null
          fetched_at?: string | null
          id?: string
          source_id?: string | null
          source_type?: string
          source_url?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_sources_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_sources_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_sources_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_sources_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_suggestions: {
        Row: {
          ai_model: string | null
          batch_id: string | null
          confidence: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          suggested_name: string | null
          suggested_slug: string | null
          suggested_tag_name: string | null
          tag_id: string | null
        }
        Insert: {
          ai_model?: string | null
          batch_id?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          suggested_name?: string | null
          suggested_slug?: string | null
          suggested_tag_name?: string | null
          tag_id?: string | null
        }
        Update: {
          ai_model?: string | null
          batch_id?: string | null
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          suggested_name?: string | null
          suggested_slug?: string | null
          suggested_tag_name?: string | null
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tag_suggestions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_suggestions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_suggestions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tag_suggestions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
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
      trip_booking_clicks: {
        Row: {
          clicked_at: string
          destination_url: string
          id: string
          provider: string
          trip_id: string
          trip_place_id: string | null
          user_id: string | null
          vertical: string
        }
        Insert: {
          clicked_at?: string
          destination_url: string
          id?: string
          provider: string
          trip_id: string
          trip_place_id?: string | null
          user_id?: string | null
          vertical: string
        }
        Update: {
          clicked_at?: string
          destination_url?: string
          id?: string
          provider?: string
          trip_id?: string
          trip_place_id?: string | null
          user_id?: string | null
          vertical?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_booking_clicks_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_booking_clicks_trip_place_id_fkey"
            columns: ["trip_place_id"]
            isOneToOne: false
            referencedRelation: "trip_places"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_budget_items: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          currency: string
          date: string | null
          id: string
          paid_by: string
          place_id: string | null
          receipt_url: string | null
          split_among: string[]
          title: string
          trip_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          currency: string
          date?: string | null
          id?: string
          paid_by: string
          place_id?: string | null
          receipt_url?: string | null
          split_among: string[]
          title: string
          trip_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          currency?: string
          date?: string | null
          id?: string
          paid_by?: string
          place_id?: string | null
          receipt_url?: string | null
          split_among?: string[]
          title?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_budget_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "trip_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_budget_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_concierge_messages: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          draft: Json | null
          id: string
          role: string
          trip_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          draft?: Json | null
          id?: string
          role: string
          trip_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          draft?: Json | null
          id?: string
          role?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_concierge_messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_days: {
        Row: {
          date: string
          id: string
          notes: string | null
          sort_order: number
          title: string | null
          trip_id: string
        }
        Insert: {
          date: string
          id?: string
          notes?: string | null
          sort_order?: number
          title?: string | null
          trip_id: string
        }
        Update: {
          date?: string
          id?: string
          notes?: string | null
          sort_order?: number
          title?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_documents: {
        Row: {
          country_id: string | null
          created_at: string
          doc_type: string
          expiry_date: string | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          notes: string | null
          storage_path: string
          title: string
          trip_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          country_id?: string | null
          created_at?: string
          doc_type: string
          expiry_date?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          storage_path: string
          title: string
          trip_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          country_id?: string | null
          created_at?: string
          doc_type?: string
          expiry_date?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          storage_path?: string
          title?: string
          trip_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_documents_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_geo_review_queue: {
        Row: {
          created_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_city_id: string | null
          resolved_country_id: string | null
          status: string
          suggested_matches: Json
          trip_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_city_id?: string | null
          resolved_country_id?: string | null
          status?: string
          suggested_matches?: Json
          trip_id: string
        }
        Update: {
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_city_id?: string | null
          resolved_country_id?: string | null
          status?: string
          suggested_matches?: Json
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_geo_review_queue_resolved_city_id_fkey"
            columns: ["resolved_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_geo_review_queue_resolved_city_id_fkey"
            columns: ["resolved_city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_geo_review_queue_resolved_country_id_fkey"
            columns: ["resolved_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_geo_review_queue_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          accepted_at: string | null
          id: string
          invited_at: string
          role: string
          trip_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          role?: string
          trip_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          id?: string
          invited_at?: string
          role?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trip_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trip_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trip_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          reactions: Json
          reply_to: string | null
          sender_id: string
          trip_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          reactions?: Json
          reply_to?: string | null
          sender_id: string
          trip_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          reactions?: Json
          reply_to?: string | null
          sender_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "trip_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_notes: {
        Row: {
          author_id: string
          category: string | null
          content: string | null
          created_at: string
          id: string
          is_pinned: boolean
          title: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          category?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          title?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          title?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_notes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_nudges: {
        Row: {
          action_label: string | null
          action_url: string | null
          body: string | null
          created_at: string
          dedupe_key: string
          dismissed_at: string | null
          id: string
          kind: string
          seen_at: string | null
          severity: string
          title: string
          trip_id: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          body?: string | null
          created_at?: string
          dedupe_key: string
          dismissed_at?: string | null
          id?: string
          kind: string
          seen_at?: string | null
          severity?: string
          title: string
          trip_id: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          body?: string | null
          created_at?: string
          dedupe_key?: string
          dismissed_at?: string | null
          id?: string
          kind?: string
          seen_at?: string | null
          severity?: string
          title?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_nudges_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_packing_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_checked: boolean
          marketplace_listing_id: string | null
          name: string
          quantity: number
          sort_order: number
          suggested_by: string | null
          suggestion_reason: string | null
          trip_id: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_checked?: boolean
          marketplace_listing_id?: string | null
          name: string
          quantity?: number
          sort_order?: number
          suggested_by?: string | null
          suggestion_reason?: string | null
          trip_id: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_checked?: boolean
          marketplace_listing_id?: string | null
          name?: string
          quantity?: number
          sort_order?: number
          suggested_by?: string | null
          suggestion_reason?: string | null
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_packing_items_marketplace_listing_id_fkey"
            columns: ["marketplace_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_packing_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_places: {
        Row: {
          category: string | null
          city_id: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          custom_address: string | null
          custom_name: string | null
          day_id: string | null
          duration_minutes: number | null
          end_time: string | null
          event_id: string | null
          hotel_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          sort_order: number
          start_time: string | null
          trip_id: string
          venue_id: string | null
        }
        Insert: {
          category?: string | null
          city_id?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_address?: string | null
          custom_name?: string | null
          day_id?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          event_id?: string | null
          hotel_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          sort_order?: number
          start_time?: string | null
          trip_id: string
          venue_id?: string | null
        }
        Update: {
          category?: string | null
          city_id?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_address?: string | null
          custom_name?: string | null
          day_id?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          event_id?: string | null
          hotel_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          sort_order?: number
          start_time?: string | null
          trip_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_places_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_places_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_places_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_places_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_places_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_places_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_places_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_places_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "trip_places_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_polls: {
        Row: {
          author_id: string
          created_at: string
          deadline: string | null
          id: string
          is_closed: boolean
          is_multiple_choice: boolean
          options: Json
          question: string
          trip_id: string
        }
        Insert: {
          author_id: string
          created_at?: string
          deadline?: string | null
          id?: string
          is_closed?: boolean
          is_multiple_choice?: boolean
          options?: Json
          question: string
          trip_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          deadline?: string | null
          id?: string
          is_closed?: boolean
          is_multiple_choice?: boolean
          options?: Json
          question?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_polls_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_recaps: {
        Row: {
          generated_at: string
          generated_by: string | null
          highlights: Json
          summary: string
          trip_id: string
        }
        Insert: {
          generated_at?: string
          generated_by?: string | null
          highlights?: Json
          summary: string
          trip_id: string
        }
        Update: {
          generated_at?: string
          generated_by?: string | null
          highlights?: Json
          summary?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_recaps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_safety_briefings: {
        Row: {
          article_count: number
          country_ids: string[]
          generated_at: string
          narrative: string
          risk_level: string | null
          trip_id: string
        }
        Insert: {
          article_count?: number
          country_ids?: string[]
          generated_at?: string
          narrative: string
          risk_level?: string | null
          trip_id: string
        }
        Update: {
          article_count?: number
          country_ids?: string[]
          generated_at?: string
          narrative?: string
          risk_level?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_safety_briefings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_share_comments: {
        Row: {
          body: string
          created_at: string
          display_name: string
          id: string
          place_id: string
          trip_id: string
          viewer_fingerprint: string | null
          viewer_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          display_name: string
          id?: string
          place_id: string
          trip_id: string
          viewer_fingerprint?: string | null
          viewer_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          display_name?: string
          id?: string
          place_id?: string
          trip_id?: string
          viewer_fingerprint?: string | null
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_share_comments_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "trip_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_comments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_share_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          place_id: string
          trip_id: string
          viewer_fingerprint: string | null
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          place_id: string
          trip_id: string
          viewer_fingerprint?: string | null
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          place_id?: string
          trip_id?: string
          viewer_fingerprint?: string | null
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_share_reactions_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "trip_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_reactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_share_views: {
        Row: {
          id: string
          referer_host: string | null
          share_id: string
          trip_id: string
          viewed_at: string
          viewer_user_id: string | null
        }
        Insert: {
          id?: string
          referer_host?: string | null
          share_id: string
          trip_id: string
          viewed_at?: string
          viewer_user_id?: string | null
        }
        Update: {
          id?: string
          referer_host?: string | null
          share_id?: string
          trip_id?: string
          viewed_at?: string
          viewer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_share_views_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "trip_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_views_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          permissions: Json
          token: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          permissions?: Json
          token?: string
          trip_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          permissions?: Json
          token?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_shares_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_suggestion_impressions: {
        Row: {
          external_url: string | null
          id: string
          listing_id: string | null
          partner_id: string | null
          rank_position: number | null
          shown_at: string
          suggestion_type: string
          trip_id: string
          user_id: string
        }
        Insert: {
          external_url?: string | null
          id?: string
          listing_id?: string | null
          partner_id?: string | null
          rank_position?: number | null
          shown_at?: string
          suggestion_type: string
          trip_id: string
          user_id: string
        }
        Update: {
          external_url?: string | null
          id?: string
          listing_id?: string | null
          partner_id?: string | null
          rank_position?: number | null
          shown_at?: string
          suggestion_type?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_suggestion_impressions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_suggestion_impressions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "affiliate_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_suggestion_impressions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          cover_image_url: string | null
          created_at: string
          currency: string
          description: string | null
          end_date: string | null
          id: string
          is_public: boolean
          owner_id: string
          primary_city_id: string
          primary_city_name: string | null
          primary_country_code: string | null
          primary_country_id: string
          start_date: string | null
          status: string
          timezone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_public?: boolean
          owner_id: string
          primary_city_id: string
          primary_city_name?: string | null
          primary_country_code?: string | null
          primary_country_id: string
          start_date?: string | null
          status?: string
          timezone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_public?: boolean
          owner_id?: string
          primary_city_id?: string
          primary_city_name?: string | null
          primary_country_code?: string | null
          primary_country_id?: string
          start_date?: string | null
          status?: string
          timezone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_owner_id_profiles_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trips_owner_id_profiles_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trips_owner_id_profiles_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trips_primary_city_id_fkey"
            columns: ["primary_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_primary_city_id_fkey"
            columns: ["primary_city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_primary_country_id_fkey"
            columns: ["primary_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_tags: {
        Row: {
          category: string | null
          category_id: string | null
          confidence_score: number | null
          created_at: string
          deprecated_at: string | null
          deprecation_reason: string | null
          description: string | null
          human_reviewed: boolean | null
          id: string
          image_alt: string | null
          image_attribution: string | null
          image_license: string | null
          image_prompt: string | null
          image_source: string | null
          image_url: string | null
          is_sensitive: boolean | null
          last_verified_at: string | null
          long_description: string | null
          merged_into_id: string | null
          name: string
          scientific_data: Json | null
          sensitive_topics: string[] | null
          short_description: string | null
          slug: string
          status: string
          updated_at: string
          usage_count: number | null
          verification_status: string | null
          wikidata_id: string | null
          wikipedia_url: string | null
          wolfram_enriched_at: string | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          confidence_score?: number | null
          created_at?: string
          deprecated_at?: string | null
          deprecation_reason?: string | null
          description?: string | null
          human_reviewed?: boolean | null
          id?: string
          image_alt?: string | null
          image_attribution?: string | null
          image_license?: string | null
          image_prompt?: string | null
          image_source?: string | null
          image_url?: string | null
          is_sensitive?: boolean | null
          last_verified_at?: string | null
          long_description?: string | null
          merged_into_id?: string | null
          name: string
          scientific_data?: Json | null
          sensitive_topics?: string[] | null
          short_description?: string | null
          slug: string
          status?: string
          updated_at?: string
          usage_count?: number | null
          verification_status?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
          wolfram_enriched_at?: string | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          confidence_score?: number | null
          created_at?: string
          deprecated_at?: string | null
          deprecation_reason?: string | null
          description?: string | null
          human_reviewed?: boolean | null
          id?: string
          image_alt?: string | null
          image_attribution?: string | null
          image_license?: string | null
          image_prompt?: string | null
          image_source?: string | null
          image_url?: string | null
          is_sensitive?: boolean | null
          last_verified_at?: string | null
          long_description?: string | null
          merged_into_id?: string | null
          name?: string
          scientific_data?: Json | null
          sensitive_topics?: string[] | null
          short_description?: string | null
          slug?: string
          status?: string
          updated_at?: string
          usage_count?: number | null
          verification_status?: string | null
          wikidata_id?: string | null
          wikipedia_url?: string | null
          wolfram_enriched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      user_email_tokens: {
        Row: {
          created_at: string
          revoked_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          revoked_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          revoked_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          metadata: Json | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          session_id?: string | null
          user_id?: string | null
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_passkey_enrollment: {
        Row: {
          created_at: string
          device_name: string | null
          enrolled_at: string | null
          id: string
          is_enrolled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          enrolled_at?: string | null
          id?: string
          is_enrolled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          enrolled_at?: string | null
          id?: string
          is_enrolled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_passkeys: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          credential_id_encrypted: string | null
          id: string
          is_revoked: boolean
          last_used_at: string | null
          passkey_encryption_key_id: string | null
          public_key: string
          public_key_encrypted: string | null
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          credential_id_encrypted?: string | null
          id?: string
          is_revoked?: boolean
          last_used_at?: string | null
          passkey_encryption_key_id?: string | null
          public_key: string
          public_key_encrypted?: string | null
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          credential_id_encrypted?: string | null
          id?: string
          is_revoked?: boolean
          last_used_at?: string | null
          passkey_encryption_key_id?: string | null
          public_key?: string
          public_key_encrypted?: string | null
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
      user_recommendations: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          expires_at: string
          id: string
          metadata: Json | null
          reason: string | null
          rec_type: string
          score: number
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          expires_at: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          rec_type: string
          score?: number
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          rec_type?: string
          score?: number
          session_id?: string | null
          user_id?: string | null
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
          encryption_key_id: string | null
          expires_at: string
          id: string
          ip_address: unknown
          ip_address_encrypted: string | null
          is_active: boolean
          last_activity: string
          session_token: string
          session_token_encrypted: string | null
          user_agent: string | null
          user_agent_encrypted: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          encryption_key_id?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          ip_address_encrypted?: string | null
          is_active?: boolean
          last_activity?: string
          session_token: string
          session_token_encrypted?: string | null
          user_agent?: string | null
          user_agent_encrypted?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          encryption_key_id?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          ip_address_encrypted?: string | null
          is_active?: boolean
          last_activity?: string
          session_token?: string
          session_token_encrypted?: string | null
          user_agent?: string | null
          user_agent_encrypted?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_travel_preferences: {
        Row: {
          budget_tier: string | null
          home_city_id: string | null
          home_country_id: string | null
          preferred_transport: string[]
          travel_style: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_tier?: string | null
          home_city_id?: string | null
          home_country_id?: string | null
          preferred_transport?: string[]
          travel_style?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_tier?: string | null
          home_city_id?: string | null
          home_country_id?: string | null
          preferred_transport?: string[]
          travel_style?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_travel_preferences_home_city_id_fkey"
            columns: ["home_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_travel_preferences_home_city_id_fkey"
            columns: ["home_city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_travel_preferences_home_country_id_fkey"
            columns: ["home_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
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
          anonymized_at: string | null
          approximate_only: boolean | null
          auto_anonymize_after: string | null
          checked_in_at: string
          created_at: string
          distance_meters: number | null
          id: string
          is_anonymized: boolean | null
          is_public: boolean | null
          latitude: number
          location_precision: string | null
          location_shared_with: Json | null
          location_visibility: string | null
          longitude: number
          user_id: string
          venue_id: string
        }
        Insert: {
          anonymized_at?: string | null
          approximate_only?: boolean | null
          auto_anonymize_after?: string | null
          checked_in_at?: string
          created_at?: string
          distance_meters?: number | null
          id?: string
          is_anonymized?: boolean | null
          is_public?: boolean | null
          latitude: number
          location_precision?: string | null
          location_shared_with?: Json | null
          location_visibility?: string | null
          longitude: number
          user_id: string
          venue_id: string
        }
        Update: {
          anonymized_at?: string | null
          approximate_only?: boolean | null
          auto_anonymize_after?: string | null
          checked_in_at?: string
          created_at?: string
          distance_meters?: number | null
          id?: string
          is_anonymized?: boolean | null
          is_public?: boolean | null
          latitude?: number
          location_precision?: string | null
          location_shared_with?: Json | null
          location_visibility?: string | null
          longitude?: number
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_checkins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "venue_checkins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_closed_audit: {
        Row: {
          closed_at: string
          created_at: string
          detail: Json | null
          id: number
          reason: string
          reverted_at: string | null
          reverted_by: string | null
          venue_id: string
        }
        Insert: {
          closed_at: string
          created_at?: string
          detail?: Json | null
          id?: number
          reason: string
          reverted_at?: string | null
          reverted_by?: string | null
          venue_id: string
        }
        Update: {
          closed_at?: string
          created_at?: string
          detail?: Json | null
          id?: number
          reason?: string
          reverted_at?: string | null
          reverted_by?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_closed_audit_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "venue_closed_audit_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_event_staging: {
        Row: {
          address: string | null
          city: string
          city_id: string | null
          country: string
          country_id: string | null
          created_at: string
          data_source: string | null
          description: string | null
          external_id: string | null
          id: string
          images: string[] | null
          latitude: number | null
          longitude: number | null
          migrated_to_event_id: string | null
          name: string
          original_venue_id: string
          review_status: string
          state: string | null
          suggested_event_type: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city: string
          city_id?: string | null
          country: string
          country_id?: string | null
          created_at?: string
          data_source?: string | null
          description?: string | null
          external_id?: string | null
          id?: string
          images?: string[] | null
          latitude?: number | null
          longitude?: number | null
          migrated_to_event_id?: string | null
          name: string
          original_venue_id: string
          review_status?: string
          state?: string | null
          suggested_event_type?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string
          city_id?: string | null
          country?: string
          country_id?: string | null
          created_at?: string
          data_source?: string | null
          description?: string | null
          external_id?: string | null
          id?: string
          images?: string[] | null
          latitude?: number | null
          longitude?: number | null
          migrated_to_event_id?: string | null
          name?: string
          original_venue_id?: string
          review_status?: string
          state?: string | null
          suggested_event_type?: string | null
          website?: string | null
        }
        Relationships: []
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
      venue_field_conflicts: {
        Row: {
          existing_value: Json | null
          field_name: string
          id: number
          resolved_at: string
          resolved_source: string | null
          resolved_value: Json | null
          shadow_mode: boolean
          staging_id: string | null
          variants: Json
          venue_id: string | null
          would_overwrite: boolean | null
        }
        Insert: {
          existing_value?: Json | null
          field_name: string
          id?: number
          resolved_at?: string
          resolved_source?: string | null
          resolved_value?: Json | null
          shadow_mode?: boolean
          staging_id?: string | null
          variants: Json
          venue_id?: string | null
          would_overwrite?: boolean | null
        }
        Update: {
          existing_value?: Json | null
          field_name?: string
          id?: number
          resolved_at?: string
          resolved_source?: string | null
          resolved_value?: Json | null
          shadow_mode?: boolean
          staging_id?: string | null
          variants?: Json
          venue_id?: string | null
          would_overwrite?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_field_conflicts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "venue_field_conflicts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "venue_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "venue_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
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
      venue_sources: {
        Row: {
          confidence: number | null
          first_seen_at: string
          id: string
          is_primary: boolean
          last_seen_at: string
          payload: Json | null
          payload_hash: string | null
          source_entity_id: string
          source_slug: string
          source_url: string | null
          venue_id: string
        }
        Insert: {
          confidence?: number | null
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          last_seen_at?: string
          payload?: Json | null
          payload_hash?: string | null
          source_entity_id: string
          source_slug: string
          source_url?: string | null
          venue_id: string
        }
        Update: {
          confidence?: number | null
          first_seen_at?: string
          id?: string
          is_primary?: boolean
          last_seen_at?: string
          payload?: Json | null
          payload_hash?: string | null
          source_entity_id?: string
          source_slug?: string
          source_url?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_sources_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "venue_sources_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
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
          accommodation_type: string | null
          address: string
          address_normalized: string | null
          amenities: string[] | null
          amenities_verified: boolean
          booking_url: string | null
          category: string
          city: string
          city_id: string | null
          classified_at: string | null
          closed_at: string | null
          content_language: string | null
          country: string
          country_id: string | null
          created_at: string
          created_by: string | null
          data_source: string | null
          description: string | null
          duplicate_of_id: string | null
          email: string | null
          email_lower: string | null
          enrichment_status: Json | null
          external_id: string | null
          featured: boolean | null
          foursquare_data: Json | null
          foursquare_id: string | null
          foursquare_rating: number | null
          geo_linked_at: string | null
          hours: Json | null
          id: string
          images: string[] | null
          instagram: string | null
          is_organizer: boolean
          last_refreshed_at: string | null
          last_synced_at: string | null
          latitude: number | null
          lgbti_relevance_score: number | null
          logo_fetched_at: string | null
          logo_url: string | null
          longitude: number | null
          name: string
          name_normalized: string | null
          needs_attention: boolean | null
          organizer_handles: Json | null
          phone: string | null
          phone_e164: string | null
          platform_ids: Json
          postal_code: string | null
          price_range: number | null
          quality_score: number | null
          queer_village_id: string | null
          sensitivity_flags: Json | null
          services: string[] | null
          slug: string
          star_rating: number | null
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
          url_checked_at: string | null
          url_status: string | null
          venue_subtype: string | null
          verification_status: string
          verified: boolean | null
          website: string | null
          website_domain: string | null
        }
        Insert: {
          accessibility_attributes?: string[] | null
          accessibility_notes?: string | null
          accommodation_type?: string | null
          address: string
          address_normalized?: string | null
          amenities?: string[] | null
          amenities_verified?: boolean
          booking_url?: string | null
          category: string
          city: string
          city_id?: string | null
          classified_at?: string | null
          closed_at?: string | null
          content_language?: string | null
          country?: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          duplicate_of_id?: string | null
          email?: string | null
          email_lower?: string | null
          enrichment_status?: Json | null
          external_id?: string | null
          featured?: boolean | null
          foursquare_data?: Json | null
          foursquare_id?: string | null
          foursquare_rating?: number | null
          geo_linked_at?: string | null
          hours?: Json | null
          id?: string
          images?: string[] | null
          instagram?: string | null
          is_organizer?: boolean
          last_refreshed_at?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          lgbti_relevance_score?: number | null
          logo_fetched_at?: string | null
          logo_url?: string | null
          longitude?: number | null
          name: string
          name_normalized?: string | null
          needs_attention?: boolean | null
          organizer_handles?: Json | null
          phone?: string | null
          phone_e164?: string | null
          platform_ids?: Json
          postal_code?: string | null
          price_range?: number | null
          quality_score?: number | null
          queer_village_id?: string | null
          sensitivity_flags?: Json | null
          services?: string[] | null
          slug: string
          star_rating?: number | null
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
          url_checked_at?: string | null
          url_status?: string | null
          venue_subtype?: string | null
          verification_status?: string
          verified?: boolean | null
          website?: string | null
          website_domain?: string | null
        }
        Update: {
          accessibility_attributes?: string[] | null
          accessibility_notes?: string | null
          accommodation_type?: string | null
          address?: string
          address_normalized?: string | null
          amenities?: string[] | null
          amenities_verified?: boolean
          booking_url?: string | null
          category?: string
          city?: string
          city_id?: string | null
          classified_at?: string | null
          closed_at?: string | null
          content_language?: string | null
          country?: string
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          data_source?: string | null
          description?: string | null
          duplicate_of_id?: string | null
          email?: string | null
          email_lower?: string | null
          enrichment_status?: Json | null
          external_id?: string | null
          featured?: boolean | null
          foursquare_data?: Json | null
          foursquare_id?: string | null
          foursquare_rating?: number | null
          geo_linked_at?: string | null
          hours?: Json | null
          id?: string
          images?: string[] | null
          instagram?: string | null
          is_organizer?: boolean
          last_refreshed_at?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          lgbti_relevance_score?: number | null
          logo_fetched_at?: string | null
          logo_url?: string | null
          longitude?: number | null
          name?: string
          name_normalized?: string | null
          needs_attention?: boolean | null
          organizer_handles?: Json | null
          phone?: string | null
          phone_e164?: string | null
          platform_ids?: Json
          postal_code?: string | null
          price_range?: number | null
          quality_score?: number | null
          queer_village_id?: string | null
          sensitivity_flags?: Json | null
          services?: string[] | null
          slug?: string
          star_rating?: number | null
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
          url_checked_at?: string | null
          url_status?: string | null
          venue_subtype?: string | null
          verification_status?: string
          verified?: boolean | null
          website?: string | null
          website_domain?: string | null
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
            foreignKeyName: "venues_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities_admin"
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
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "venues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "venues_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "venues_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venues_queer_village_id_fkey"
            columns: ["queer_village_id"]
            isOneToOne: false
            referencedRelation: "queer_villages"
            referencedColumns: ["id"]
          },
        ]
      }
      video_processing_jobs: {
        Row: {
          completed_at: string | null
          completed_renditions: number | null
          created_at: string
          current_stage: string | null
          error_message: string | null
          failed_renditions: number | null
          id: string
          processing_config: Json | null
          progress_percent: number | null
          results: Json | null
          started_at: string | null
          status: string
          total_renditions: number | null
          updated_at: string
          video_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_renditions?: number | null
          created_at?: string
          current_stage?: string | null
          error_message?: string | null
          failed_renditions?: number | null
          id?: string
          processing_config?: Json | null
          progress_percent?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string
          total_renditions?: number | null
          updated_at?: string
          video_id: string
        }
        Update: {
          completed_at?: string | null
          completed_renditions?: number | null
          created_at?: string
          current_stage?: string | null
          error_message?: string | null
          failed_renditions?: number | null
          id?: string
          processing_config?: Json | null
          progress_percent?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string
          total_renditions?: number | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_processing_jobs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_renditions: {
        Row: {
          bitrate_kbps: number | null
          codec: string
          container: string
          created_at: string
          file_path: string
          file_size: number | null
          format: string
          height: number | null
          id: string
          resolution: string
          segment_count: number | null
          video_id: string
          width: number | null
        }
        Insert: {
          bitrate_kbps?: number | null
          codec: string
          container: string
          created_at?: string
          file_path: string
          file_size?: number | null
          format: string
          height?: number | null
          id?: string
          resolution: string
          segment_count?: number | null
          video_id: string
          width?: number | null
        }
        Update: {
          bitrate_kbps?: number | null
          codec?: string
          container?: string
          created_at?: string
          file_path?: string
          file_size?: number | null
          format?: string
          height?: number | null
          id?: string
          resolution?: string
          segment_count?: number | null
          video_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_renditions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          captions_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          metadata: Json | null
          original_filename: string
          original_height: number | null
          original_size: number | null
          original_width: number | null
          poster_image_path: string | null
          processing_job_id: string | null
          status: string
          storage_path: string
          title: string | null
          updated_at: string
        }
        Insert: {
          captions_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          original_filename: string
          original_height?: number | null
          original_size?: number | null
          original_width?: number | null
          poster_image_path?: string | null
          processing_job_id?: string | null
          status?: string
          storage_path: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          captions_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          metadata?: Json | null
          original_filename?: string
          original_height?: number | null
          original_size?: number | null
          original_width?: number | null
          poster_image_path?: string | null
          processing_job_id?: string | null
          status?: string
          storage_path?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      watched_urls: {
        Row: {
          created_at: string
          frequency_minutes: number
          id: string
          is_active: boolean
          last_checked_at: string | null
          last_fingerprint: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency_minutes?: number
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_fingerprint?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency_minutes?: number
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_fingerprint?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          delivery_id: string
          payload_digest: string | null
          received_at: string
          source: string
        }
        Insert: {
          delivery_id: string
          payload_digest?: string | null
          received_at?: string
          source: string
        }
        Update: {
          delivery_id?: string
          payload_digest?: string | null
          received_at?: string
          source?: string
        }
        Relationships: []
      }
      workflow_definitions: {
        Row: {
          created_at: string | null
          default_payload: Json | null
          description: string | null
          display_name: string | null
          edge_function: string
          id: string
          is_enabled: boolean | null
          max_concurrency: number | null
          max_retries: number | null
          name: string
          priority: number | null
          queue_name: string
          retry_backoff_base: number | null
          schedule: string | null
          tags: string[] | null
          timeout_seconds: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_payload?: Json | null
          description?: string | null
          display_name?: string | null
          edge_function: string
          id?: string
          is_enabled?: boolean | null
          max_concurrency?: number | null
          max_retries?: number | null
          name: string
          priority?: number | null
          queue_name: string
          retry_backoff_base?: number | null
          schedule?: string | null
          tags?: string[] | null
          timeout_seconds?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_payload?: Json | null
          description?: string | null
          display_name?: string | null
          edge_function?: string
          id?: string
          is_enabled?: boolean | null
          max_concurrency?: number | null
          max_retries?: number | null
          name?: string
          priority?: number | null
          queue_name?: string
          retry_backoff_base?: number | null
          schedule?: string | null
          tags?: string[] | null
          timeout_seconds?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          attempt: number | null
          completed_at: string | null
          created_at: string | null
          definition_id: string | null
          duration_ms: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          input_payload: Json | null
          items_failed: number | null
          items_processed: number | null
          items_succeeded: number | null
          items_total: number | null
          max_attempts: number | null
          next_retry_at: string | null
          output_result: Json | null
          pgmq_msg_id: number | null
          progress_pct: number | null
          queue_name: string
          queued_at: string | null
          started_at: string | null
          status: string
          triggered_by: string | null
          updated_at: string | null
          workflow_name: string
        }
        Insert: {
          attempt?: number | null
          completed_at?: string | null
          created_at?: string | null
          definition_id?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          input_payload?: Json | null
          items_failed?: number | null
          items_processed?: number | null
          items_succeeded?: number | null
          items_total?: number | null
          max_attempts?: number | null
          next_retry_at?: string | null
          output_result?: Json | null
          pgmq_msg_id?: number | null
          progress_pct?: number | null
          queue_name: string
          queued_at?: string | null
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string | null
          workflow_name: string
        }
        Update: {
          attempt?: number | null
          completed_at?: string | null
          created_at?: string | null
          definition_id?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          input_payload?: Json | null
          items_failed?: number | null
          items_processed?: number | null
          items_succeeded?: number | null
          items_total?: number | null
          max_attempts?: number | null
          next_retry_at?: string | null
          output_result?: Json | null
          pgmq_msg_id?: number | null
          progress_pct?: number | null
          queue_name?: string
          queued_at?: string | null
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string | null
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      cities_admin: {
        Row: {
          continent_id: string | null
          country_id: string | null
          country_name: string | null
          created_at: string | null
          equality_score: number | null
          event_count: number | null
          id: string | null
          is_capital: boolean | null
          is_major_city: boolean | null
          latitude: number | null
          lgbt_legal_status: string | null
          lgbt_rights_status: string | null
          longitude: number | null
          major_airport_code: string | null
          name: string | null
          population: number | null
          region_name: string | null
          timezone: string | null
          updated_at: string | null
          venue_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "countries_continent_id_fkey"
            columns: ["continent_id"]
            isOneToOne: false
            referencedRelation: "continents"
            referencedColumns: ["id"]
          },
        ]
      }
      city_ingest_stats: {
        Row: {
          committed: number | null
          day: string | null
          duplicates: number | null
          merge_candidates: number | null
          pending_review: number | null
          rejected: number | null
          source: string | null
          staged: number | null
          unique_items: number | null
          validated: number | null
        }
        Relationships: []
      }
      country_ingest_stats: {
        Row: {
          committed: number | null
          day: string | null
          duplicates: number | null
          merge_candidates: number | null
          pending_review: number | null
          rejected: number | null
          source: string | null
          staged: number | null
          unique_items: number | null
          validated: number | null
        }
        Relationships: []
      }
      coverage_gaps: {
        Row: {
          accommodation_type: string | null
          actual_count: number | null
          city: string | null
          expected_count: number | null
          gap_kind: string | null
          last_run_at: string | null
          source_slug: string | null
          success_ratio: number | null
        }
        Relationships: []
      }
      dedup_precision: {
        Row: {
          avg_rpc_score: number | null
          avg_score_when_wrong: number | null
          confirmed: number | null
          decisions: number | null
          last_decision: string | null
          merged: number | null
          precision: number | null
          rejected: number | null
          rpc_match_type: string | null
        }
        Relationships: []
      }
      dlq_summary: {
        Row: {
          items: number | null
          last_attempt: string | null
          next_retry: string | null
          source_slug: string | null
          stage: string | null
          status: string | null
        }
        Relationships: []
      }
      event_ingest_stats: {
        Row: {
          day: string | null
          duplicates: number | null
          inserted: number | null
          merge_candidates: number | null
          pending_review: number | null
          rejected: number | null
          source: string | null
          staged: number | null
          unique_items: number | null
          updated: number | null
          validated: number | null
        }
        Relationships: []
      }
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
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
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
      geo_merge_candidates: {
        Row: {
          created_at: string | null
          dedup_details: Json | null
          entity_type: string | null
          match_country_code: string | null
          match_country_name: string | null
          match_id: string | null
          match_lat: number | null
          match_lng: number | null
          match_name: string | null
          match_score: number | null
          proposed_code: string | null
          proposed_country_code: string | null
          proposed_country_name: string | null
          proposed_lat: number | null
          proposed_lng: number | null
          proposed_name: string | null
          source: string | null
          source_entity_id: string | null
          staging_id: string | null
          target_table: string | null
        }
        Relationships: []
      }
      hotel_ingest_stats: {
        Row: {
          accommodation_type: string | null
          committed: number | null
          day: string | null
          duplicates: number | null
          pending_review: number | null
          rejected: number | null
          source: string | null
          staged: number | null
          unique_items: number | null
          validated: number | null
        }
        Relationships: []
      }
      inbox_orphan_count_v: {
        Row: {
          orphan_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      news_image_duplicates: {
        Row: {
          article_ids: string[] | null
          image_hash: string | null
          n: number | null
          published_dates: string[] | null
          source_ids: string[] | null
          titles: string[] | null
        }
        Relationships: []
      }
      news_quality_health: {
        Row: {
          avg_quality_after: number | null
          avg_quality_delta: number | null
          avg_relevance: number | null
          last_run_at: string | null
          legacy_unprocessed: number | null
          passed: number | null
          pending: number | null
          rejected: number | null
          review: number | null
          total: number | null
        }
        Relationships: []
      }
      news_quality_source_health: {
        Row: {
          avg_quality: number | null
          avg_relevance: number | null
          last_run_at: string | null
          legacy: number | null
          passed: number | null
          reject_rate: number | null
          rejected: number | null
          review: number | null
          source_id: string | null
          source_name: string | null
          total: number | null
        }
        Relationships: []
      }
      personality_data_health: {
        Row: {
          avg_quality: number | null
          draft_rows: number | null
          known_duplicates: number | null
          missing_description: number | null
          missing_image: number | null
          missing_lgbti: number | null
          missing_qid: number | null
          needs_attention: number | null
          open_reviews: number | null
          pending_verification: number | null
          public_rows: number | null
          total: number | null
          verified: number | null
        }
        Relationships: []
      }
      pipeline_error_summary: {
        Row: {
          function_name: string | null
          last_1h: number | null
          last_24h: number | null
          last_7d: number | null
          last_seen_at: string | null
          severity: string | null
        }
        Relationships: []
      }
      pipeline_quality_daily: {
        Row: {
          day: string | null
          entity_type: string | null
          n: number | null
          score_avg: number | null
          score_p50: number | null
          source_name: string | null
        }
        Relationships: []
      }
      pipeline_quality_distribution: {
        Row: {
          entity_type: string | null
          n: number | null
          score_avg: number | null
          score_max: number | null
          score_min: number | null
          score_p25: number | null
          score_p50: number | null
          score_p75: number | null
          source_name: string | null
        }
        Relationships: []
      }
      pipeline_stuck_items: {
        Row: {
          ai_validation_status: string | null
          created_at: string | null
          dedup_status: string | null
          disposition: string | null
          error_message: string | null
          id: string | null
          review_status: string | null
          source_name: string | null
          source_type: string | null
          stale_seconds: number | null
          stuck_reason: string | null
          target_table: string | null
          updated_at: string | null
        }
        Insert: {
          ai_validation_status?: string | null
          created_at?: string | null
          dedup_status?: string | null
          disposition?: string | null
          error_message?: string | null
          id?: string | null
          review_status?: string | null
          source_name?: string | null
          source_type?: string | null
          stale_seconds?: never
          stuck_reason?: never
          target_table?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_validation_status?: string | null
          created_at?: string | null
          dedup_status?: string | null
          disposition?: string | null
          error_message?: string | null
          id?: string | null
          review_status?: string | null
          source_name?: string | null
          source_type?: string | null
          stale_seconds?: never
          stuck_reason?: never
          target_table?: string | null
          updated_at?: string | null
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
      safe_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      scraper_ingest_coverage: {
        Row: {
          entities_parsed: number | null
          entity_type: string | null
          pct_address: number | null
          pct_description: number | null
          pct_geo: number | null
          pct_images: number | null
          pct_phone: number | null
          pct_tags: number | null
          pct_website: number | null
          source_name: string | null
          started_at: string | null
        }
        Insert: {
          entities_parsed?: number | null
          entity_type?: string | null
          pct_address?: never
          pct_description?: never
          pct_geo?: never
          pct_images?: never
          pct_phone?: never
          pct_tags?: never
          pct_website?: never
          source_name?: string | null
          started_at?: string | null
        }
        Update: {
          entities_parsed?: number | null
          entity_type?: string | null
          pct_address?: never
          pct_description?: never
          pct_geo?: never
          pct_images?: never
          pct_phone?: never
          pct_tags?: never
          pct_website?: never
          source_name?: string | null
          started_at?: string | null
        }
        Relationships: []
      }
      scraper_snapshots_archive_candidates: {
        Row: {
          content_hash: string | null
          content_type: string | null
          fetched_at: string | null
          gz_bytes: number | null
          id: string | null
          source_name: string | null
          url: string | null
        }
        Relationships: []
      }
      source_reliability_current: {
        Row: {
          block_rate: number | null
          computed_at: string | null
          coverage_ratio: number | null
          entity_type: string | null
          quality_p50: number | null
          rejection_rate: number | null
          sample_size: number | null
          source_slug: string | null
          tier: string | null
          weight: number | null
        }
        Insert: {
          block_rate?: number | null
          computed_at?: string | null
          coverage_ratio?: number | null
          entity_type?: string | null
          quality_p50?: number | null
          rejection_rate?: number | null
          sample_size?: number | null
          source_slug?: string | null
          tier?: never
          weight?: number | null
        }
        Update: {
          block_rate?: number | null
          computed_at?: string | null
          coverage_ratio?: number | null
          entity_type?: string | null
          quality_p50?: number | null
          rejection_rate?: number | null
          sample_size?: number | null
          source_slug?: string | null
          tier?: never
          weight?: number | null
        }
        Relationships: []
      }
      tag_usage_summary: {
        Row: {
          category: string | null
          content_count: number | null
          event_count: number | null
          group_count: number | null
          id: string | null
          marketplace_count: number | null
          name: string | null
          news_count: number | null
          post_count: number | null
          slug: string | null
          usage_count: number | null
          venue_count: number | null
        }
        Relationships: []
      }
      tags_with_categories: {
        Row: {
          categories: Json | null
          category: string | null
          category_id: string | null
          created_at: string | null
          deprecated_at: string | null
          deprecation_reason: string | null
          description: string | null
          id: string | null
          image_url: string | null
          merged_into_id: string | null
          name: string | null
          slug: string | null
          status: string | null
          updated_at: string | null
          usage_count: number | null
          wikipedia_url: string | null
        }
        Insert: {
          categories?: never
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          deprecated_at?: string | null
          deprecation_reason?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          merged_into_id?: string | null
          name?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string | null
          usage_count?: number | null
          wikipedia_url?: string | null
        }
        Update: {
          categories?: never
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          deprecated_at?: string | null
          deprecation_reason?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          merged_into_id?: string | null
          name?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string | null
          usage_count?: number | null
          wikipedia_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      user_submission_reputation: {
        Row: {
          approved: number | null
          last_review_at: string | null
          rejected: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_active_tags: {
        Row: {
          category: string | null
          category_id: string | null
          created_at: string | null
          deprecated_at: string | null
          deprecation_reason: string | null
          description: string | null
          id: string | null
          image_url: string | null
          merged_into_id: string | null
          name: string | null
          scientific_data: Json | null
          slug: string | null
          status: string | null
          updated_at: string | null
          usage_count: number | null
          wikipedia_url: string | null
          wolfram_enriched_at: string | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          deprecated_at?: string | null
          deprecation_reason?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          merged_into_id?: string | null
          name?: string | null
          scientific_data?: Json | null
          slug?: string | null
          status?: string | null
          updated_at?: string | null
          usage_count?: number | null
          wikipedia_url?: string | null
          wolfram_enriched_at?: string | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          deprecated_at?: string | null
          deprecation_reason?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          merged_into_id?: string | null
          name?: string | null
          scientific_data?: Json | null
          slug?: string | null
          status?: string | null
          updated_at?: string | null
          usage_count?: number | null
          wikipedia_url?: string | null
          wolfram_enriched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "tag_usage_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "tags_with_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "unified_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unified_tags_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_active_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      v_api_error_daily: {
        Row: {
          day: string | null
          fingerprint: string | null
          n: number | null
          submission_id: string | null
        }
        Relationships: []
      }
      v_feedback_analytics_daily: {
        Row: {
          category: string | null
          content_type: string | null
          day: string | null
          feedback_status: string | null
          n: number | null
          priority: number | null
        }
        Relationships: []
      }
      v_popular_entities: {
        Row: {
          content_id: string | null
          content_type: string | null
          score: number | null
        }
        Relationships: []
      }
      v_top_queries: {
        Row: {
          avg_ms: number | null
          avg_results: number | null
          last_seen: string | null
          n: number | null
          query_normalized: string | null
        }
        Relationships: []
      }
      v_zero_hit_queries: {
        Row: {
          last_seen: string | null
          n: number | null
          query_normalized: string | null
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
            referencedRelation: "news_quality_source_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "venue_checkins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_ingest_stats: {
        Row: {
          day: string | null
          duplicates: number | null
          inserted: number | null
          pending_review: number | null
          rejected: number | null
          source: string | null
          staged: number | null
          unique_items: number | null
          updated: number | null
          validated: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _fb_log_event: {
        Args: {
          p_actor_kind?: string
          p_kind: string
          p_payload?: Json
          p_retest_run_id?: string
          p_routine_run_id?: string
          p_story_id: string
        }
        Returns: number
      }
      accept_story_suggestion: {
        Args: { p_override_title?: string; p_suggestion_id: string }
        Returns: string
      }
      add_story_members: {
        Args: { p_story_id: string; p_submission_ids: string[] }
        Returns: number
      }
      add_tag_to_category: {
        Args: {
          p_category_id: string
          p_is_primary?: boolean
          p_tag_id: string
        }
        Returns: undefined
      }
      admin_bulk_review_action: {
        Args: { p_action: string; p_user_id: string }
        Returns: Json
      }
      anonymize_location_data: {
        Args: { p_days_old?: number }
        Returns: number
      }
      apply_content_change: { Args: { p_change_id: string }; Returns: boolean }
      apply_enrichment: {
        Args: {
          p_actor?: string
          p_duration_ms?: number
          p_error_message?: string
          p_new_enriched: Json
          p_pipeline_run_id: string
          p_stage: string
          p_staging_id: string
          p_status?: string
        }
        Returns: string
      }
      approve_group_join_request: {
        Args: { request_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          message: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "group_join_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_story_for_claude: {
        Args: { p_note?: string; p_story_id: string }
        Returns: string
      }
      approve_tag_suggestions: {
        Args: { p_reviewer_id?: string; p_suggestion_ids: string[] }
        Returns: number
      }
      archive_story: {
        Args: { p_reason?: string; p_story_id: string }
        Returns: {
          approved_by: string | null
          approved_for_claude_at: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assignee_id: string | null
          brief_title: string | null
          created_at: string
          created_by: string | null
          handoffs: Json
          id: string
          labels: string[]
          narrative: string | null
          narrative_edited: boolean
          needs_followup_reason: string | null
          origin: string
          priority: number
          resolved_at: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_stories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_user_role: {
        Args: { role_name: string; user_id: string }
        Returns: boolean
      }
      audit_admin_data_access: {
        Args: {
          p_admin_id: string
          p_data_type: string
          p_justification: string
          p_target_user_id: string
        }
        Returns: boolean
      }
      audit_admin_sensitive_access: {
        Args: {
          p_admin_id: string
          p_data_type: string
          p_justification: string
          p_target_user_id: string
        }
        Returns: boolean
      }
      auto_clean_all_duplicates:
        | {
            Args: {
              p_auto_merge_threshold?: number
              p_dry_run?: boolean
              p_entity_types?: string[]
              p_limit?: number
              p_review_threshold?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_auto_merge_threshold?: number
              p_dry_run?: boolean
              p_entity_types?: string[]
              p_limit?: number
              p_offset?: number
              p_review_threshold?: number
              p_scan_only?: boolean
            }
            Returns: Json
          }
      auto_clean_merge_duplicates: {
        Args: { dry_run?: boolean; near_dupe_threshold?: number }
        Returns: Json
      }
      auto_escalate_stale_feedback: { Args: never; Returns: number }
      auto_remove_broken_link: { Args: { link_id: string }; Returns: undefined }
      auto_story_for_submission: {
        Args: { p_submission_id: string }
        Returns: string
      }
      basic_rate_limit: {
        Args: { identifier: string; max_attempts?: number }
        Returns: boolean
      }
      batch_find_duplicates: {
        Args: { p_batch_limit?: number; p_target_table?: string }
        Returns: Json
      }
      batch_match_tag_embeddings: {
        Args: {
          p_content_ids: string[]
          p_content_type: string
          p_match_count?: number
          p_match_threshold?: number
        }
        Returns: {
          content_id: string
          similarity: number
          tag_id: string
          tag_name: string
        }[]
      }
      bulk_apply_batch_changes:
        | {
            Args: { p_batch_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.bulk_apply_batch_changes(p_batch_id => text), public.bulk_apply_batch_changes(p_batch_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_batch_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.bulk_apply_batch_changes(p_batch_id => text), public.bulk_apply_batch_changes(p_batch_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      bulk_apply_content_changes: {
        Args: { p_change_ids: string[] }
        Returns: number
      }
      calculate_secure_venue_distance: {
        Args: { user_lat: number; user_lng: number; venue_id: string }
        Returns: number
      }
      can_edit_trip: {
        Args: { p_trip_id: string; p_user_id: string }
        Returns: boolean
      }
      can_view_sensitive_profile_data: {
        Args: {
          privacy_field?: string
          profile_user_id: string
          requesting_user_id: string
        }
        Returns: boolean
      }
      cancel_routine_run: {
        Args: { p_reason?: string; p_run_id: string }
        Returns: {
          commit_sha: string | null
          confidence: string | null
          created_at: string
          created_by: string | null
          error: string | null
          external_ref: string | null
          files_changed: string[] | null
          finished_at: string | null
          fix_summary: string | null
          id: string
          pr_url: string | null
          prompt: string
          prompt_hash: string
          risks: string | null
          runner: string
          status: string
          story_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_routine_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      canonical_profession: { Args: { p: string }; Returns: string }
      cascade_story_to_members: {
        Args: {
          p_assignee_id?: string
          p_priority?: number
          p_resolution?: string
          p_status?: string
          p_story_id: string
        }
        Returns: number
      }
      check_financial_data_access: {
        Args: {
          p_admin_user_id: string
          p_justification: string
          p_user_id: string
        }
        Returns: boolean
      }
      check_mailbox_availability: { Args: { p_address: string }; Returns: Json }
      check_pipeline_health: {
        Args: never
        Returns: {
          opened: number
          resolved: number
        }[]
      }
      check_rate_limit_enhanced: {
        Args: {
          action_type?: string
          identifier: string
          max_attempts?: number
          time_window_minutes?: number
        }
        Returns: boolean
      }
      circuit_breaker_check: { Args: { p_api_name: string }; Returns: boolean }
      circuit_breaker_record_failure: {
        Args: { p_api_name: string; p_error_msg?: string }
        Returns: Json
      }
      circuit_breaker_record_success: {
        Args: { p_api_name: string }
        Returns: undefined
      }
      city_canonical_key: { Args: { p_name: string }; Returns: string }
      clean_old_rate_limits: { Args: never; Returns: undefined }
      clean_staging_duplicates: {
        Args: { p_dry_run?: boolean; p_skip_threshold?: number }
        Returns: Json
      }
      cms_can_edit: {
        Args: {
          p_content_id: string
          p_content_type: string
          p_user_id?: string
        }
        Returns: boolean
      }
      cms_run_scheduled_publish: { Args: never; Returns: undefined }
      commit_city_staging_batch: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          city_id: string
          staging_id: string
        }[]
      }
      commit_city_staging_item: {
        Args: { p_actor?: string; p_staging_id: string }
        Returns: {
          action: string
          out_city_id: string
        }[]
      }
      commit_country_staging_batch: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          country_id: string
          staging_id: string
        }[]
      }
      commit_country_staging_item: {
        Args: { p_actor?: string; p_staging_id: string }
        Returns: {
          action: string
          out_country_id: string
        }[]
      }
      commit_event_staging_batch: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          event_id: string
          staging_id: string
        }[]
      }
      commit_event_staging_item: {
        Args: { p_actor?: string; p_staging_id: string }
        Returns: {
          action: string
          event_id: string
        }[]
      }
      commit_marketplace_staging_batch: {
        Args: { p_limit?: number; p_pipeline_run_id?: string }
        Returns: {
          action: string
          listing_id: string
          staging_id: string
        }[]
      }
      commit_personality_staging_batch: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          personality_id: string
          staging_id: string
        }[]
      }
      commit_personality_staging_item: {
        Args: { p_actor?: string; p_staging_id: string }
        Returns: {
          action: string
          personality_id: string
        }[]
      }
      commit_venue_staging_batch: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          staging_id: string
          venue_id: string
        }[]
      }
      commit_venue_staging_item: {
        Args: { p_actor?: string; p_staging_id: string }
        Returns: {
          action: string
          venue_id: string
        }[]
      }
      commit_village_staging_batch: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          staging_id: string
          village_id: string
        }[]
      }
      compute_quality_score: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: number
      }
      compute_staging_idempotency_key: {
        Args: {
          p_fallback: string
          p_payload_hash: string
          p_source_entity_id: string
          p_source_name: string
        }
        Returns: string
      }
      compute_tag_similarities: { Args: never; Returns: Json }
      create_notification: {
        Args: { data?: Json; message: string; type: string; user_id: string }
        Returns: string
      }
      create_story: {
        Args: {
          p_origin?: string
          p_submission_ids: string[]
          p_summary?: string
          p_title: string
        }
        Returns: string
      }
      create_tag_relationships_table_if_not_exists: {
        Args: never
        Returns: undefined
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      decrement_comment_likes: {
        Args: { comment_id: string }
        Returns: undefined
      }
      decrement_post_likes: { Args: { post_id: string }; Returns: undefined }
      detect_feedback_clusters: {
        Args: {
          p_days_window?: number
          p_embedding_threshold?: number
          p_min_cluster_size?: number
          p_trigram_threshold?: number
        }
        Returns: number
      }
      detect_feedback_duplicates: {
        Args: { p_days_window?: number; p_threshold?: number }
        Returns: number
      }
      detect_near_duplicate_tags: {
        Args: { min_sim?: number }
        Returns: {
          sim: number
          tag_a_category: string
          tag_a_name: string
          tag_b_category: string
          tag_b_name: string
        }[]
      }
      detect_stale_venues: {
        Args: { p_dry_run?: boolean; p_stale_after_days?: number }
        Returns: {
          last_seen_at: string
          venue_id: string
        }[]
      }
      dispatch_claude_routine: {
        Args: {
          p_prompt: string
          p_prompt_hash: string
          p_runner: string
          p_story_id: string
        }
        Returns: {
          commit_sha: string | null
          confidence: string | null
          created_at: string
          created_by: string | null
          error: string | null
          external_ref: string | null
          files_changed: string[] | null
          finished_at: string | null
          fix_summary: string | null
          id: string
          pr_url: string | null
          prompt: string
          prompt_hash: string
          risks: string | null
          runner: string
          status: string
          story_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_routine_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dlq_claim_batch: {
        Args: { p_limit?: number; p_worker?: string }
        Returns: {
          attempts: number
          created_at: string
          error_code: string | null
          error_message: string | null
          id: number
          last_attempt_at: string | null
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          next_retry_at: string
          payload: Json | null
          pipeline_run_id: string | null
          resolved_at: string | null
          source_slug: string | null
          stage: string
          staging_id: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ingestion_dlq"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dlq_enqueue: {
        Args: {
          p_error: string
          p_error_code: string
          p_payload?: Json
          p_source?: string
          p_stage: string
          p_staging_id: string
        }
        Returns: number
      }
      dlq_fail: { Args: { p_err: string; p_id: number }; Returns: undefined }
      dlq_resolve: { Args: { p_id: number }; Returns: undefined }
      enqueue_workflow: {
        Args: {
          p_payload?: Json
          p_triggered_by?: string
          p_workflow_name: string
        }
        Returns: number
      }
      ensure_content_links: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: number
      }
      escalate_pipeline_alerts_to_feedback: {
        Args: never
        Returns: {
          escalated: number
        }[]
      }
      extract_city_from_text: {
        Args: { input_text: string }
        Returns: {
          country_id: string
          id: string
          name: string
        }[]
      }
      extract_website_domain: { Args: { url: string }; Returns: string }
      feedback_sla_stats: {
        Args: { p_days_window?: number }
        Returns: {
          category: string
          median_seconds: number
          p95_seconds: number
          priority: number
          resolved_n: number
        }[]
      }
      find_city_duplicate_candidates: {
        Args: {
          p_country_id?: string
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_name: string
        }
        Returns: {
          city_id: string
          distance_m: number
          match_type: string
          score: number
        }[]
      }
      find_city_duplicates: {
        Args: {
          p_country_id?: string
          p_latitude?: number
          p_longitude?: number
          p_name: string
          p_threshold?: number
        }
        Returns: {
          city_id: string
          city_name: string
          combined_score: number
          geo_distance_km: number
          name_similarity: number
          same_country: boolean
        }[]
      }
      find_country_duplicate_candidates: {
        Args: { p_code?: string; p_limit?: number; p_name: string }
        Returns: {
          country_id: string
          match_type: string
          score: number
        }[]
      }
      find_duplicate_candidates: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_threshold?: number
        }
        Returns: {
          candidate_id: string
          candidate_name: string
          same_city: boolean
          similarity_score: number
        }[]
      }
      find_event_duplicate_candidates: {
        Args: {
          p_city?: string
          p_edition?: string
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_start_date: string
          p_title: string
          p_venue_id?: string
        }
        Returns: {
          distance_m: number
          event_id: string
          match_type: string
          score: number
          time_diff_hours: number
        }[]
      }
      find_event_duplicates: {
        Args: { p_city?: string; p_start_date: string; p_title: string }
        Returns: {
          city_match: boolean
          combined_score: number
          date_diff_hours: number
          event_id: string
          event_title: string
          title_similarity: number
        }[]
      }
      find_existing_by_url: {
        Args: { p_url: string }
        Returns: {
          id: string
          slug: string
          source: string
          title: string
        }[]
      }
      find_hotel_duplicate_candidates: {
        Args: {
          p_address?: string
          p_booking_url?: string
          p_city_id?: string
          p_email?: string
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_name: string
          p_phone_e164?: string
          p_platform_ids?: Json
          p_website_domain?: string
        }
        Returns: {
          distance_m: number
          match_type: string
          score: number
          venue_id: string
        }[]
      }
      find_marketplace_duplicate_candidates: {
        Args: {
          p_brand?: string
          p_external_url?: string
          p_limit?: number
          p_merchant_domain?: string
          p_source_entity_id?: string
          p_source_slug?: string
          p_title: string
        }
        Returns: {
          distance_m: number
          listing_id: string
          match_type: string
          matched_title: string
          score: number
          time_diff_hours: number
        }[]
      }
      find_nearest_airport: {
        Args: { visitor_lat: number; visitor_lng: number }
        Returns: {
          city_name: string
          country_code: string
          distance_km: number
          iata_code: string
        }[]
      }
      find_news_duplicates: {
        Args: {
          p_published_at?: string
          p_source_id?: string
          p_threshold?: number
          p_title: string
        }
        Returns: {
          article_id: string
          article_title: string
          combined_score: number
          date_diff_hours: number
          same_source: boolean
          title_similarity: number
        }[]
      }
      find_personality_duplicate_candidates: {
        Args: {
          p_birth_date?: string
          p_external_ids?: Json
          p_limit?: number
          p_name: string
          p_nationality?: string
          p_profession?: string
          p_wikidata_qid?: string
        }
        Returns: {
          distance_m: number
          match_type: string
          matched_name: string
          personality_id: string
          score: number
          time_diff_hours: number
        }[]
      }
      find_personality_duplicates: {
        Args: { p_name: string; p_threshold?: number }
        Returns: {
          name_similarity: number
          personality_id: string
          personality_name: string
        }[]
      }
      find_queer_village: {
        Args: { p_city_id?: string; p_lat: number; p_lng: number }
        Returns: {
          match_type: string
          village_id: string
          village_name: string
        }[]
      }
      find_unified_tag_duplicates: {
        Args: { p_limit?: number; p_threshold?: number }
        Returns: {
          similarity: number
          tag_a_id: string
          tag_a_slug: string
          tag_b_id: string
          tag_b_slug: string
        }[]
      }
      find_venue_duplicate_candidates: {
        Args: {
          p_address?: string
          p_city_id?: string
          p_email?: string
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_name: string
          p_phone_e164?: string
          p_website_domain?: string
        }
        Returns: {
          distance_m: number
          match_type: string
          score: number
          venue_id: string
        }[]
      }
      find_venue_duplicates: {
        Args: {
          p_category?: string
          p_latitude: number
          p_longitude: number
          p_name: string
          p_threshold?: number
        }
        Returns: {
          category_match: boolean
          combined_score: number
          geo_distance_m: number
          name_similarity: number
          venue_id: string
          venue_name: string
        }[]
      }
      fix_missing_junction_entries: { Args: never; Returns: number }
      fx_to_usd: {
        Args: { p_amount: number; p_currency: string }
        Returns: number
      }
      generate_data_ops_alerts: {
        Args: never
        Returns: {
          alert_kind: string
          fingerprint: string
        }[]
      }
      generate_email_token: { Args: never; Returns: string }
      generate_slug: { Args: { input_text: string }; Returns: string }
      generate_source_quality_alerts: { Args: never; Returns: number }
      generate_unique_slug: {
        Args: {
          p_base_slug: string
          p_exclude_id?: string
          p_table_name: string
        }
        Returns: string
      }
      get_admin_counts: { Args: never; Returns: Json }
      get_admin_platform_stats: { Args: never; Returns: Json }
      get_automation_stats: { Args: never; Returns: Json }
      get_bias_signal: {
        Args: { p_session_id?: string; p_user_id?: string; p_window?: number }
        Returns: {
          age_days: number
          embedding: string
          entity_id: string
          entity_type: string
          event_type: string
        }[]
      }
      get_broken_marketplace_ids: { Args: never; Returns: string[] }
      get_category_ancestors: {
        Args: { p_category_id: string }
        Returns: {
          id: string
          level: number
          name: string
          slug: string
        }[]
      }
      get_category_tree: { Args: { p_parent_id?: string }; Returns: Json }
      get_eligible_wolfram_tags: {
        Args: { p_limit?: number }
        Returns: {
          description: string
          id: string
          name: string
        }[]
      }
      get_enrichment_failures: {
        Args: { p_entity_type?: string; p_limit?: number; p_since?: string }
        Returns: {
          enrichment_status: Json
          entity_id: string
          entity_type: string
          failed_steps: string[]
          needs_attention: boolean
          quality_score: number
          updated_at: string
        }[]
      }
      get_entity_attributes: {
        Args: { entity_id_param: string; entity_type_param: string }
        Returns: {
          attribute_category: string
          attribute_description: string
          attribute_icon: string
          attribute_id: string
          attribute_name: string
        }[]
      }
      get_entity_tags: {
        Args: { entity_id_param: string; entity_type_param: string }
        Returns: {
          tag_category: string
          tag_description: string
          tag_id: string
          tag_name: string
        }[]
      }
      get_homepage_stats: { Args: never; Returns: Json }
      get_import_statistics: { Args: never; Returns: Json }
      get_inbox_counts: { Args: { p_user_id: string }; Returns: Json }
      get_link_health_stats: { Args: never; Returns: Json }
      get_links_due_for_recheck: {
        Args: { batch_limit?: number }
        Returns: {
          auto_removed_at: string | null
          check_count: number
          cleaned_url: string | null
          content_id: string
          content_type: string
          created_at: string
          field_name: string
          final_url: string | null
          http_status: number | null
          id: string
          is_scraped_source: boolean | null
          is_social: boolean | null
          last_checked_at: string | null
          original_url: string
          scan_brands: string[] | null
          scan_categories: string[] | null
          scan_id: string | null
          scan_score: number | null
          scan_screenshot_url: string | null
          scan_verdict: string | null
          scanned_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "content_links"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_news_cron_status: {
        Args: never
        Returns: {
          job_name: string
          last_run: string
          next_run: string
          status: string
        }[]
      }
      get_or_create_direct_conversation: {
        Args: { user1_id: string; user2_id: string }
        Returns: string
      }
      get_or_create_email_token: { Args: never; Returns: string }
      get_personality_profession_facets: {
        Args: { lim?: number }
        Returns: {
          cnt: number
          profession: string
        }[]
      }
      get_public_profile_safe: {
        Args: { target_user_id: string }
        Returns: Json
      }
      get_secure_profile_data: {
        Args: { target_user_id: string }
        Returns: Json
      }
      get_secure_venue_checkins: { Args: { venue_id: string }; Returns: Json }
      get_share_view_stats: {
        Args: { p_trip_id: string }
        Returns: {
          last_viewed_at: string
          share_id: string
          total_views: number
          views_7d: number
        }[]
      }
      get_shared_trip: {
        Args: { p_token: string }
        Returns: {
          currency: string
          description: string
          end_date: string
          permissions: Json
          start_date: string
          title: string
          trip_id: string
        }[]
      }
      get_similar_personalities: {
        Args: {
          min_similarity?: number
          personality_uuid: string
          result_limit?: number
        }
        Returns: {
          birth_date: string
          death_date: string
          description: string
          id: string
          image_url: string
          is_living: boolean
          name: string
          nationality: string
          profession: string
          similarity: number
        }[]
      }
      get_similar_tags: {
        Args: { p_limit?: number; p_min_score?: number; p_tag_id: string }
        Returns: {
          category_color: string
          category_name: string
          relationship_type: string
          similarity_score: number
          tag_id: string
          tag_name: string
          tag_slug: string
          usage_count: number
        }[]
      }
      get_staging_ids:
        | {
            Args: {
              p_dedup_status?: string
              p_limit?: number
              p_search?: string
              p_target_table?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_dedup_status?: string
              p_limit?: number
              p_review_status?: string
              p_search?: string
              p_target_table?: string
            }
            Returns: Json
          }
      get_staging_page: {
        Args: {
          p_dedup_status?: string
          p_page?: number
          p_per_page?: number
          p_review_status?: string
          p_search?: string
          p_sort_dir?: string
          p_sort_field?: string
          p_target_table?: string
        }
        Returns: Json
      }
      get_stale_embeddings: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          table_name: string
          updated_at: string
        }[]
      }
      get_subcategories: {
        Args: { p_parent_id: string }
        Returns: {
          color: string
          description: string
          id: string
          name: string
          slug: string
          sort_order: number
          tag_count: number
        }[]
      }
      get_table_policies:
        | {
            Args: { p_schema_name: string; p_table_name: string }
            Returns: {
              policy_cmd: string
              policy_name: string
              policy_qual: string
              policy_roles: string[]
              policy_with_check: string
            }[]
          }
        | {
            Args: { table_name_param: string }
            Returns: {
              command: string
              policy_name: string
              role_name: string
              using_expr: string
              with_check_expr: string
            }[]
          }
      get_tag_categories: {
        Args: { p_tag_id: string }
        Returns: {
          category_id: string
          category_name: string
          is_primary: boolean
        }[]
      }
      get_tag_graph_data: {
        Args: { p_category_filter?: string; p_min_score?: number }
        Returns: Json
      }
      get_tag_linked_content: {
        Args: {
          p_limit?: number
          p_tag_id: string
          p_tag_name: string
          p_tag_slug: string
        }
        Returns: Json
      }
      get_translated_content: {
        Args: {
          p_fields?: string[]
          p_id: string
          p_lang: string
          p_table: string
        }
        Returns: Json
      }
      get_translated_list: {
        Args: {
          p_fields?: string[]
          p_ids: string[]
          p_lang: string
          p_table: string
        }
        Returns: {
          record_id: string
          translations: Json
        }[]
      }
      get_trending_entities: {
        Args: { p_city?: string; p_limit?: number; p_types?: string[] }
        Returns: {
          city: string
          country: string
          entity_id: string
          entity_type: string
          image_url: string
          score: number
          slug: string
          title: string
        }[]
      }
      get_user_conversation_ids: {
        Args: { user_id_param?: string }
        Returns: {
          conversation_id: string
        }[]
      }
      get_user_signal: {
        Args: { p_session_id?: string; p_user_id?: string }
        Returns: Json
      }
      get_vault_secret: { Args: { secret_name: string }; Returns: string }
      get_venue_social_signals: {
        Args: { p_venue_ids: string[]; p_viewer_id?: string }
        Returns: {
          friends_saved: number
          trip_usage: number
          venue_id: string
        }[]
      }
      get_venues_by_tag: {
        Args: { max_results?: number; tag_values: string[] }
        Returns: {
          accessibility_attributes: string[] | null
          accessibility_notes: string | null
          accommodation_type: string | null
          address: string
          address_normalized: string | null
          amenities: string[] | null
          amenities_verified: boolean
          booking_url: string | null
          category: string
          city: string
          city_id: string | null
          classified_at: string | null
          closed_at: string | null
          content_language: string | null
          country: string
          country_id: string | null
          created_at: string
          created_by: string | null
          data_source: string | null
          description: string | null
          duplicate_of_id: string | null
          email: string | null
          email_lower: string | null
          enrichment_status: Json | null
          external_id: string | null
          featured: boolean | null
          foursquare_data: Json | null
          foursquare_id: string | null
          foursquare_rating: number | null
          geo_linked_at: string | null
          hours: Json | null
          id: string
          images: string[] | null
          instagram: string | null
          is_organizer: boolean
          last_refreshed_at: string | null
          last_synced_at: string | null
          latitude: number | null
          lgbti_relevance_score: number | null
          logo_fetched_at: string | null
          logo_url: string | null
          longitude: number | null
          name: string
          name_normalized: string | null
          needs_attention: boolean | null
          organizer_handles: Json | null
          phone: string | null
          phone_e164: string | null
          platform_ids: Json
          postal_code: string | null
          price_range: number | null
          quality_score: number | null
          queer_village_id: string | null
          sensitivity_flags: Json | null
          services: string[] | null
          slug: string
          star_rating: number | null
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
          url_checked_at: string | null
          url_status: string | null
          venue_subtype: string | null
          verification_status: string
          verified: boolean | null
          website: string | null
          website_domain: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "venues"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_any_role_jwt: {
        Args: { required_roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      has_pipeline_permission: {
        Args: { p_permission: string; p_pipeline_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_jwt: {
        Args: { required_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      increment_article_views: {
        Args: { article_id: string }
        Returns: undefined
      }
      increment_automation_counters: {
        Args: {
          p_applied?: number
          p_module_id: string
          p_proposed?: number
          p_runs?: number
        }
        Returns: undefined
      }
      increment_circuit_breaker_success: {
        Args: { p_api_name: string }
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
      increment_personality_views: {
        Args: { personality_id: string }
        Returns: undefined
      }
      increment_post_comments: { Args: { post_id: string }; Returns: undefined }
      increment_post_likes: { Args: { post_id: string }; Returns: undefined }
      increment_template_use_count: {
        Args: { p_template_id: string }
        Returns: undefined
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_feedback_spam: { Args: { p_data: Json }; Returns: boolean }
      is_group_admin: {
        Args: { group_id: string; user_id: string }
        Returns: boolean
      }
      is_trip_member: {
        Args: { p_trip_id: string; p_user_id: string }
        Returns: boolean
      }
      jwt_claim: { Args: { claim: string }; Returns: string }
      log_search: {
        Args: {
          p_filters: Json
          p_had_rewrite: boolean
          p_lang: string
          p_n_results: number
          p_query: string
          p_session_id: string
          p_took_ms: number
        }
        Returns: undefined
      }
      log_security_event: {
        Args: {
          p_event_type: string
          p_metadata?: Json
          p_severity?: string
          p_user_id?: string
        }
        Returns: string
      }
      log_sensitive_data_access: {
        Args: {
          p_access_method?: string
          p_data_type: string
          p_target_user_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      log_venue_field_conflict: {
        Args: {
          p_existing_age_days: number
          p_existing_src: string
          p_existing_val: string
          p_field_name: string
          p_incoming_src: string
          p_incoming_val: string
          p_staging_id: string
          p_venue_id: string
        }
        Returns: undefined
      }
      lookup_mailbox_user: { Args: { p_address: string }; Returns: string }
      mark_story_needs_followup: {
        Args: { p_reason: string; p_story_id: string }
        Returns: string
      }
      match_content_embeddings: {
        Args: {
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          content_id: string
          content_text: string
          content_type: string
          metadata: Json
          similarity: number
        }[]
      }
      merge_entities: {
        Args: {
          p_entity_type: string
          p_keep_id: string
          p_merged_data?: Json
          p_remove_id: string
        }
        Returns: Json
      }
      merge_pipeline_node_states: {
        Args: { p_patch: Json; p_run_id: string }
        Returns: undefined
      }
      merge_tag: {
        Args: { canonical_tag_id: string; source_tag_id: string }
        Returns: undefined
      }
      merge_unified_tag: {
        Args: {
          p_actor?: string
          p_canonical_id: string
          p_duplicate_id: string
        }
        Returns: undefined
      }
      news_commit_staging_batch: {
        Args: { p_job_id: string; p_limit?: number; p_pipeline_run_id?: string }
        Returns: {
          details: Json
          errors: number
          inserted: number
          skipped: number
          updated: number
        }[]
      }
      news_compute_fingerprint: {
        Args: {
          p_published_at: string
          p_source_id: string
          p_title: string
          p_url?: string
        }
        Returns: string
      }
      news_source_record_outcome: {
        Args: {
          p_articles_count?: number
          p_error?: string
          p_source_id: string
          p_success: boolean
        }
        Returns: undefined
      }
      news_sources_eligible: {
        Args: { p_limit?: number }
        Returns: {
          category: string
          fetch_frequency: number
          id: string
          keywords: string[]
          last_fetched_at: string
          name: string
          source_type: string
          url: string
        }[]
      }
      normalize_address: { Args: { a: string }; Returns: string }
      normalize_name: { Args: { n: string }; Returns: string }
      normalize_phone: { Args: { p: string }; Returns: string }
      normalize_tag_name: { Args: { input: string }; Returns: string }
      normalize_tag_slug: { Args: { p_input: string }; Returns: string }
      normalize_venue_category: { Args: { c: string }; Returns: string }
      optimize_auth_uid_in_policies: {
        Args: never
        Returns: {
          optimization_applied: string
          performance_impact: string
          policy_name: string
          table_name: string
        }[]
      }
      optimize_auth_uid_in_policy: {
        Args: {
          p_policy_name: string
          p_schema_name: string
          p_table_name: string
        }
        Returns: string
      }
      personalized_semantic_search: {
        Args: {
          p_bias_vec?: string
          p_bias_weight?: number
          p_content_types?: string[]
          p_limit?: number
          p_query_vec: string
        }
        Returns: {
          content_id: string
          content_type: string
          metadata: Json
          score: number
        }[]
      }
      pg_try_advisory_lock: { Args: { key: number }; Returns: boolean }
      pgmq_archive: {
        Args: { p_msg_id: number; p_queue: string }
        Returns: boolean
      }
      pgmq_delete: {
        Args: { p_msg_id: number; p_queue: string }
        Returns: boolean
      }
      pgmq_metrics: {
        Args: { p_queue: string }
        Returns: {
          newest_msg_age_sec: number
          oldest_msg_age_sec: number
          queue_length: number
          queue_name: string
          total_messages: number
        }[]
      }
      pgmq_metrics_all: {
        Args: never
        Returns: {
          newest_msg_age_sec: number
          oldest_msg_age_sec: number
          queue_length: number
          queue_name: string
          queue_visible_length: number
          scrape_time: string
          total_messages: number
        }[]
      }
      pgmq_read: {
        Args: { p_qty: number; p_queue: string; p_vt: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_send: {
        Args: { p_delay?: number; p_msg: Json; p_queue: string }
        Returns: number
      }
      pgmq_send_batch: {
        Args: { p_delay?: number; p_msgs: Json[]; p_queue: string }
        Returns: number[]
      }
      pgmq_set_vt: {
        Args: { p_msg_id: number; p_queue: string; vt_seconds: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pipeline_health_snapshot: {
        Args: never
        Returns: {
          pending: number
          rejected: number
          review_pending: number
          review_stale: number
          stuck_commit: number
          stuck_dedup: number
          stuck_normalize: number
          stuck_validate: number
          target_table: string
          total: number
        }[]
      }
      position_first_letter: { Args: { s: string }; Returns: number }
      push_doc_expiry_candidates: {
        Args: never
        Returns: {
          days_out: number
          doc_type: string
          document_id: string
          expiry_date: string
          title: string
          user_id: string
        }[]
      }
      push_next_item_candidates: {
        Args: never
        Returns: {
          reservation_id: string
          start_at: string
          title: string
          trip_id: string
          user_id: string
        }[]
      }
      reap_stuck_pipeline_runs: { Args: never; Returns: number }
      recompute_marketplace_price_usd: { Args: never; Returns: number }
      record_dedup_decision: {
        Args: {
          p_action: string
          p_confidence: number
          p_decided_by?: string
          p_decision: string
          p_entity_type: string
          p_match_id: string
          p_match_method: string
          p_pipeline_run_id: string
          p_rules: Json
          p_staging_id: string
        }
        Returns: string
      }
      record_fix_proposed: {
        Args: {
          p_actor_kind?: string
          p_commit_sha: string
          p_confidence: string
          p_files: string[]
          p_pr_url: string
          p_risks: string
          p_run_id: string
          p_summary: string
        }
        Returns: {
          commit_sha: string | null
          confidence: string | null
          created_at: string
          created_by: string | null
          error: string | null
          external_ref: string | null
          files_changed: string[] | null
          finished_at: string | null
          fix_summary: string | null
          id: string
          pr_url: string | null
          prompt: string
          prompt_hash: string
          risks: string | null
          runner: string
          status: string
          story_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_routine_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_redirect_click: {
        Args: {
          p_country?: string
          p_ip_hash?: string
          p_path: string
          p_query?: string
          p_redirect_id: string
          p_referer?: string
          p_status?: number
          p_user_agent?: string
        }
        Returns: undefined
      }
      record_retest_result: {
        Args: {
          p_actor_kind?: string
          p_external_ref?: string
          p_result?: Json
          p_retest_id: string
          p_status: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          external_ref: string | null
          finished_at: string | null
          id: string
          kind: string
          result: Json | null
          routine_run_id: string
          runner: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_retest_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_routine_progress: {
        Args: {
          p_actor_kind?: string
          p_external_ref?: string
          p_payload?: Json
          p_run_id: string
          p_status: string
        }
        Returns: {
          commit_sha: string | null
          confidence: string | null
          created_at: string
          created_by: string | null
          error: string | null
          external_ref: string | null
          files_changed: string[] | null
          finished_at: string | null
          fix_summary: string | null
          id: string
          pr_url: string | null
          prompt: string
          prompt_hash: string
          risks: string | null
          runner: string
          status: string
          story_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_routine_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recount_unified_tag_usage: { Args: never; Returns: undefined }
      refresh_dashboard_stats: { Args: never; Returns: undefined }
      refresh_source_coverage: { Args: never; Returns: undefined }
      refresh_source_reliability: { Args: never; Returns: number }
      register_circuit_breaker: {
        Args: {
          p_api_name: string
          p_reset_seconds?: number
          p_threshold?: number
        }
        Returns: string
      }
      reject_group_join_request: {
        Args: { request_id: string }
        Returns: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          group_id: string
          id: string
          message: string | null
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "group_join_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_story_members: {
        Args: { p_story_id: string; p_submission_ids: string[] }
        Returns: number
      }
      remove_tag_from_category: {
        Args: { p_category_id: string; p_tag_id: string }
        Returns: undefined
      }
      replay_rejected_staging: {
        Args: {
          p_error_substring: string
          p_limit?: number
          p_target_table?: string
        }
        Returns: {
          previous_error: string
          staging_id: string
        }[]
      }
      resolve_city_and_country: {
        Args: { p_city_name: string; p_country_name: string }
        Returns: {
          city_found: boolean
          country_found: boolean
          resolved_city_id: string
          resolved_city_name: string
          resolved_country_id: string
          resolved_country_name: string
        }[]
      }
      resolve_currency_for_country: {
        Args: { p_country_code: string }
        Returns: {
          currency_code: string
          currency_symbol: string
        }[]
      }
      resolve_field_conflict: {
        Args: { p_entity_type: string; p_variants: Json }
        Returns: Json
      }
      resolve_geo_merge_candidate: {
        Args: { p_actor?: string; p_decision: string; p_staging_id: string }
        Returns: {
          action: string
          entity_id: string
          entity_type: string
        }[]
      }
      resolve_path_redirect: {
        Args: { p_path: string }
        Returns: {
          click_count: number
          click_limit: number
          id: string
          match_kind: Database["public"]["Enums"]["redirect_match_kind"]
          preserve_query: boolean
          query_mode: Database["public"]["Enums"]["redirect_query_mode"]
          query_override: Json
          source_path: string
          status_code: number
          target: string
          utm_defaults: Json
        }[]
      }
      resolve_short_redirect: {
        Args: { p_slug: string }
        Returns: {
          click_count: number
          click_limit: number
          id: string
          preserve_query: boolean
          query_mode: Database["public"]["Enums"]["redirect_query_mode"]
          query_override: Json
          slug: string
          status_code: number
          target: string
          utm_defaults: Json
        }[]
      }
      resolve_story: {
        Args: { p_close_items?: boolean; p_story_id: string }
        Returns: number
      }
      resolve_tag: {
        Args: { input_slug: string }
        Returns: {
          is_redirect: boolean
          tag_id: string
          tag_name: string
          tag_slug: string
        }[]
      }
      resolve_tag_slug: {
        Args: { p_slug: string }
        Returns: {
          id: string
          original_slug: string
          redirected: boolean
          slug: string
        }[]
      }
      resolve_trip_geo_review: {
        Args: { p_city_id: string; p_country_id: string; p_queue_id: string }
        Returns: undefined
      }
      retry_enrichment: {
        Args: { p_entity_id: string; p_entity_type: string; p_steps?: string[] }
        Returns: Json
      }
      revert_content_change: { Args: { p_change_id: string }; Returns: boolean }
      rollback_tag_change: { Args: { p_log_id: number }; Returns: Json }
      rotate_email_token: { Args: never; Returns: string }
      scan_table_duplicates:
        | {
            Args: {
              p_entity_type: string
              p_limit?: number
              p_threshold?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_entity_type: string
              p_limit?: number
              p_offset?: number
              p_threshold?: number
            }
            Returns: Json
          }
      schedule_location_anonymization: { Args: never; Returns: undefined }
      scraper_mark_snapshot_archived: {
        Args: { p_id: string; p_r2_key: string }
        Returns: undefined
      }
      scraper_prune_orphan_mappings: {
        Args: { p_entity_type: string }
        Returns: number
      }
      scraper_reconcile_orphans: {
        Args: never
        Returns: {
          entity_type: string
          orphan_count: number
        }[]
      }
      scraper_resolve_pending: {
        Args: { p_confidence_floor?: number; p_older_than_days?: number }
        Returns: number
      }
      scraper_snapshot_body: { Args: { p_id: string }; Returns: string }
      search_cities: {
        Args: { max_results?: number; q: string }
        Returns: {
          country_code: string
          country_id: string
          country_name: string
          id: string
          name: string
          timezone: string
        }[]
      }
      search_events: {
        Args: {
          p_accessibility_attributes?: string[]
          p_city?: string
          p_end?: string
          p_event_type?: string
          p_include_past?: boolean
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_start?: string
          p_tags?: string[]
          p_target_groups?: string[]
        }
        Returns: {
          event: Json
          total: number
        }[]
      }
      search_tags_with_aliases: {
        Args: { p_limit?: number; q: string }
        Returns: {
          id: string
          image_url: string
          is_sensitive: boolean
          match_score: number
          match_via: string
          name: string
          short_description: string
          slug: string
          verification_status: string
        }[]
      }
      secure_passkey_access: {
        Args: { p_operation: string; p_user_id: string }
        Returns: boolean
      }
      set_story_narrative: {
        Args: {
          p_brief_title: string
          p_mark_edited?: boolean
          p_narrative: string
          p_story_id: string
        }
        Returns: undefined
      }
      snapshot_news_article_original: {
        Args: { p_article_id: string; p_pipeline_version: string }
        Returns: boolean
      }
      snapshot_pipeline_definition: {
        Args: { p_pipeline_id: string }
        Returns: Json
      }
      stage_event_for_commit: {
        Args: {
          p_normalized?: Json
          p_raw: Json
          p_source_entity_id: string
          p_source_name: string
          p_source_type: string
          p_source_url?: string
        }
        Returns: string
      }
      start_retest: {
        Args: { p_kind: string; p_run_id: string; p_runner?: string }
        Returns: {
          created_at: string
          created_by: string | null
          external_ref: string | null
          finished_at: string | null
          id: string
          kind: string
          result: Json | null
          routine_run_id: string
          runner: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_retest_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      story_member_divergence: {
        Args: { p_story_id: string }
        Returns: {
          assignee_diff: number
          priority_diff: number
          status_diff: number
        }[]
      }
      suggest_story_from_ids: {
        Args: { p_submission_ids: string[] }
        Returns: {
          avg_similarity: number
          member_ids: string[]
          proposed_title: string
        }[]
      }
      tag_hygiene_report: {
        Args: never
        Returns: {
          issue_count: number
          issue_type: string
          sample_items: string
        }[]
      }
      tags_missing_descriptions: {
        Args: { p_limit: number }
        Returns: {
          human_reviewed: boolean
          id: string
          name: string
          slug: string
        }[]
      }
      tags_missing_embeddings: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          name: string
          short_description: string
          slug: string
          updated_at: string
        }[]
      }
      track_event_secure: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_metadata?: Json
          p_session_id: string
        }
        Returns: string
      }
      track_share_view: {
        Args: { p_referer_host?: string; p_token: string }
        Returns: string
      }
      track_umami_event: { Args: { payload: Json }; Returns: Json }
      track_user_event: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_metadata?: Json
          p_session_id: string
          p_user_id: string
        }
        Returns: string
      }
      unarchive_story: {
        Args: { p_story_id: string }
        Returns: {
          approved_by: string | null
          approved_for_claude_at: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assignee_id: string | null
          brief_title: string | null
          created_at: string
          created_by: string | null
          handoffs: Json
          id: string
          labels: string[]
          narrative: string | null
          narrative_edited: boolean
          needs_followup_reason: string | null
          origin: string
          priority: number
          resolved_at: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_stories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      universal_search: {
        Args: {
          category_filter?: string
          content_types?: string[]
          featured_only?: boolean
          geo_lat?: number
          geo_lng?: number
          location_filter?: string
          radius_km?: number
          result_limit?: number
          search_query: string
        }
        Returns: {
          content_type: string
          description: string
          featured: boolean
          id: string
          image_url: string
          latitude: number
          longitude: number
          relevance_score: number
          similarity_score: number
          slug: string
          subtitle: string
          title: string
        }[]
      }
      upsert_api_error: {
        Args: { p_data: Json; p_fingerprint: string; p_source?: string }
        Returns: string
      }
      user_id_for_email_token: { Args: { p_token: string }; Returns: string }
      validate_content_security: {
        Args: { content_text: string; content_type?: string }
        Returns: Json
      }
      validate_file_upload: {
        Args: { file_name: string; file_size: number; mime_type: string }
        Returns: Json
      }
      validate_import_data: { Args: { data: Json }; Returns: boolean }
      validate_password_enhanced: {
        Args: { password_text: string }
        Returns: Json
      }
      validate_profile_access: {
        Args: {
          access_type?: string
          profile_user_id: string
          requesting_user_id: string
        }
        Returns: boolean
      }
      venue_duplicate_summary: {
        Args: never
        Returns: {
          duplicates: number
          slug: string
        }[]
      }
      verify_story: {
        Args: { p_note?: string; p_outcome: string; p_story_id: string }
        Returns: {
          approved_by: string | null
          approved_for_claude_at: string | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          assignee_id: string | null
          brief_title: string | null
          created_at: string
          created_by: string | null
          handoffs: Json
          id: string
          labels: string[]
          narrative: string | null
          narrative_edited: boolean
          needs_followup_reason: string | null
          origin: string
          priority: number
          resolved_at: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "feedback_stories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "editor"
      cms_content_type:
        | "event"
        | "space"
        | "place"
        | "market"
        | "resource"
        | "community"
        | "news"
        | "page"
        | "personality"
      cms_media_role:
        | "cover"
        | "gallery"
        | "attachment"
        | "avatar"
        | "thumbnail"
      cms_visibility_level: "public" | "private" | "restricted"
      cms_workflow_state: "draft" | "review" | "published" | "archived"
      redirect_match_kind: "EXACT" | "WILDCARD" | "REGEX"
      redirect_query_mode: "PRESERVE" | "DROP" | "OVERRIDE"
      redirect_type: "SHORT" | "PATH"
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
      app_role: ["admin", "moderator", "user", "editor"],
      cms_content_type: [
        "event",
        "space",
        "place",
        "market",
        "resource",
        "community",
        "news",
        "page",
        "personality",
      ],
      cms_media_role: ["cover", "gallery", "attachment", "avatar", "thumbnail"],
      cms_visibility_level: ["public", "private", "restricted"],
      cms_workflow_state: ["draft", "review", "published", "archived"],
      redirect_match_kind: ["EXACT", "WILDCARD", "REGEX"],
      redirect_query_mode: ["PRESERVE", "DROP", "OVERRIDE"],
      redirect_type: ["SHORT", "PATH"],
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

