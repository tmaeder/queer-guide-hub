export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '12.2.3 (519615d)';
  };
  public: {
    Tables: {
      access_logs: {
        Row: {
          created_at: string;
          endpoint: string | null;
          id: string;
          ip_address: unknown;
          method: string | null;
          response_time_ms: number | null;
          status_code: number | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          endpoint?: string | null;
          id?: string;
          ip_address: unknown;
          method?: string | null;
          response_time_ms?: number | null;
          status_code?: number | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          endpoint?: string | null;
          id?: string;
          ip_address?: unknown;
          method?: string | null;
          response_time_ms?: number | null;
          status_code?: number | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      accessibility_attributes: {
        Row: {
          category: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          encrypted_key: string;
          id: string;
          is_active: boolean;
          key_name: string;
          last_used_at: string | null;
          service_name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          encrypted_key: string;
          id?: string;
          is_active?: boolean;
          key_name: string;
          last_used_at?: string | null;
          service_name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          encrypted_key?: string;
          id?: string;
          is_active?: boolean;
          key_name?: string;
          last_used_at?: string | null;
          service_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_edit_log: {
        Row: {
          after_data: Json;
          before_data: Json;
          changed_fields: string[];
          content_id: string;
          content_type: string;
          created_at: string;
          editor_id: string;
          id: string;
        };
        Insert: {
          after_data: Json;
          before_data: Json;
          changed_fields?: string[];
          content_id: string;
          content_type: string;
          created_at?: string;
          editor_id: string;
          id?: string;
        };
        Update: {
          after_data?: Json;
          before_data?: Json;
          changed_fields?: string[];
          content_id?: string;
          content_type?: string;
          created_at?: string;
          editor_id?: string;
          id?: string;
        };
        Relationships: [];
      };
      affiliate_partners: {
        Row: {
          created_at: string;
          domains: string[];
          enabled: boolean;
          id: string;
          notes: string | null;
          parameters: Json;
          partner_name: string;
          redirect_template: string | null;
          updated_at: string;
          url_patterns: string[] | null;
        };
        Insert: {
          created_at?: string;
          domains?: string[];
          enabled?: boolean;
          id?: string;
          notes?: string | null;
          parameters?: Json;
          partner_name: string;
          redirect_template?: string | null;
          updated_at?: string;
          url_patterns?: string[] | null;
        };
        Update: {
          created_at?: string;
          domains?: string[];
          enabled?: boolean;
          id?: string;
          notes?: string | null;
          parameters?: Json;
          partner_name?: string;
          redirect_template?: string | null;
          updated_at?: string;
          url_patterns?: string[] | null;
        };
        Relationships: [];
      };
      airports: {
        Row: {
          city_iata: string | null;
          city_name: string | null;
          country_code: string | null;
          created_at: string | null;
          iata_code: string;
          is_major: boolean | null;
          latitude: number | null;
          longitude: number | null;
          name: string;
        };
        Insert: {
          city_iata?: string | null;
          city_name?: string | null;
          country_code?: string | null;
          created_at?: string | null;
          iata_code: string;
          is_major?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
        };
        Update: {
          city_iata?: string | null;
          city_name?: string | null;
          country_code?: string | null;
          created_at?: string | null;
          iata_code?: string;
          is_major?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
        };
        Relationships: [];
      };
      amenities: {
        Row: {
          icon_name: string | null;
          id: string;
          name: string;
        };
        Insert: {
          icon_name?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          icon_name?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      attributes: {
        Row: {
          category: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number | null;
          type: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audio_files: {
        Row: {
          album: string | null;
          artist: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          duration_seconds: number | null;
          id: string;
          metadata: Json | null;
          original_filename: string;
          poster_image_path: string | null;
          processing_job_id: string | null;
          status: string;
          storage_path: string;
          title: string;
          transcript_path: string | null;
          updated_at: string;
        };
        Insert: {
          album?: string | null;
          artist?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          id?: string;
          metadata?: Json | null;
          original_filename: string;
          poster_image_path?: string | null;
          processing_job_id?: string | null;
          status?: string;
          storage_path: string;
          title: string;
          transcript_path?: string | null;
          updated_at?: string;
        };
        Update: {
          album?: string | null;
          artist?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          id?: string;
          metadata?: Json | null;
          original_filename?: string;
          poster_image_path?: string | null;
          processing_job_id?: string | null;
          status?: string;
          storage_path?: string;
          title?: string;
          transcript_path?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      audio_processing_jobs: {
        Row: {
          audio_id: string;
          completed_at: string | null;
          completed_renditions: number | null;
          created_at: string;
          current_stage: string | null;
          error_message: string | null;
          id: string;
          processing_config: Json;
          progress_percent: number | null;
          started_at: string | null;
          status: string;
          total_renditions: number | null;
          updated_at: string;
        };
        Insert: {
          audio_id: string;
          completed_at?: string | null;
          completed_renditions?: number | null;
          created_at?: string;
          current_stage?: string | null;
          error_message?: string | null;
          id?: string;
          processing_config?: Json;
          progress_percent?: number | null;
          started_at?: string | null;
          status?: string;
          total_renditions?: number | null;
          updated_at?: string;
        };
        Update: {
          audio_id?: string;
          completed_at?: string | null;
          completed_renditions?: number | null;
          created_at?: string;
          current_stage?: string | null;
          error_message?: string | null;
          id?: string;
          processing_config?: Json;
          progress_percent?: number | null;
          started_at?: string | null;
          status?: string;
          total_renditions?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audio_processing_jobs_audio_id_fkey';
            columns: ['audio_id'];
            isOneToOne: false;
            referencedRelation: 'audio_files';
            referencedColumns: ['id'];
          },
        ];
      };
      audio_renditions: {
        Row: {
          audio_id: string;
          bitrate_kbps: number | null;
          codec: string;
          container: string;
          created_at: string;
          file_path: string;
          file_size: number;
          format: string;
          id: string;
        };
        Insert: {
          audio_id: string;
          bitrate_kbps?: number | null;
          codec: string;
          container: string;
          created_at?: string;
          file_path: string;
          file_size: number;
          format: string;
          id?: string;
        };
        Update: {
          audio_id?: string;
          bitrate_kbps?: number | null;
          codec?: string;
          container?: string;
          created_at?: string;
          file_path?: string;
          file_size?: number;
          format?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audio_renditions_audio_id_fkey';
            columns: ['audio_id'];
            isOneToOne: false;
            referencedRelation: 'audio_files';
            referencedColumns: ['id'];
          },
        ];
      };
      auth_rate_limit: {
        Row: {
          attempt_count: number | null;
          blocked_until: string | null;
          created_at: string | null;
          id: string;
          ip_address: unknown;
          last_attempt: string | null;
        };
        Insert: {
          attempt_count?: number | null;
          blocked_until?: string | null;
          created_at?: string | null;
          id?: string;
          ip_address: unknown;
          last_attempt?: string | null;
        };
        Update: {
          attempt_count?: number | null;
          blocked_until?: string | null;
          created_at?: string | null;
          id?: string;
          ip_address?: unknown;
          last_attempt?: string | null;
        };
        Relationships: [];
      };
      auth_rate_limit_keys: {
        Row: {
          attempt_count: number;
          blocked_until: string | null;
          created_at: string;
          id: string;
          key: string;
          last_attempt: string;
        };
        Insert: {
          attempt_count?: number;
          blocked_until?: string | null;
          created_at?: string;
          id?: string;
          key: string;
          last_attempt?: string;
        };
        Update: {
          attempt_count?: number;
          blocked_until?: string | null;
          created_at?: string;
          id?: string;
          key?: string;
          last_attempt?: string;
        };
        Relationships: [];
      };
      automated_review_rules: {
        Row: {
          config: Json;
          created_at: string;
          enabled: boolean;
          id: string;
          last_run_at: string | null;
          rule_name: string;
          rule_type: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          last_run_at?: string | null;
          rule_name: string;
          rule_type: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          last_run_at?: string | null;
          rule_name?: string;
          rule_type?: string;
        };
        Relationships: [];
      };
      automation_modules: {
        Row: {
          auto_approve_threshold: number | null;
          batch_size: number | null;
          config: Json | null;
          content_types: string[];
          created_at: string | null;
          description: string | null;
          display_name: string;
          id: string;
          is_enabled: boolean | null;
          last_run_at: string | null;
          last_run_status: string | null;
          module_type: string;
          rate_limit_per_hour: number | null;
          slug: string;
          total_changes_applied: number | null;
          total_changes_proposed: number | null;
          total_runs: number | null;
          updated_at: string | null;
          workflow_definition_id: string | null;
        };
        Insert: {
          auto_approve_threshold?: number | null;
          batch_size?: number | null;
          config?: Json | null;
          content_types?: string[];
          created_at?: string | null;
          description?: string | null;
          display_name: string;
          id?: string;
          is_enabled?: boolean | null;
          last_run_at?: string | null;
          last_run_status?: string | null;
          module_type: string;
          rate_limit_per_hour?: number | null;
          slug: string;
          total_changes_applied?: number | null;
          total_changes_proposed?: number | null;
          total_runs?: number | null;
          updated_at?: string | null;
          workflow_definition_id?: string | null;
        };
        Update: {
          auto_approve_threshold?: number | null;
          batch_size?: number | null;
          config?: Json | null;
          content_types?: string[];
          created_at?: string | null;
          description?: string | null;
          display_name?: string;
          id?: string;
          is_enabled?: boolean | null;
          last_run_at?: string | null;
          last_run_status?: string | null;
          module_type?: string;
          rate_limit_per_hour?: number | null;
          slug?: string;
          total_changes_applied?: number | null;
          total_changes_proposed?: number | null;
          total_runs?: number | null;
          updated_at?: string | null;
          workflow_definition_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'automation_modules_workflow_definition_id_fkey';
            columns: ['workflow_definition_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_definitions';
            referencedColumns: ['id'];
          },
        ];
      };
      automation_rules: {
        Row: {
          auto_fix: boolean | null;
          content_type: string;
          created_at: string | null;
          description: string | null;
          field_name: string;
          id: string;
          is_enabled: boolean | null;
          module_id: string;
          name: string;
          rule_config: Json | null;
          rule_type: string;
          severity: string | null;
          sort_order: number | null;
          updated_at: string | null;
        };
        Insert: {
          auto_fix?: boolean | null;
          content_type: string;
          created_at?: string | null;
          description?: string | null;
          field_name: string;
          id?: string;
          is_enabled?: boolean | null;
          module_id: string;
          name: string;
          rule_config?: Json | null;
          rule_type: string;
          severity?: string | null;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Update: {
          auto_fix?: boolean | null;
          content_type?: string;
          created_at?: string | null;
          description?: string | null;
          field_name?: string;
          id?: string;
          is_enabled?: boolean | null;
          module_id?: string;
          name?: string;
          rule_config?: Json | null;
          rule_type?: string;
          severity?: string | null;
          sort_order?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'automation_rules_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'automation_modules';
            referencedColumns: ['id'];
          },
        ];
      };
      automation_run_log: {
        Row: {
          changes_auto_approved: number | null;
          changes_pending_review: number | null;
          changes_proposed: number | null;
          content_type: string | null;
          created_at: string | null;
          duration_ms: number | null;
          errors: number | null;
          id: string;
          items_scanned: number | null;
          module_id: string;
          run_config: Json | null;
          workflow_run_id: string | null;
        };
        Insert: {
          changes_auto_approved?: number | null;
          changes_pending_review?: number | null;
          changes_proposed?: number | null;
          content_type?: string | null;
          created_at?: string | null;
          duration_ms?: number | null;
          errors?: number | null;
          id?: string;
          items_scanned?: number | null;
          module_id: string;
          run_config?: Json | null;
          workflow_run_id?: string | null;
        };
        Update: {
          changes_auto_approved?: number | null;
          changes_pending_review?: number | null;
          changes_proposed?: number | null;
          content_type?: string | null;
          created_at?: string | null;
          duration_ms?: number | null;
          errors?: number | null;
          id?: string;
          items_scanned?: number | null;
          module_id?: string;
          run_config?: Json | null;
          workflow_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'automation_run_log_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'automation_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'automation_run_log_workflow_run_id_fkey';
            columns: ['workflow_run_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      boundaries: {
        Row: {
          bbox: Json | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          geometry_geojson: Json;
          id: string;
          precision: string;
          source: string;
          source_id: string | null;
          updated_at: string;
          vertex_count: number | null;
        };
        Insert: {
          bbox?: Json | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          geometry_geojson: Json;
          id?: string;
          precision?: string;
          source?: string;
          source_id?: string | null;
          updated_at?: string;
          vertex_count?: number | null;
        };
        Update: {
          bbox?: Json | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          geometry_geojson?: Json;
          id?: string;
          precision?: string;
          source?: string;
          source_id?: string | null;
          updated_at?: string;
          vertex_count?: number | null;
        };
        Relationships: [];
      };
      calendar_feed_tokens: {
        Row: {
          created_at: string;
          id: string;
          last_used_at: string | null;
          revoked: boolean;
          token: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_used_at?: string | null;
          revoked?: boolean;
          token: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_used_at?: string | null;
          revoked?: boolean;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      captcha_verifications: {
        Row: {
          created_at: string | null;
          id: string;
          ip_address: string | null;
          success: boolean;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          ip_address?: string | null;
          success: boolean;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          ip_address?: string | null;
          success?: boolean;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      cities: {
        Row: {
          airport_codes: string[] | null;
          area_codes: string[] | null;
          area_km2: number | null;
          best_time_to_visit: string | null;
          climate_type: string | null;
          cost_of_living: Json | null;
          country_id: string;
          created_at: string;
          demographics: Json | null;
          description: string | null;
          economy_sectors: string[] | null;
          elevation_m: number | null;
          founded_year: number | null;
          id: string;
          image_metadata: Json | null;
          image_url: string | null;
          is_capital: boolean | null;
          is_major_city: boolean | null;
          latitude: number | null;
          lgbt_friendly_rating: number | null;
          local_customs: string | null;
          local_language: string | null;
          longitude: number | null;
          major_airport_code: string | null;
          mayor: string | null;
          name: string;
          notable_landmarks: string[] | null;
          official_website: string | null;
          population: number | null;
          postal_codes: string[] | null;
          region_name: string | null;
          sister_cities: string[] | null;
          timezone: string | null;
          transportation_info: Json | null;
          universities: string[] | null;
          updated_at: string;
        };
        Insert: {
          airport_codes?: string[] | null;
          area_codes?: string[] | null;
          area_km2?: number | null;
          best_time_to_visit?: string | null;
          climate_type?: string | null;
          cost_of_living?: Json | null;
          country_id: string;
          created_at?: string;
          demographics?: Json | null;
          description?: string | null;
          economy_sectors?: string[] | null;
          elevation_m?: number | null;
          founded_year?: number | null;
          id?: string;
          image_metadata?: Json | null;
          image_url?: string | null;
          is_capital?: boolean | null;
          is_major_city?: boolean | null;
          latitude?: number | null;
          lgbt_friendly_rating?: number | null;
          local_customs?: string | null;
          local_language?: string | null;
          longitude?: number | null;
          major_airport_code?: string | null;
          mayor?: string | null;
          name: string;
          notable_landmarks?: string[] | null;
          official_website?: string | null;
          population?: number | null;
          postal_codes?: string[] | null;
          region_name?: string | null;
          sister_cities?: string[] | null;
          timezone?: string | null;
          transportation_info?: Json | null;
          universities?: string[] | null;
          updated_at?: string;
        };
        Update: {
          airport_codes?: string[] | null;
          area_codes?: string[] | null;
          area_km2?: number | null;
          best_time_to_visit?: string | null;
          climate_type?: string | null;
          cost_of_living?: Json | null;
          country_id?: string;
          created_at?: string;
          demographics?: Json | null;
          description?: string | null;
          economy_sectors?: string[] | null;
          elevation_m?: number | null;
          founded_year?: number | null;
          id?: string;
          image_metadata?: Json | null;
          image_url?: string | null;
          is_capital?: boolean | null;
          is_major_city?: boolean | null;
          latitude?: number | null;
          lgbt_friendly_rating?: number | null;
          local_customs?: string | null;
          local_language?: string | null;
          longitude?: number | null;
          major_airport_code?: string | null;
          mayor?: string | null;
          name?: string;
          notable_landmarks?: string[] | null;
          official_website?: string | null;
          population?: number | null;
          postal_codes?: string[] | null;
          region_name?: string | null;
          sister_cities?: string[] | null;
          timezone?: string | null;
          transportation_info?: Json | null;
          universities?: string[] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cities_country_id_fkey';
            columns: ['country_id'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['id'];
          },
        ];
      };
      city_aliases: {
        Row: {
          alias: string;
          city_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          alias: string;
          city_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          alias?: string;
          city_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'city_aliases_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
        ];
      };
      city_favorites: {
        Row: {
          city_id: string;
          created_at: string | null;
          id: string;
          user_id: string;
        };
        Insert: {
          city_id: string;
          created_at?: string | null;
          id?: string;
          user_id: string;
        };
        Update: {
          city_id?: string;
          created_at?: string | null;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      cms_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          changes: Json | null;
          content_id: string | null;
          id: string;
          ip_address: unknown;
          metadata: Json | null;
          source_id: string | null;
          source_table: string | null;
          timestamp: string;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          changes?: Json | null;
          content_id?: string | null;
          id?: string;
          ip_address?: unknown;
          metadata?: Json | null;
          source_id?: string | null;
          source_table?: string | null;
          timestamp?: string;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          changes?: Json | null;
          content_id?: string | null;
          id?: string;
          ip_address?: unknown;
          metadata?: Json | null;
          source_id?: string | null;
          source_table?: string | null;
          timestamp?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cms_audit_log_content_id_fkey';
            columns: ['content_id'];
            isOneToOne: false;
            referencedRelation: 'cms_content';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_content: {
        Row: {
          body_html: string | null;
          body_json: Json | null;
          content_data: Json;
          content_type: Database['public']['Enums']['cms_content_type'];
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: Json | null;
          external_ids: Json | null;
          featured_weight: number | null;
          id: string;
          meta_description: Json | null;
          meta_title: Json | null;
          published_at: string | null;
          published_by: string | null;
          slug: string;
          source_metadata: Json | null;
          tags: string[] | null;
          title: Json;
          updated_at: string;
          updated_by: string | null;
          visibility_level: Database['public']['Enums']['cms_visibility_level'];
          workflow_state: Database['public']['Enums']['cms_workflow_state'];
        };
        Insert: {
          body_html?: string | null;
          body_json?: Json | null;
          content_data?: Json;
          content_type: Database['public']['Enums']['cms_content_type'];
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: Json | null;
          external_ids?: Json | null;
          featured_weight?: number | null;
          id?: string;
          meta_description?: Json | null;
          meta_title?: Json | null;
          published_at?: string | null;
          published_by?: string | null;
          slug: string;
          source_metadata?: Json | null;
          tags?: string[] | null;
          title?: Json;
          updated_at?: string;
          updated_by?: string | null;
          visibility_level?: Database['public']['Enums']['cms_visibility_level'];
          workflow_state?: Database['public']['Enums']['cms_workflow_state'];
        };
        Update: {
          body_html?: string | null;
          body_json?: Json | null;
          content_data?: Json;
          content_type?: Database['public']['Enums']['cms_content_type'];
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: Json | null;
          external_ids?: Json | null;
          featured_weight?: number | null;
          id?: string;
          meta_description?: Json | null;
          meta_title?: Json | null;
          published_at?: string | null;
          published_by?: string | null;
          slug?: string;
          source_metadata?: Json | null;
          tags?: string[] | null;
          title?: Json;
          updated_at?: string;
          updated_by?: string | null;
          visibility_level?: Database['public']['Enums']['cms_visibility_level'];
          workflow_state?: Database['public']['Enums']['cms_workflow_state'];
        };
        Relationships: [];
      };
      cms_content_media: {
        Row: {
          content_id: string;
          created_at: string;
          id: string;
          media_id: string;
          media_role: Database['public']['Enums']['cms_media_role'];
          metadata: Json | null;
          sort_order: number | null;
        };
        Insert: {
          content_id: string;
          created_at?: string;
          id?: string;
          media_id: string;
          media_role?: Database['public']['Enums']['cms_media_role'];
          metadata?: Json | null;
          sort_order?: number | null;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          id?: string;
          media_id?: string;
          media_role?: Database['public']['Enums']['cms_media_role'];
          metadata?: Json | null;
          sort_order?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cms_content_media_content_id_fkey';
            columns: ['content_id'];
            isOneToOne: false;
            referencedRelation: 'cms_content';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cms_content_media_media_id_fkey';
            columns: ['media_id'];
            isOneToOne: false;
            referencedRelation: 'cms_media';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_content_metadata: {
        Row: {
          canonical_url: string | null;
          created_at: string;
          editor_notes: string | null;
          id: string;
          last_edited_at: string | null;
          last_edited_by: string | null;
          locked_at: string | null;
          locked_by: string | null;
          meta_description: string | null;
          meta_title: string | null;
          published_at: string | null;
          published_by: string | null;
          scheduled_publish_at: string | null;
          scheduled_unpublish_at: string | null;
          source_id: string;
          source_table: string;
          updated_at: string;
          visibility_level: Database['public']['Enums']['cms_visibility_level'];
          workflow_state: Database['public']['Enums']['cms_workflow_state'];
        };
        Insert: {
          canonical_url?: string | null;
          created_at?: string;
          editor_notes?: string | null;
          id?: string;
          last_edited_at?: string | null;
          last_edited_by?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          scheduled_publish_at?: string | null;
          scheduled_unpublish_at?: string | null;
          source_id: string;
          source_table: string;
          updated_at?: string;
          visibility_level?: Database['public']['Enums']['cms_visibility_level'];
          workflow_state?: Database['public']['Enums']['cms_workflow_state'];
        };
        Update: {
          canonical_url?: string | null;
          created_at?: string;
          editor_notes?: string | null;
          id?: string;
          last_edited_at?: string | null;
          last_edited_by?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          meta_description?: string | null;
          meta_title?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          scheduled_publish_at?: string | null;
          scheduled_unpublish_at?: string | null;
          source_id?: string;
          source_table?: string;
          updated_at?: string;
          visibility_level?: Database['public']['Enums']['cms_visibility_level'];
          workflow_state?: Database['public']['Enums']['cms_workflow_state'];
        };
        Relationships: [];
      };
      cms_content_relationships: {
        Row: {
          created_at: string;
          created_by: string | null;
          from_content_id: string;
          id: string;
          relationship_type: string;
          role_metadata: Json | null;
          sort_order: number | null;
          to_content_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          from_content_id: string;
          id?: string;
          relationship_type: string;
          role_metadata?: Json | null;
          sort_order?: number | null;
          to_content_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          from_content_id?: string;
          id?: string;
          relationship_type?: string;
          role_metadata?: Json | null;
          sort_order?: number | null;
          to_content_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cms_content_relationships_from_content_id_fkey';
            columns: ['from_content_id'];
            isOneToOne: false;
            referencedRelation: 'cms_content';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cms_content_relationships_to_content_id_fkey';
            columns: ['to_content_id'];
            isOneToOne: false;
            referencedRelation: 'cms_content';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_content_revisions: {
        Row: {
          change_summary: string | null;
          content_data: Json;
          content_id: string;
          created_at: string;
          created_by: string | null;
          description: Json | null;
          id: string;
          meta_description: Json | null;
          meta_title: Json | null;
          revision_number: number;
          tags: string[] | null;
          title: Json;
          visibility_level: Database['public']['Enums']['cms_visibility_level'];
          workflow_state: Database['public']['Enums']['cms_workflow_state'];
        };
        Insert: {
          change_summary?: string | null;
          content_data: Json;
          content_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: Json | null;
          id?: string;
          meta_description?: Json | null;
          meta_title?: Json | null;
          revision_number: number;
          tags?: string[] | null;
          title: Json;
          visibility_level: Database['public']['Enums']['cms_visibility_level'];
          workflow_state: Database['public']['Enums']['cms_workflow_state'];
        };
        Update: {
          change_summary?: string | null;
          content_data?: Json;
          content_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: Json | null;
          id?: string;
          meta_description?: Json | null;
          meta_title?: Json | null;
          revision_number?: number;
          tags?: string[] | null;
          title?: Json;
          visibility_level?: Database['public']['Enums']['cms_visibility_level'];
          workflow_state?: Database['public']['Enums']['cms_workflow_state'];
        };
        Relationships: [
          {
            foreignKeyName: 'cms_content_revisions_content_id_fkey';
            columns: ['content_id'];
            isOneToOne: false;
            referencedRelation: 'cms_content';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_duplicate_candidates: {
        Row: {
          content_id_1: string;
          content_id_2: string;
          created_at: string;
          decision_reason: string | null;
          id: string;
          matching_criteria: Json;
          reviewed_at: string | null;
          reviewed_by: string | null;
          similarity_score: number;
          status: string;
        };
        Insert: {
          content_id_1: string;
          content_id_2: string;
          created_at?: string;
          decision_reason?: string | null;
          id?: string;
          matching_criteria?: Json;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          similarity_score: number;
          status?: string;
        };
        Update: {
          content_id_1?: string;
          content_id_2?: string;
          created_at?: string;
          decision_reason?: string | null;
          id?: string;
          matching_criteria?: Json;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          similarity_score?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cms_duplicate_candidates_content_id_1_fkey';
            columns: ['content_id_1'];
            isOneToOne: false;
            referencedRelation: 'cms_content';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cms_duplicate_candidates_content_id_2_fkey';
            columns: ['content_id_2'];
            isOneToOne: false;
            referencedRelation: 'cms_content';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_media: {
        Row: {
          alt_text: Json | null;
          attribution: string | null;
          author: string | null;
          caption: Json | null;
          created_at: string;
          external_id: string | null;
          external_source: string | null;
          file_size: number;
          filename: string;
          height: number | null;
          id: string;
          license: string | null;
          mime_type: string;
          original_filename: string;
          source_url: string | null;
          storage_path: string;
          uploaded_by: string | null;
          width: number | null;
        };
        Insert: {
          alt_text?: Json | null;
          attribution?: string | null;
          author?: string | null;
          caption?: Json | null;
          created_at?: string;
          external_id?: string | null;
          external_source?: string | null;
          file_size: number;
          filename: string;
          height?: number | null;
          id?: string;
          license?: string | null;
          mime_type: string;
          original_filename: string;
          source_url?: string | null;
          storage_path: string;
          uploaded_by?: string | null;
          width?: number | null;
        };
        Update: {
          alt_text?: Json | null;
          attribution?: string | null;
          author?: string | null;
          caption?: Json | null;
          created_at?: string;
          external_id?: string | null;
          external_source?: string | null;
          file_size?: number;
          filename?: string;
          height?: number | null;
          id?: string;
          license?: string | null;
          mime_type?: string;
          original_filename?: string;
          source_url?: string | null;
          storage_path?: string;
          uploaded_by?: string | null;
          width?: number | null;
        };
        Relationships: [];
      };
      cms_media_attachments: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          media_id: string;
          media_role: Database['public']['Enums']['cms_media_role'];
          metadata: Json | null;
          sort_order: number | null;
          source_id: string;
          source_table: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          media_id: string;
          media_role?: Database['public']['Enums']['cms_media_role'];
          metadata?: Json | null;
          sort_order?: number | null;
          source_id: string;
          source_table: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          media_id?: string;
          media_role?: Database['public']['Enums']['cms_media_role'];
          metadata?: Json | null;
          sort_order?: number | null;
          source_id?: string;
          source_table?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cms_media_attachments_media_id_fkey';
            columns: ['media_id'];
            isOneToOne: false;
            referencedRelation: 'cms_media';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_pages: {
        Row: {
          author_id: string | null;
          body_html: string | null;
          body_json: Json | null;
          canonical_url: string | null;
          category: string | null;
          cover_image_alt: string | null;
          cover_image_url: string | null;
          created_at: string;
          created_by: string | null;
          excerpt: string | null;
          id: string;
          meta_description: string | null;
          meta_title: string | null;
          og_image_url: string | null;
          page_type: string;
          parent_slug: string | null;
          published_at: string | null;
          published_by: string | null;
          scheduled_publish_at: string | null;
          slug: string;
          subtitle: string | null;
          tags: string[] | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          visibility_level: Database['public']['Enums']['cms_visibility_level'];
          workflow_state: Database['public']['Enums']['cms_workflow_state'];
        };
        Insert: {
          author_id?: string | null;
          body_html?: string | null;
          body_json?: Json | null;
          canonical_url?: string | null;
          category?: string | null;
          cover_image_alt?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          og_image_url?: string | null;
          page_type?: string;
          parent_slug?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          scheduled_publish_at?: string | null;
          slug: string;
          subtitle?: string | null;
          tags?: string[] | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          visibility_level?: Database['public']['Enums']['cms_visibility_level'];
          workflow_state?: Database['public']['Enums']['cms_workflow_state'];
        };
        Update: {
          author_id?: string | null;
          body_html?: string | null;
          body_json?: Json | null;
          canonical_url?: string | null;
          category?: string | null;
          cover_image_alt?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          excerpt?: string | null;
          id?: string;
          meta_description?: string | null;
          meta_title?: string | null;
          og_image_url?: string | null;
          page_type?: string;
          parent_slug?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          scheduled_publish_at?: string | null;
          slug?: string;
          subtitle?: string | null;
          tags?: string[] | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          visibility_level?: Database['public']['Enums']['cms_visibility_level'];
          workflow_state?: Database['public']['Enums']['cms_workflow_state'];
        };
        Relationships: [
          {
            foreignKeyName: 'cms_pages_parent_slug_fk';
            columns: ['parent_slug'];
            isOneToOne: false;
            referencedRelation: 'cms_pages';
            referencedColumns: ['slug'];
          },
        ];
      };
      cms_review_comments: {
        Row: {
          body: string;
          comment_type: string;
          created_at: string;
          created_by: string | null;
          id: string;
          parent_comment_id: string | null;
          resolved: boolean;
          resolved_at: string | null;
          resolved_by: string | null;
          revision_id: string | null;
          source_id: string;
          source_table: string;
          updated_at: string;
        };
        Insert: {
          body: string;
          comment_type?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          parent_comment_id?: string | null;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
          revision_id?: string | null;
          source_id: string;
          source_table: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          comment_type?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          parent_comment_id?: string | null;
          resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
          revision_id?: string | null;
          source_id?: string;
          source_table?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cms_review_comments_parent_comment_id_fkey';
            columns: ['parent_comment_id'];
            isOneToOne: false;
            referencedRelation: 'cms_review_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cms_review_comments_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: false;
            referencedRelation: 'cms_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_review_queue: {
        Row: {
          assigned_to: string | null;
          content_id: string;
          created_at: string;
          id: string;
          metadata: Json | null;
          notes: string | null;
          priority: number | null;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          review_type: string;
        };
        Insert: {
          assigned_to?: string | null;
          content_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          notes?: string | null;
          priority?: number | null;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          review_type: string;
        };
        Update: {
          assigned_to?: string | null;
          content_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          notes?: string | null;
          priority?: number | null;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          review_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cms_review_queue_content_id_fkey';
            columns: ['content_id'];
            isOneToOne: false;
            referencedRelation: 'cms_content';
            referencedColumns: ['id'];
          },
        ];
      };
      cms_revisions: {
        Row: {
          change_summary: string | null;
          changes: Json | null;
          created_at: string;
          created_by: string | null;
          id: string;
          revision_number: number;
          snapshot: Json;
          source_id: string;
          source_table: string;
          workflow_state: Database['public']['Enums']['cms_workflow_state'] | null;
        };
        Insert: {
          change_summary?: string | null;
          changes?: Json | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          revision_number: number;
          snapshot: Json;
          source_id: string;
          source_table: string;
          workflow_state?: Database['public']['Enums']['cms_workflow_state'] | null;
        };
        Update: {
          change_summary?: string | null;
          changes?: Json | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          revision_number?: number;
          snapshot?: Json;
          source_id?: string;
          source_table?: string;
          workflow_state?: Database['public']['Enums']['cms_workflow_state'] | null;
        };
        Relationships: [];
      };
      comment_likes: {
        Row: {
          comment_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comment_likes_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'post_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comment_likes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'comment_likes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'comment_likes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      community_groups: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_private: boolean;
          member_count: number;
          name: string;
          rules: string | null;
          tags: string[] | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_private?: boolean;
          member_count?: number;
          name: string;
          rules?: string | null;
          tags?: string[] | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_private?: boolean;
          member_count?: number;
          name?: string;
          rules?: string | null;
          tags?: string[] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      community_posts: {
        Row: {
          comments_count: number | null;
          content: string;
          created_at: string;
          id: string;
          images: string[] | null;
          likes_count: number | null;
          link_description: string | null;
          link_title: string | null;
          link_url: string | null;
          mentions: Json | null;
          pinned: boolean | null;
          poll_options: Json | null;
          post_type: string | null;
          referenced_id: string | null;
          referenced_type: string | null;
          shares_count: number | null;
          tags: string[] | null;
          updated_at: string;
          user_id: string;
          visibility: string | null;
        };
        Insert: {
          comments_count?: number | null;
          content: string;
          created_at?: string;
          id?: string;
          images?: string[] | null;
          likes_count?: number | null;
          link_description?: string | null;
          link_title?: string | null;
          link_url?: string | null;
          mentions?: Json | null;
          pinned?: boolean | null;
          poll_options?: Json | null;
          post_type?: string | null;
          referenced_id?: string | null;
          referenced_type?: string | null;
          shares_count?: number | null;
          tags?: string[] | null;
          updated_at?: string;
          user_id: string;
          visibility?: string | null;
        };
        Update: {
          comments_count?: number | null;
          content?: string;
          created_at?: string;
          id?: string;
          images?: string[] | null;
          likes_count?: number | null;
          link_description?: string | null;
          link_title?: string | null;
          link_url?: string | null;
          mentions?: Json | null;
          pinned?: boolean | null;
          poll_options?: Json | null;
          post_type?: string | null;
          referenced_id?: string | null;
          referenced_type?: string | null;
          shares_count?: number | null;
          tags?: string[] | null;
          updated_at?: string;
          user_id?: string;
          visibility?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'community_posts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'community_posts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'community_posts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      community_submissions: {
        Row: {
          content_type: string;
          data: Json;
          flyer_scan_id: string | null;
          id: string;
          ip_address: unknown;
          promoted_to_id: string | null;
          promoted_to_table: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          reviewer_notes: string | null;
          status: string;
          submitted_at: string;
          submitted_by: string | null;
          user_agent: string | null;
        };
        Insert: {
          content_type: string;
          data?: Json;
          flyer_scan_id?: string | null;
          id?: string;
          ip_address?: unknown;
          promoted_to_id?: string | null;
          promoted_to_table?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          reviewer_notes?: string | null;
          status?: string;
          submitted_at?: string;
          submitted_by?: string | null;
          user_agent?: string | null;
        };
        Update: {
          content_type?: string;
          data?: Json;
          flyer_scan_id?: string | null;
          id?: string;
          ip_address?: unknown;
          promoted_to_id?: string | null;
          promoted_to_table?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          reviewer_notes?: string | null;
          status?: string;
          submitted_at?: string;
          submitted_by?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'community_submissions_flyer_scan_id_fkey';
            columns: ['flyer_scan_id'];
            isOneToOne: false;
            referencedRelation: 'flyer_scans';
            referencedColumns: ['id'];
          },
        ];
      };
      content_changes: {
        Row: {
          applied_at: string | null;
          batch_id: string | null;
          change_type: string;
          confidence: number;
          content_id: string;
          content_name: string | null;
          content_type: string;
          created_at: string | null;
          field_name: string;
          id: string;
          metadata: Json | null;
          module_id: string;
          new_value: Json;
          old_value: Json | null;
          reasoning: string | null;
          reverted_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          rule_id: string | null;
          status: string;
          workflow_run_id: string | null;
        };
        Insert: {
          applied_at?: string | null;
          batch_id?: string | null;
          change_type: string;
          confidence: number;
          content_id: string;
          content_name?: string | null;
          content_type: string;
          created_at?: string | null;
          field_name: string;
          id?: string;
          metadata?: Json | null;
          module_id: string;
          new_value: Json;
          old_value?: Json | null;
          reasoning?: string | null;
          reverted_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          rule_id?: string | null;
          status?: string;
          workflow_run_id?: string | null;
        };
        Update: {
          applied_at?: string | null;
          batch_id?: string | null;
          change_type?: string;
          confidence?: number;
          content_id?: string;
          content_name?: string | null;
          content_type?: string;
          created_at?: string | null;
          field_name?: string;
          id?: string;
          metadata?: Json | null;
          module_id?: string;
          new_value?: Json;
          old_value?: Json | null;
          reasoning?: string | null;
          reverted_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          rule_id?: string | null;
          status?: string;
          workflow_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'content_changes_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'automation_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_changes_rule_id_fkey';
            columns: ['rule_id'];
            isOneToOne: false;
            referencedRelation: 'automation_rules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_changes_workflow_run_id_fkey';
            columns: ['workflow_run_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      content_embeddings: {
        Row: {
          content_id: string;
          content_text: string;
          content_type: string;
          created_at: string;
          embedding: string | null;
          id: string;
          metadata: Json | null;
          updated_at: string;
        };
        Insert: {
          content_id: string;
          content_text: string;
          content_type: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          metadata?: Json | null;
          updated_at?: string;
        };
        Update: {
          content_id?: string;
          content_text?: string;
          content_type?: string;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          metadata?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      content_links: {
        Row: {
          auto_removed_at: string | null;
          check_count: number;
          cleaned_url: string | null;
          content_id: string;
          content_type: string;
          created_at: string;
          field_name: string;
          final_url: string | null;
          http_status: number | null;
          id: string;
          is_scraped_source: boolean | null;
          is_social: boolean | null;
          last_checked_at: string | null;
          original_url: string;
          scan_brands: string[] | null;
          scan_categories: string[] | null;
          scan_id: string | null;
          scan_score: number | null;
          scan_screenshot_url: string | null;
          scan_verdict: string | null;
          scanned_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          auto_removed_at?: string | null;
          check_count?: number;
          cleaned_url?: string | null;
          content_id: string;
          content_type: string;
          created_at?: string;
          field_name: string;
          final_url?: string | null;
          http_status?: number | null;
          id?: string;
          is_scraped_source?: boolean | null;
          is_social?: boolean | null;
          last_checked_at?: string | null;
          original_url: string;
          scan_brands?: string[] | null;
          scan_categories?: string[] | null;
          scan_id?: string | null;
          scan_score?: number | null;
          scan_screenshot_url?: string | null;
          scan_verdict?: string | null;
          scanned_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          auto_removed_at?: string | null;
          check_count?: number;
          cleaned_url?: string | null;
          content_id?: string;
          content_type?: string;
          created_at?: string;
          field_name?: string;
          final_url?: string | null;
          http_status?: number | null;
          id?: string;
          is_scraped_source?: boolean | null;
          is_social?: boolean | null;
          last_checked_at?: string | null;
          original_url?: string;
          scan_brands?: string[] | null;
          scan_categories?: string[] | null;
          scan_id?: string | null;
          scan_score?: number | null;
          scan_screenshot_url?: string | null;
          scan_verdict?: string | null;
          scanned_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      continents: {
        Row: {
          code: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          id: string;
          is_admin: boolean | null;
          is_muted: boolean | null;
          joined_at: string;
          last_read_at: string | null;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          id?: string;
          is_admin?: boolean | null;
          is_muted?: boolean | null;
          joined_at?: string;
          last_read_at?: string | null;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          id?: string;
          is_admin?: boolean | null;
          is_muted?: boolean | null;
          joined_at?: string;
          last_read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_participants_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_participants_user_id_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'conversation_participants_user_id_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'conversation_participants_user_id_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'fk_conversation_participants_user_id';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'fk_conversation_participants_user_id';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'fk_conversation_participants_user_id';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      conversations: {
        Row: {
          conversation_type: string | null;
          created_at: string;
          description: string | null;
          id: string;
          last_message_at: string | null;
          last_message_id: string | null;
          participants_count: number | null;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          conversation_type?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          last_message_at?: string | null;
          last_message_id?: string | null;
          participants_count?: number | null;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          conversation_type?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          last_message_at?: string | null;
          last_message_id?: string | null;
          participants_count?: number | null;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_last_message_id_fkey';
            columns: ['last_message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
        ];
      };
      countries: {
        Row: {
          airport_codes: string[] | null;
          area_km2: number | null;
          calling_code: string | null;
          capital: string | null;
          capital_coordinates: Json | null;
          climate_zones: string[] | null;
          code: string;
          continent_id: string;
          created_at: string;
          currency: string | null;
          description: string | null;
          driving_side: string | null;
          equality_score: number | null;
          exports: string[] | null;
          flag_emoji: string | null;
          gdp_per_capita_usd: number | null;
          gdp_usd: number | null;
          government_type: string | null;
          human_development_index: number | null;
          id: string;
          image_url: string | null;
          imports: string[] | null;
          internet_tld: string | null;
          languages: string[] | null;
          latitude: number | null;
          lgbt_legal_status: string | null;
          lgbt_rights_status: string | null;
          lgbti_adoption_rights: string | null;
          lgbti_association_restrictions: Json | null;
          lgbti_bullying_protection: Json | null;
          lgbti_constitutional_protection: Json | null;
          lgbti_conversion_therapy_regulation: string | null;
          lgbti_criminalization: Json | null;
          lgbti_data_last_updated: string | null;
          lgbti_education_protection: Json | null;
          lgbti_employment_protection: Json | null;
          lgbti_expression_restrictions: Json | null;
          lgbti_gender_recognition: Json | null;
          lgbti_goods_services_protection: Json | null;
          lgbti_hate_crime_law: Json | null;
          lgbti_health_protection: Json | null;
          lgbti_housing_protection: Json | null;
          lgbti_incitement_prohibition: Json | null;
          lgbti_intersex_protection: string | null;
          lgbti_same_sex_unions: string | null;
          life_expectancy: number | null;
          literacy_rate: number | null;
          longitude: number | null;
          major_airports: string[] | null;
          major_industries: string[] | null;
          major_religions: string[] | null;
          name: string;
          national_anthem: string | null;
          national_day: string | null;
          national_symbols: Json | null;
          natural_resources: string[] | null;
          population: number | null;
          region_id: string | null;
          timezone: string | null;
          unesco_sites: string[] | null;
          updated_at: string;
          visa_requirements: Json | null;
        };
        Insert: {
          airport_codes?: string[] | null;
          area_km2?: number | null;
          calling_code?: string | null;
          capital?: string | null;
          capital_coordinates?: Json | null;
          climate_zones?: string[] | null;
          code: string;
          continent_id: string;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          driving_side?: string | null;
          equality_score?: number | null;
          exports?: string[] | null;
          flag_emoji?: string | null;
          gdp_per_capita_usd?: number | null;
          gdp_usd?: number | null;
          government_type?: string | null;
          human_development_index?: number | null;
          id?: string;
          image_url?: string | null;
          imports?: string[] | null;
          internet_tld?: string | null;
          languages?: string[] | null;
          latitude?: number | null;
          lgbt_legal_status?: string | null;
          lgbt_rights_status?: string | null;
          lgbti_adoption_rights?: string | null;
          lgbti_association_restrictions?: Json | null;
          lgbti_bullying_protection?: Json | null;
          lgbti_constitutional_protection?: Json | null;
          lgbti_conversion_therapy_regulation?: string | null;
          lgbti_criminalization?: Json | null;
          lgbti_data_last_updated?: string | null;
          lgbti_education_protection?: Json | null;
          lgbti_employment_protection?: Json | null;
          lgbti_expression_restrictions?: Json | null;
          lgbti_gender_recognition?: Json | null;
          lgbti_goods_services_protection?: Json | null;
          lgbti_hate_crime_law?: Json | null;
          lgbti_health_protection?: Json | null;
          lgbti_housing_protection?: Json | null;
          lgbti_incitement_prohibition?: Json | null;
          lgbti_intersex_protection?: string | null;
          lgbti_same_sex_unions?: string | null;
          life_expectancy?: number | null;
          literacy_rate?: number | null;
          longitude?: number | null;
          major_airports?: string[] | null;
          major_industries?: string[] | null;
          major_religions?: string[] | null;
          name: string;
          national_anthem?: string | null;
          national_day?: string | null;
          national_symbols?: Json | null;
          natural_resources?: string[] | null;
          population?: number | null;
          region_id?: string | null;
          timezone?: string | null;
          unesco_sites?: string[] | null;
          updated_at?: string;
          visa_requirements?: Json | null;
        };
        Update: {
          airport_codes?: string[] | null;
          area_km2?: number | null;
          calling_code?: string | null;
          capital?: string | null;
          capital_coordinates?: Json | null;
          climate_zones?: string[] | null;
          code?: string;
          continent_id?: string;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          driving_side?: string | null;
          equality_score?: number | null;
          exports?: string[] | null;
          flag_emoji?: string | null;
          gdp_per_capita_usd?: number | null;
          gdp_usd?: number | null;
          government_type?: string | null;
          human_development_index?: number | null;
          id?: string;
          image_url?: string | null;
          imports?: string[] | null;
          internet_tld?: string | null;
          languages?: string[] | null;
          latitude?: number | null;
          lgbt_legal_status?: string | null;
          lgbt_rights_status?: string | null;
          lgbti_adoption_rights?: string | null;
          lgbti_association_restrictions?: Json | null;
          lgbti_bullying_protection?: Json | null;
          lgbti_constitutional_protection?: Json | null;
          lgbti_conversion_therapy_regulation?: string | null;
          lgbti_criminalization?: Json | null;
          lgbti_data_last_updated?: string | null;
          lgbti_education_protection?: Json | null;
          lgbti_employment_protection?: Json | null;
          lgbti_expression_restrictions?: Json | null;
          lgbti_gender_recognition?: Json | null;
          lgbti_goods_services_protection?: Json | null;
          lgbti_hate_crime_law?: Json | null;
          lgbti_health_protection?: Json | null;
          lgbti_housing_protection?: Json | null;
          lgbti_incitement_prohibition?: Json | null;
          lgbti_intersex_protection?: string | null;
          lgbti_same_sex_unions?: string | null;
          life_expectancy?: number | null;
          literacy_rate?: number | null;
          longitude?: number | null;
          major_airports?: string[] | null;
          major_industries?: string[] | null;
          major_religions?: string[] | null;
          name?: string;
          national_anthem?: string | null;
          national_day?: string | null;
          national_symbols?: Json | null;
          natural_resources?: string[] | null;
          population?: number | null;
          region_id?: string | null;
          timezone?: string | null;
          unesco_sites?: string[] | null;
          updated_at?: string;
          visa_requirements?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'countries_continent_id_fkey';
            columns: ['continent_id'];
            isOneToOne: false;
            referencedRelation: 'continents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'countries_region_id_fkey';
            columns: ['region_id'];
            isOneToOne: false;
            referencedRelation: 'regions';
            referencedColumns: ['id'];
          },
        ];
      };
      country_favorites: {
        Row: {
          country_id: string;
          created_at: string | null;
          id: string;
          user_id: string;
        };
        Insert: {
          country_id: string;
          created_at?: string | null;
          id?: string;
          user_id: string;
        };
        Update: {
          country_id?: string;
          created_at?: string | null;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      crawl_jobs: {
        Row: {
          created_at: string;
          credits_used: number | null;
          expires_at: string | null;
          id: string;
          pages_crawled: number | null;
          result_data: Json | null;
          status: string;
          total_pages: number | null;
          updated_at: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          credits_used?: number | null;
          expires_at?: string | null;
          id?: string;
          pages_crawled?: number | null;
          result_data?: Json | null;
          status?: string;
          total_pages?: number | null;
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          credits_used?: number | null;
          expires_at?: string | null;
          id?: string;
          pages_crawled?: number | null;
          result_data?: Json | null;
          status?: string;
          total_pages?: number | null;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      cron_job_logs: {
        Row: {
          created_at: string | null;
          error_details: string | null;
          id: string;
          job_name: string;
          message: string | null;
          status: string;
        };
        Insert: {
          created_at?: string | null;
          error_details?: string | null;
          id?: string;
          job_name: string;
          message?: string | null;
          status: string;
        };
        Update: {
          created_at?: string | null;
          error_details?: string | null;
          id?: string;
          job_name?: string;
          message?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      currencies: {
        Row: {
          code: string;
          id: string;
          name: string;
          symbol: string | null;
        };
        Insert: {
          code: string;
          id?: string;
          name: string;
          symbol?: string | null;
        };
        Update: {
          code?: string;
          id?: string;
          name?: string;
          symbol?: string | null;
        };
        Relationships: [];
      };
      donations: {
        Row: {
          amount: number;
          amount_encrypted: string | null;
          created_at: string;
          currency: string | null;
          donor_info_encrypted: string | null;
          donor_name: string | null;
          email: string;
          id: string;
          is_anonymous: boolean | null;
          message: string | null;
          payment_method_encrypted: string | null;
          status: string | null;
          stripe_session_id: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          amount: number;
          amount_encrypted?: string | null;
          created_at?: string;
          currency?: string | null;
          donor_info_encrypted?: string | null;
          donor_name?: string | null;
          email: string;
          id?: string;
          is_anonymous?: boolean | null;
          message?: string | null;
          payment_method_encrypted?: string | null;
          status?: string | null;
          stripe_session_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          amount?: number;
          amount_encrypted?: string | null;
          created_at?: string;
          currency?: string | null;
          donor_info_encrypted?: string | null;
          donor_name?: string | null;
          email?: string;
          id?: string;
          is_anonymous?: boolean | null;
          message?: string | null;
          payment_method_encrypted?: string | null;
          status?: string | null;
          stripe_session_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      email_ingestions: {
        Row: {
          ai_extraction: Json | null;
          body_html: string | null;
          body_text: string | null;
          created_at: string;
          error_message: string | null;
          extracted_events: number;
          extracted_venues: number;
          from_address: string;
          id: string;
          inserted_event_ids: string[];
          inserted_venue_ids: string[];
          processing_ms: number | null;
          received_at: string;
          status: string;
          subject: string;
          to_address: string;
        };
        Insert: {
          ai_extraction?: Json | null;
          body_html?: string | null;
          body_text?: string | null;
          created_at?: string;
          error_message?: string | null;
          extracted_events?: number;
          extracted_venues?: number;
          from_address: string;
          id?: string;
          inserted_event_ids?: string[];
          inserted_venue_ids?: string[];
          processing_ms?: number | null;
          received_at?: string;
          status?: string;
          subject?: string;
          to_address?: string;
        };
        Update: {
          ai_extraction?: Json | null;
          body_html?: string | null;
          body_text?: string | null;
          created_at?: string;
          error_message?: string | null;
          extracted_events?: number;
          extracted_venues?: number;
          from_address?: string;
          id?: string;
          inserted_event_ids?: string[];
          inserted_venue_ids?: string[];
          processing_ms?: number | null;
          received_at?: string;
          status?: string;
          subject?: string;
          to_address?: string;
        };
        Relationships: [];
      };
      email_templates: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          html_content: string;
          id: string;
          is_active: boolean;
          name: string;
          subject: string;
          template_key: string;
          text_content: string | null;
          updated_at: string;
          updated_by: string | null;
          variables: Json | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          html_content: string;
          id?: string;
          is_active?: boolean;
          name: string;
          subject: string;
          template_key: string;
          text_content?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          variables?: Json | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          html_content?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          subject?: string;
          template_key?: string;
          text_content?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          variables?: Json | null;
        };
        Relationships: [];
      };
      entity_attribute_assignments: {
        Row: {
          attribute_id: string;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
        };
        Insert: {
          attribute_id: string;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
        };
        Update: {
          attribute_id?: string;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_attribute_assignments_attribute_id_fkey';
            columns: ['attribute_id'];
            isOneToOne: false;
            referencedRelation: 'attributes';
            referencedColumns: ['id'];
          },
        ];
      };
      event_amenities: {
        Row: {
          category: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_attendees: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          status: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          status?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          status?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_attendees_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_attendees_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_attendees_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'event_attendees_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'event_attendees_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      event_categories: {
        Row: {
          id: string;
          name: string;
        };
        Insert: {
          id?: string;
          name: string;
        };
        Update: {
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      event_favorites: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      event_services: {
        Row: {
          category: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      event_types: {
        Row: {
          color: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          accessibility_attributes: string[] | null;
          accessibility_notes: string | null;
          address: string | null;
          age_restriction: string | null;
          city: string;
          city_id: string | null;
          country: string;
          country_id: string | null;
          created_at: string;
          created_by: string | null;
          data_source: string | null;
          description: string | null;
          end_date: string | null;
          event_type: string;
          featured: boolean | null;
          festival_id: string | null;
          geo_linked_at: string | null;
          group_id: string | null;
          id: string;
          images: string[] | null;
          is_free: boolean | null;
          is_public: boolean;
          is_recurring: boolean | null;
          latitude: number | null;
          longitude: number | null;
          max_attendees: number | null;
          organizer_contact: string | null;
          organizer_name: string | null;
          price_max: number | null;
          price_min: number | null;
          queer_village_id: string | null;
          recurrence_pattern: string | null;
          start_date: string;
          state: string | null;
          status: string | null;
          target_groups: string[] | null;
          ticket_url: string | null;
          timezone: string | null;
          title: string;
          updated_at: string;
          venue_id: string | null;
          venue_name: string | null;
          website: string | null;
        };
        Insert: {
          accessibility_attributes?: string[] | null;
          accessibility_notes?: string | null;
          address?: string | null;
          age_restriction?: string | null;
          city: string;
          city_id?: string | null;
          country?: string;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_source?: string | null;
          description?: string | null;
          end_date?: string | null;
          event_type: string;
          featured?: boolean | null;
          festival_id?: string | null;
          geo_linked_at?: string | null;
          group_id?: string | null;
          id?: string;
          images?: string[] | null;
          is_free?: boolean | null;
          is_public?: boolean;
          is_recurring?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          max_attendees?: number | null;
          organizer_contact?: string | null;
          organizer_name?: string | null;
          price_max?: number | null;
          price_min?: number | null;
          queer_village_id?: string | null;
          recurrence_pattern?: string | null;
          start_date: string;
          state?: string | null;
          status?: string | null;
          target_groups?: string[] | null;
          ticket_url?: string | null;
          timezone?: string | null;
          title: string;
          updated_at?: string;
          venue_id?: string | null;
          venue_name?: string | null;
          website?: string | null;
        };
        Update: {
          accessibility_attributes?: string[] | null;
          accessibility_notes?: string | null;
          address?: string | null;
          age_restriction?: string | null;
          city?: string;
          city_id?: string | null;
          country?: string;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_source?: string | null;
          description?: string | null;
          end_date?: string | null;
          event_type?: string;
          featured?: boolean | null;
          festival_id?: string | null;
          geo_linked_at?: string | null;
          group_id?: string | null;
          id?: string;
          images?: string[] | null;
          is_free?: boolean | null;
          is_public?: boolean;
          is_recurring?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          max_attendees?: number | null;
          organizer_contact?: string | null;
          organizer_name?: string | null;
          price_max?: number | null;
          price_min?: number | null;
          queer_village_id?: string | null;
          recurrence_pattern?: string | null;
          start_date?: string;
          state?: string | null;
          status?: string | null;
          target_groups?: string[] | null;
          ticket_url?: string | null;
          timezone?: string | null;
          title?: string;
          updated_at?: string;
          venue_id?: string | null;
          venue_name?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'events_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_country_id_fkey';
            columns: ['country_id'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'events_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'events_festival_id_fkey';
            columns: ['festival_id'];
            isOneToOne: false;
            referencedRelation: 'festivals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'community_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_queer_village_id_fkey';
            columns: ['queer_village_id'];
            isOneToOne: false;
            referencedRelation: 'queer_villages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      failed_login_attempts: {
        Row: {
          attempt_type: string;
          blocked_until: string | null;
          created_at: string;
          id: string;
          identifier: string;
          ip_address: unknown;
          user_agent: string | null;
        };
        Insert: {
          attempt_type?: string;
          blocked_until?: string | null;
          created_at?: string;
          id?: string;
          identifier: string;
          ip_address: unknown;
          user_agent?: string | null;
        };
        Update: {
          attempt_type?: string;
          blocked_until?: string | null;
          created_at?: string;
          id?: string;
          identifier?: string;
          ip_address?: unknown;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      festivals: {
        Row: {
          city: string | null;
          city_id: string | null;
          country: string | null;
          country_id: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          end_date: string | null;
          featured: boolean | null;
          festival_type: string;
          id: string;
          images: string[] | null;
          is_recurring: boolean | null;
          latitude: number | null;
          longitude: number | null;
          name: string;
          recurrence_pattern: string | null;
          slug: string | null;
          start_date: string | null;
          tags: string[] | null;
          ticket_url: string | null;
          timezone: string | null;
          updated_at: string;
          updated_by: string | null;
          venue_id: string | null;
          website: string | null;
        };
        Insert: {
          city?: string | null;
          city_id?: string | null;
          country?: string | null;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          end_date?: string | null;
          featured?: boolean | null;
          festival_type?: string;
          id?: string;
          images?: string[] | null;
          is_recurring?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          recurrence_pattern?: string | null;
          slug?: string | null;
          start_date?: string | null;
          tags?: string[] | null;
          ticket_url?: string | null;
          timezone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          venue_id?: string | null;
          website?: string | null;
        };
        Update: {
          city?: string | null;
          city_id?: string | null;
          country?: string | null;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          end_date?: string | null;
          featured?: boolean | null;
          festival_type?: string;
          id?: string;
          images?: string[] | null;
          is_recurring?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          recurrence_pattern?: string | null;
          slug?: string | null;
          start_date?: string | null;
          tags?: string[] | null;
          ticket_url?: string | null;
          timezone?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          venue_id?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'festivals_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'festivals_country_id_fkey';
            columns: ['country_id'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'festivals_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      flyer_scans: {
        Row: {
          created_at: string;
          detected_type: string;
          duplicate_event_id: string | null;
          id: string;
          image_url: string;
          matched_city_id: string | null;
          matched_country_id: string | null;
          matched_venue_id: string | null;
          model_used: string;
          processing_time_ms: number | null;
          raw_extraction: Json;
          status: string;
          submission_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          detected_type?: string;
          duplicate_event_id?: string | null;
          id?: string;
          image_url: string;
          matched_city_id?: string | null;
          matched_country_id?: string | null;
          matched_venue_id?: string | null;
          model_used?: string;
          processing_time_ms?: number | null;
          raw_extraction?: Json;
          status?: string;
          submission_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          detected_type?: string;
          duplicate_event_id?: string | null;
          id?: string;
          image_url?: string;
          matched_city_id?: string | null;
          matched_country_id?: string | null;
          matched_venue_id?: string | null;
          model_used?: string;
          processing_time_ms?: number | null;
          raw_extraction?: Json;
          status?: string;
          submission_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'flyer_scans_duplicate_event_id_fkey';
            columns: ['duplicate_event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'flyer_scans_duplicate_event_id_fkey';
            columns: ['duplicate_event_id'];
            isOneToOne: false;
            referencedRelation: 'events_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'flyer_scans_matched_city_id_fkey';
            columns: ['matched_city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'flyer_scans_matched_country_id_fkey';
            columns: ['matched_country_id'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'flyer_scans_matched_venue_id_fkey';
            columns: ['matched_venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      geo_link_log: {
        Row: {
          created_at: string;
          details: Json | null;
          entity_type: string;
          id: string;
          total_linked: number;
          total_processed: number;
          total_skipped: number;
        };
        Insert: {
          created_at?: string;
          details?: Json | null;
          entity_type: string;
          id?: string;
          total_linked?: number;
          total_processed?: number;
          total_skipped?: number;
        };
        Update: {
          created_at?: string;
          details?: Json | null;
          entity_type?: string;
          id?: string;
          total_linked?: number;
          total_processed?: number;
          total_skipped?: number;
        };
        Relationships: [];
      };
      group_comment_likes: {
        Row: {
          comment_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_comment_likes_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'group_post_comments';
            referencedColumns: ['id'];
          },
        ];
      };
      group_memberships: {
        Row: {
          group_id: string;
          id: string;
          joined_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          group_id: string;
          id?: string;
          joined_at?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          group_id?: string;
          id?: string;
          joined_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_memberships_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'community_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      group_notifications: {
        Row: {
          content: string | null;
          created_at: string;
          group_id: string;
          id: string;
          notification_type: string;
          read_at: string | null;
          related_comment_id: string | null;
          related_post_id: string | null;
          triggered_by_user_id: string;
          user_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          group_id: string;
          id?: string;
          notification_type: string;
          read_at?: string | null;
          related_comment_id?: string | null;
          related_post_id?: string | null;
          triggered_by_user_id: string;
          user_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          group_id?: string;
          id?: string;
          notification_type?: string;
          read_at?: string | null;
          related_comment_id?: string | null;
          related_post_id?: string | null;
          triggered_by_user_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_notifications_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'community_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_notifications_related_comment_id_fkey';
            columns: ['related_comment_id'];
            isOneToOne: false;
            referencedRelation: 'group_post_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_notifications_related_post_id_fkey';
            columns: ['related_post_id'];
            isOneToOne: false;
            referencedRelation: 'group_posts';
            referencedColumns: ['id'];
          },
        ];
      };
      group_poll_votes: {
        Row: {
          created_at: string;
          id: string;
          option_index: number;
          post_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          option_index: number;
          post_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          option_index?: number;
          post_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_poll_votes_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'group_posts';
            referencedColumns: ['id'];
          },
        ];
      };
      group_post_comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          likes_count: number;
          mentions: Json | null;
          parent_comment_id: string | null;
          post_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          likes_count?: number;
          mentions?: Json | null;
          parent_comment_id?: string | null;
          post_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          likes_count?: number;
          mentions?: Json | null;
          parent_comment_id?: string | null;
          post_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_post_comments_parent_comment_id_fkey';
            columns: ['parent_comment_id'];
            isOneToOne: false;
            referencedRelation: 'group_post_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_post_comments_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'group_posts';
            referencedColumns: ['id'];
          },
        ];
      };
      group_post_likes: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_post_likes_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'group_posts';
            referencedColumns: ['id'];
          },
        ];
      };
      group_posts: {
        Row: {
          comments_count: number;
          content: string;
          created_at: string;
          group_id: string;
          id: string;
          images: string[] | null;
          is_pinned: boolean;
          likes_count: number;
          mentions: Json | null;
          poll_data: Json | null;
          post_type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          comments_count?: number;
          content: string;
          created_at?: string;
          group_id: string;
          id?: string;
          images?: string[] | null;
          is_pinned?: boolean;
          likes_count?: number;
          mentions?: Json | null;
          poll_data?: Json | null;
          post_type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          comments_count?: number;
          content?: string;
          created_at?: string;
          group_id?: string;
          id?: string;
          images?: string[] | null;
          is_pinned?: boolean;
          likes_count?: number;
          mentions?: Json | null;
          poll_data?: Json | null;
          post_type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_posts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'community_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      hotels: {
        Row: {
          address: string | null;
          amenities: string[] | null;
          booking_url: string | null;
          city: string | null;
          city_id: string | null;
          country: string | null;
          country_id: string | null;
          created_at: string;
          created_by: string | null;
          data_source: string | null;
          description: string | null;
          email: string | null;
          external_id: string | null;
          featured: boolean | null;
          geo_linked_at: string | null;
          hotel_type: string;
          id: string;
          images: string[] | null;
          latitude: number | null;
          lgbtq_friendly: boolean | null;
          longitude: number | null;
          name: string;
          phone: string | null;
          price_range: number | null;
          queer_safety_notes: string | null;
          queer_village_id: string | null;
          slug: string | null;
          star_rating: number | null;
          tags: string[] | null;
          updated_at: string;
          updated_by: string | null;
          verified: boolean | null;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          amenities?: string[] | null;
          booking_url?: string | null;
          city?: string | null;
          city_id?: string | null;
          country?: string | null;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_source?: string | null;
          description?: string | null;
          email?: string | null;
          external_id?: string | null;
          featured?: boolean | null;
          geo_linked_at?: string | null;
          hotel_type?: string;
          id?: string;
          images?: string[] | null;
          latitude?: number | null;
          lgbtq_friendly?: boolean | null;
          longitude?: number | null;
          name: string;
          phone?: string | null;
          price_range?: number | null;
          queer_safety_notes?: string | null;
          queer_village_id?: string | null;
          slug?: string | null;
          star_rating?: number | null;
          tags?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
          verified?: boolean | null;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          amenities?: string[] | null;
          booking_url?: string | null;
          city?: string | null;
          city_id?: string | null;
          country?: string | null;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_source?: string | null;
          description?: string | null;
          email?: string | null;
          external_id?: string | null;
          featured?: boolean | null;
          geo_linked_at?: string | null;
          hotel_type?: string;
          id?: string;
          images?: string[] | null;
          latitude?: number | null;
          lgbtq_friendly?: boolean | null;
          longitude?: number | null;
          name?: string;
          phone?: string | null;
          price_range?: number | null;
          queer_safety_notes?: string | null;
          queer_village_id?: string | null;
          slug?: string | null;
          star_rating?: number | null;
          tags?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
          verified?: boolean | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'hotels_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'hotels_country_id_fkey';
            columns: ['country_id'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'hotels_queer_village_id_fkey';
            columns: ['queer_village_id'];
            isOneToOne: false;
            referencedRelation: 'queer_villages';
            referencedColumns: ['id'];
          },
        ];
      };
      image_optimization_jobs: {
        Row: {
          created_at: string;
          failed_images: number;
          id: string;
          processed_images: number;
          results: Json | null;
          settings: Json | null;
          status: string;
          successful_images: number;
          total_images: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          failed_images?: number;
          id?: string;
          processed_images?: number;
          results?: Json | null;
          settings?: Json | null;
          status?: string;
          successful_images?: number;
          total_images?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          failed_images?: number;
          id?: string;
          processed_images?: number;
          results?: Json | null;
          settings?: Json | null;
          status?: string;
          successful_images?: number;
          total_images?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      import_audit_log: {
        Row: {
          action: string;
          created_at: string | null;
          details: Json | null;
          id: string;
          import_job_id: string | null;
          ip_address: unknown;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string | null;
          details?: Json | null;
          id?: string;
          import_job_id?: string | null;
          ip_address?: unknown;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string | null;
          details?: Json | null;
          id?: string;
          import_job_id?: string | null;
          ip_address?: unknown;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'import_audit_log_import_job_id_fkey';
            columns: ['import_job_id'];
            isOneToOne: false;
            referencedRelation: 'import_jobs_enhanced';
            referencedColumns: ['id'];
          },
        ];
      };
      import_jobs: {
        Row: {
          batch_size: number;
          created_at: string;
          current_batch: number;
          data: Json;
          duplicate_items: number | null;
          error_details: string | null;
          failed_items: number | null;
          id: string;
          import_config: Json | null;
          max_retries: number;
          message: string;
          processed_items: number;
          progress: number;
          retry_count: number;
          status: string;
          successful_items: number | null;
          total_batches: number;
          total_items: number;
          type: string;
          updated_at: string;
        };
        Insert: {
          batch_size?: number;
          created_at?: string;
          current_batch?: number;
          data?: Json;
          duplicate_items?: number | null;
          error_details?: string | null;
          failed_items?: number | null;
          id?: string;
          import_config?: Json | null;
          max_retries?: number;
          message?: string;
          processed_items?: number;
          progress?: number;
          retry_count?: number;
          status?: string;
          successful_items?: number | null;
          total_batches?: number;
          total_items?: number;
          type: string;
          updated_at?: string;
        };
        Update: {
          batch_size?: number;
          created_at?: string;
          current_batch?: number;
          data?: Json;
          duplicate_items?: number | null;
          error_details?: string | null;
          failed_items?: number | null;
          id?: string;
          import_config?: Json | null;
          max_retries?: number;
          message?: string;
          processed_items?: number;
          progress?: number;
          retry_count?: number;
          status?: string;
          successful_items?: number | null;
          total_batches?: number;
          total_items?: number;
          type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      import_jobs_enhanced: {
        Row: {
          ai_cost_usd: number | null;
          api_endpoint: string | null;
          completed_at: string | null;
          created_at: string | null;
          cursor_state: Json | null;
          duplicate_records: number | null;
          duplicate_strategy: string;
          error_report: Json | null;
          failed_records: number | null;
          file_hash: string | null;
          file_name: string | null;
          file_size: number | null;
          filters: Json;
          id: string;
          import_summary: Json | null;
          invalid_records: number | null;
          ip_address: unknown;
          items_ai_approved: number | null;
          items_ai_rejected: number | null;
          items_committed: number | null;
          items_deduplicated: number | null;
          items_fetched: number | null;
          items_needs_review: number | null;
          phase: string;
          pipeline_stage: string | null;
          processed_records: number | null;
          progress_percentage: number | null;
          source_data: Json | null;
          source_id: string | null;
          source_type: string;
          started_at: string | null;
          status: string;
          successful_records: number | null;
          total_records: number | null;
          type: string;
          unique_key_fields: string[];
          updated_at: string | null;
          user_agent: string | null;
          user_id: string;
          valid_records: number | null;
          validation_report: Json | null;
          validation_rules: Json;
        };
        Insert: {
          ai_cost_usd?: number | null;
          api_endpoint?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          cursor_state?: Json | null;
          duplicate_records?: number | null;
          duplicate_strategy?: string;
          error_report?: Json | null;
          failed_records?: number | null;
          file_hash?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          filters?: Json;
          id?: string;
          import_summary?: Json | null;
          invalid_records?: number | null;
          ip_address?: unknown;
          items_ai_approved?: number | null;
          items_ai_rejected?: number | null;
          items_committed?: number | null;
          items_deduplicated?: number | null;
          items_fetched?: number | null;
          items_needs_review?: number | null;
          phase?: string;
          pipeline_stage?: string | null;
          processed_records?: number | null;
          progress_percentage?: number | null;
          source_data?: Json | null;
          source_id?: string | null;
          source_type: string;
          started_at?: string | null;
          status?: string;
          successful_records?: number | null;
          total_records?: number | null;
          type: string;
          unique_key_fields?: string[];
          updated_at?: string | null;
          user_agent?: string | null;
          user_id: string;
          valid_records?: number | null;
          validation_report?: Json | null;
          validation_rules?: Json;
        };
        Update: {
          ai_cost_usd?: number | null;
          api_endpoint?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          cursor_state?: Json | null;
          duplicate_records?: number | null;
          duplicate_strategy?: string;
          error_report?: Json | null;
          failed_records?: number | null;
          file_hash?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          filters?: Json;
          id?: string;
          import_summary?: Json | null;
          invalid_records?: number | null;
          ip_address?: unknown;
          items_ai_approved?: number | null;
          items_ai_rejected?: number | null;
          items_committed?: number | null;
          items_deduplicated?: number | null;
          items_fetched?: number | null;
          items_needs_review?: number | null;
          phase?: string;
          pipeline_stage?: string | null;
          processed_records?: number | null;
          progress_percentage?: number | null;
          source_data?: Json | null;
          source_id?: string | null;
          source_type?: string;
          started_at?: string | null;
          status?: string;
          successful_records?: number | null;
          total_records?: number | null;
          type?: string;
          unique_key_fields?: string[];
          updated_at?: string | null;
          user_agent?: string | null;
          user_id?: string;
          valid_records?: number | null;
          validation_report?: Json | null;
          validation_rules?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'import_jobs_enhanced_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'ingestion_sources';
            referencedColumns: ['id'];
          },
        ];
      };
      import_validation_results: {
        Row: {
          created_at: string | null;
          id: string;
          import_job_id: string;
          is_valid: boolean;
          record_data: Json;
          record_index: number;
          validation_errors: Json | null;
          validation_warnings: Json | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          import_job_id: string;
          is_valid?: boolean;
          record_data: Json;
          record_index: number;
          validation_errors?: Json | null;
          validation_warnings?: Json | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          import_job_id?: string;
          is_valid?: boolean;
          record_data?: Json;
          record_index?: number;
          validation_errors?: Json | null;
          validation_warnings?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'import_validation_results_import_job_id_fkey';
            columns: ['import_job_id'];
            isOneToOne: false;
            referencedRelation: 'import_jobs_enhanced';
            referencedColumns: ['id'];
          },
        ];
      };
      ingestion_sources: {
        Row: {
          config: Json;
          created_at: string;
          edge_function: string;
          id: string;
          is_enabled: boolean;
          last_error: string | null;
          last_rate_reset_at: string | null;
          last_run_at: string | null;
          last_success_at: string | null;
          name: string;
          rate_limit_per_day: number | null;
          rate_limit_per_minute: number | null;
          requests_today: number | null;
          requires_api_key: string | null;
          schedule: string | null;
          slug: string;
          source_type: string;
          target_table: string;
          total_items_approved: number | null;
          total_items_fetched: number | null;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          edge_function: string;
          id?: string;
          is_enabled?: boolean;
          last_error?: string | null;
          last_rate_reset_at?: string | null;
          last_run_at?: string | null;
          last_success_at?: string | null;
          name: string;
          rate_limit_per_day?: number | null;
          rate_limit_per_minute?: number | null;
          requests_today?: number | null;
          requires_api_key?: string | null;
          schedule?: string | null;
          slug: string;
          source_type: string;
          target_table: string;
          total_items_approved?: number | null;
          total_items_fetched?: number | null;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          edge_function?: string;
          id?: string;
          is_enabled?: boolean;
          last_error?: string | null;
          last_rate_reset_at?: string | null;
          last_run_at?: string | null;
          last_success_at?: string | null;
          name?: string;
          rate_limit_per_day?: number | null;
          rate_limit_per_minute?: number | null;
          requests_today?: number | null;
          requires_api_key?: string | null;
          schedule?: string | null;
          slug?: string;
          source_type?: string;
          target_table?: string;
          total_items_approved?: number | null;
          total_items_fetched?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ingestion_staging: {
        Row: {
          ai_confidence_score: number | null;
          ai_validated_at: string | null;
          ai_validation_result: Json | null;
          ai_validation_status: string;
          created_at: string;
          dedup_details: Json | null;
          dedup_match_id: string | null;
          dedup_match_score: number | null;
          dedup_match_table: string | null;
          dedup_status: string;
          disposition: string;
          enriched_data: Json | null;
          enrichment_status: string;
          error_message: string | null;
          id: string;
          job_id: string;
          normalized_data: Json | null;
          processed_at: string | null;
          raw_data: Json;
          review_notes: string | null;
          review_status: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source_type: string;
          target_record_id: string | null;
          target_table: string;
          updated_at: string;
        };
        Insert: {
          ai_confidence_score?: number | null;
          ai_validated_at?: string | null;
          ai_validation_result?: Json | null;
          ai_validation_status?: string;
          created_at?: string;
          dedup_details?: Json | null;
          dedup_match_id?: string | null;
          dedup_match_score?: number | null;
          dedup_match_table?: string | null;
          dedup_status?: string;
          disposition?: string;
          enriched_data?: Json | null;
          enrichment_status?: string;
          error_message?: string | null;
          id?: string;
          job_id: string;
          normalized_data?: Json | null;
          processed_at?: string | null;
          raw_data: Json;
          review_notes?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_type: string;
          target_record_id?: string | null;
          target_table: string;
          updated_at?: string;
        };
        Update: {
          ai_confidence_score?: number | null;
          ai_validated_at?: string | null;
          ai_validation_result?: Json | null;
          ai_validation_status?: string;
          created_at?: string;
          dedup_details?: Json | null;
          dedup_match_id?: string | null;
          dedup_match_score?: number | null;
          dedup_match_table?: string | null;
          dedup_status?: string;
          disposition?: string;
          enriched_data?: Json | null;
          enrichment_status?: string;
          error_message?: string | null;
          id?: string;
          job_id?: string;
          normalized_data?: Json | null;
          processed_at?: string | null;
          raw_data?: Json;
          review_notes?: string | null;
          review_status?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_type?: string;
          target_record_id?: string | null;
          target_table?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ingestion_staging_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'import_jobs_enhanced';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_base: {
        Row: {
          category: string;
          color: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean | null;
          metadata: Json | null;
          name: string;
          slug: string | null;
          sort_order: number | null;
          updated_at: string | null;
          usage_count: number | null;
        };
        Insert: {
          category: string;
          color?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          metadata?: Json | null;
          name: string;
          slug?: string | null;
          sort_order?: number | null;
          updated_at?: string | null;
          usage_count?: number | null;
        };
        Update: {
          category?: string;
          color?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean | null;
          metadata?: Json | null;
          name?: string;
          slug?: string | null;
          sort_order?: number | null;
          updated_at?: string | null;
          usage_count?: number | null;
        };
        Relationships: [];
      };
      languages: {
        Row: {
          id: string;
          iso_639_1_code: string | null;
          name: string;
        };
        Insert: {
          id?: string;
          iso_639_1_code?: string | null;
          name: string;
        };
        Update: {
          id?: string;
          iso_639_1_code?: string | null;
          name?: string;
        };
        Relationships: [];
      };
      mailbox_emails: {
        Row: {
          attachments: Json | null;
          bcc: string[] | null;
          body_html: string | null;
          body_text: string | null;
          cc: string[] | null;
          created_at: string;
          deleted_at: string | null;
          direction: string;
          email_date: string;
          folder: string;
          from_address: string;
          from_name: string | null;
          id: string;
          in_reply_to_email_id: string | null;
          in_reply_to_header: string | null;
          is_read: boolean;
          is_starred: boolean;
          message_id_header: string | null;
          owner_id: string;
          references_header: string[] | null;
          reply_to: string | null;
          resend_id: string | null;
          resend_status: string | null;
          snippet: string | null;
          status: string;
          subject: string;
          thread_id: string | null;
          to_address: string;
          to_name: string | null;
          updated_at: string;
        };
        Insert: {
          attachments?: Json | null;
          bcc?: string[] | null;
          body_html?: string | null;
          body_text?: string | null;
          cc?: string[] | null;
          created_at?: string;
          deleted_at?: string | null;
          direction: string;
          email_date?: string;
          folder?: string;
          from_address: string;
          from_name?: string | null;
          id?: string;
          in_reply_to_email_id?: string | null;
          in_reply_to_header?: string | null;
          is_read?: boolean;
          is_starred?: boolean;
          message_id_header?: string | null;
          owner_id: string;
          references_header?: string[] | null;
          reply_to?: string | null;
          resend_id?: string | null;
          resend_status?: string | null;
          snippet?: string | null;
          status?: string;
          subject?: string;
          thread_id?: string | null;
          to_address: string;
          to_name?: string | null;
          updated_at?: string;
        };
        Update: {
          attachments?: Json | null;
          bcc?: string[] | null;
          body_html?: string | null;
          body_text?: string | null;
          cc?: string[] | null;
          created_at?: string;
          deleted_at?: string | null;
          direction?: string;
          email_date?: string;
          folder?: string;
          from_address?: string;
          from_name?: string | null;
          id?: string;
          in_reply_to_email_id?: string | null;
          in_reply_to_header?: string | null;
          is_read?: boolean;
          is_starred?: boolean;
          message_id_header?: string | null;
          owner_id?: string;
          references_header?: string[] | null;
          reply_to?: string | null;
          resend_id?: string | null;
          resend_status?: string | null;
          snippet?: string | null;
          status?: string;
          subject?: string;
          thread_id?: string | null;
          to_address?: string;
          to_name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mailbox_emails_in_reply_to_email_id_fkey';
            columns: ['in_reply_to_email_id'];
            isOneToOne: false;
            referencedRelation: 'mailbox_emails';
            referencedColumns: ['id'];
          },
        ];
      };
      mailbox_reserved_addresses: {
        Row: {
          address: string;
          created_at: string;
          reason: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          reason?: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          reason?: string;
        };
        Relationships: [];
      };
      marketplace_categories: {
        Row: {
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'marketplace_categories_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'marketplace_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      marketplace_favorites: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          listing_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'marketplace_favorites_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'marketplace_listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'marketplace_favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'marketplace_favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      marketplace_listings: {
        Row: {
          business_name: string;
          business_type: string | null;
          category: string;
          category_id: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by: string | null;
          currency: string | null;
          description: string | null;
          featured: boolean | null;
          id: string;
          images: string[] | null;
          location: string | null;
          price: number | null;
          price_type: string | null;
          shipping_available: boolean | null;
          shipping_info: string | null;
          social_media: Json | null;
          status: string | null;
          subcategory: string | null;
          title: string;
          updated_at: string;
          venue_id: string | null;
          views_count: number | null;
          website: string | null;
        };
        Insert: {
          business_name: string;
          business_type?: string | null;
          category: string;
          category_id?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          description?: string | null;
          featured?: boolean | null;
          id?: string;
          images?: string[] | null;
          location?: string | null;
          price?: number | null;
          price_type?: string | null;
          shipping_available?: boolean | null;
          shipping_info?: string | null;
          social_media?: Json | null;
          status?: string | null;
          subcategory?: string | null;
          title: string;
          updated_at?: string;
          venue_id?: string | null;
          views_count?: number | null;
          website?: string | null;
        };
        Update: {
          business_name?: string;
          business_type?: string | null;
          category?: string;
          category_id?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string | null;
          description?: string | null;
          featured?: boolean | null;
          id?: string;
          images?: string[] | null;
          location?: string | null;
          price?: number | null;
          price_type?: string | null;
          shipping_available?: boolean | null;
          shipping_info?: string | null;
          social_media?: Json | null;
          status?: string | null;
          subcategory?: string | null;
          title?: string;
          updated_at?: string;
          venue_id?: string | null;
          views_count?: number | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'marketplace_listings_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'marketplace_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_listings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'marketplace_listings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'marketplace_listings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'marketplace_listings_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      marketplace_reviews: {
        Row: {
          content: string | null;
          created_at: string;
          helpful_count: number | null;
          id: string;
          listing_id: string;
          purchase_verified: boolean | null;
          rating: number;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          helpful_count?: number | null;
          id?: string;
          listing_id: string;
          purchase_verified?: boolean | null;
          rating: number;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          helpful_count?: number | null;
          id?: string;
          listing_id?: string;
          purchase_verified?: boolean | null;
          rating?: number;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'marketplace_reviews_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'marketplace_listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reviews_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'marketplace_reviews_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'marketplace_reviews_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      media_optimization_status: {
        Row: {
          bucket_name: string;
          compression_data: Json | null;
          created_at: string;
          file_path: string;
          id: string;
          optimization_status: string;
          optimized_at: string | null;
          optimized_formats: Json | null;
          original_format: string;
          original_size: number;
          updated_at: string;
        };
        Insert: {
          bucket_name: string;
          compression_data?: Json | null;
          created_at?: string;
          file_path: string;
          id?: string;
          optimization_status?: string;
          optimized_at?: string | null;
          optimized_formats?: Json | null;
          original_format: string;
          original_size: number;
          updated_at?: string;
        };
        Update: {
          bucket_name?: string;
          compression_data?: Json | null;
          created_at?: string;
          file_path?: string;
          id?: string;
          optimization_status?: string;
          optimized_at?: string | null;
          optimized_formats?: Json | null;
          original_format?: string;
          original_size?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      message_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          id: string;
          message_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          emoji: string;
          id?: string;
          message_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          id?: string;
          message_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_reactions_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_reactions_user_id_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'message_reactions_user_id_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'message_reactions_user_id_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      messages: {
        Row: {
          attachments: Json | null;
          content: string;
          conversation_id: string;
          created_at: string;
          edited_at: string | null;
          id: string;
          message_type: string | null;
          metadata: Json | null;
          reply_to_id: string | null;
          sender_id: string;
          updated_at: string;
        };
        Insert: {
          attachments?: Json | null;
          content: string;
          conversation_id: string;
          created_at?: string;
          edited_at?: string | null;
          id?: string;
          message_type?: string | null;
          metadata?: Json | null;
          reply_to_id?: string | null;
          sender_id: string;
          updated_at?: string;
        };
        Update: {
          attachments?: Json | null;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          edited_at?: string | null;
          id?: string;
          message_type?: string | null;
          metadata?: Json | null;
          reply_to_id?: string | null;
          sender_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_reply_to_id_fkey';
            columns: ['reply_to_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_profiles_user_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'messages_sender_id_profiles_user_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'messages_sender_id_profiles_user_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      moderation_flags: {
        Row: {
          content_id: string;
          content_type: string;
          created_at: string;
          flag_type: string;
          id: string;
          reason: string;
          reporter_ip: unknown;
          reporter_user_id: string | null;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          source: string;
          status: string;
          suggested_changes: Json | null;
          updated_at: string;
        };
        Insert: {
          content_id: string;
          content_type: string;
          created_at?: string;
          flag_type: string;
          id?: string;
          reason: string;
          reporter_ip?: unknown;
          reporter_user_id?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source?: string;
          status?: string;
          suggested_changes?: Json | null;
          updated_at?: string;
        };
        Update: {
          content_id?: string;
          content_type?: string;
          created_at?: string;
          flag_type?: string;
          id?: string;
          reason?: string;
          reporter_ip?: unknown;
          reporter_user_id?: string | null;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source?: string;
          status?: string;
          suggested_changes?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      news_article_cities: {
        Row: {
          article_id: string;
          city_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          article_id: string;
          city_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          article_id?: string;
          city_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'news_article_cities_article_id_fkey';
            columns: ['article_id'];
            isOneToOne: false;
            referencedRelation: 'news_articles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'news_article_cities_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
        ];
      };
      news_article_countries: {
        Row: {
          article_id: string;
          country_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          article_id: string;
          country_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          article_id?: string;
          country_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'news_article_countries_article_id_fkey';
            columns: ['article_id'];
            isOneToOne: false;
            referencedRelation: 'news_articles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'news_article_countries_country_id_fkey';
            columns: ['country_id'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['id'];
          },
        ];
      };
      news_articles: {
        Row: {
          author: string | null;
          category: string;
          city_ids: string[] | null;
          content: string | null;
          country_ids: string[] | null;
          created_at: string;
          excerpt: string | null;
          id: string;
          image_url: string | null;
          is_featured: boolean | null;
          published_at: string;
          sentiment: string | null;
          source_id: string;
          tags: string[] | null;
          title: string;
          updated_at: string;
          url: string;
          views_count: number | null;
        };
        Insert: {
          author?: string | null;
          category?: string;
          city_ids?: string[] | null;
          content?: string | null;
          country_ids?: string[] | null;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          published_at: string;
          sentiment?: string | null;
          source_id: string;
          tags?: string[] | null;
          title: string;
          updated_at?: string;
          url: string;
          views_count?: number | null;
        };
        Update: {
          author?: string | null;
          category?: string;
          city_ids?: string[] | null;
          content?: string | null;
          country_ids?: string[] | null;
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          published_at?: string;
          sentiment?: string | null;
          source_id?: string;
          tags?: string[] | null;
          title?: string;
          updated_at?: string;
          url?: string;
          views_count?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'news_articles_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'news_sources';
            referencedColumns: ['id'];
          },
        ];
      };
      news_categories: {
        Row: {
          color: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          parent_category_id: string | null;
          slug: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          parent_category_id?: string | null;
          slug: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          parent_category_id?: string | null;
          slug?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'news_categories_parent_category_id_fkey';
            columns: ['parent_category_id'];
            isOneToOne: false;
            referencedRelation: 'news_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      news_favorites: {
        Row: {
          article_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          article_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          article_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      news_sources: {
        Row: {
          articles_fetched: number | null;
          category: string;
          created_at: string;
          fetch_frequency: number;
          id: string;
          is_active: boolean;
          keywords: string[] | null;
          last_error: string | null;
          last_fetched_at: string | null;
          name: string;
          source_type: string;
          status: string | null;
          updated_at: string;
          url: string;
        };
        Insert: {
          articles_fetched?: number | null;
          category?: string;
          created_at?: string;
          fetch_frequency?: number;
          id?: string;
          is_active?: boolean;
          keywords?: string[] | null;
          last_error?: string | null;
          last_fetched_at?: string | null;
          name: string;
          source_type?: string;
          status?: string | null;
          updated_at?: string;
          url: string;
        };
        Update: {
          articles_fetched?: number | null;
          category?: string;
          created_at?: string;
          fetch_frequency?: number;
          id?: string;
          is_active?: boolean;
          keywords?: string[] | null;
          last_error?: string | null;
          last_fetched_at?: string | null;
          name?: string;
          source_type?: string;
          status?: string | null;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          action_url: string | null;
          content: string | null;
          created_at: string;
          id: string;
          metadata: Json | null;
          read: boolean;
          related_id: string | null;
          title: string;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          action_url?: string | null;
          content?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          read?: boolean;
          related_id?: string | null;
          title: string;
          type: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          action_url?: string | null;
          content?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          read?: boolean;
          related_id?: string | null;
          title?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      passkey_challenges: {
        Row: {
          action: string;
          challenge: number[];
          created_at: string;
          expires_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          challenge: number[];
          created_at?: string;
          expires_at: string;
          id?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          challenge?: number[];
          created_at?: string;
          expires_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      personalities: {
        Row: {
          achievements: Json | null;
          bio: string | null;
          birth_date: string | null;
          birth_place: string | null;
          city_id: string | null;
          country_id: string | null;
          created_at: string;
          created_by: string | null;
          death_date: string | null;
          description: string | null;
          fields: Json | null;
          geo_linked_at: string | null;
          id: string;
          image_url: string | null;
          is_featured: boolean | null;
          is_living: boolean | null;
          lgbti_connection: string | null;
          lgbti_details: string | null;
          name: string;
          nationality: string | null;
          next_concerts: Json | null;
          profession: string | null;
          profile_url: string | null;
          pronouns: string | null;
          regulatory_notes: string | null;
          sanctions_status: string | null;
          social_links: Json | null;
          tags: string[] | null;
          top_book: string | null;
          updated_at: string;
          verification_status: string | null;
          view_count: number | null;
          visibility: string | null;
          website_url: string | null;
        };
        Insert: {
          achievements?: Json | null;
          bio?: string | null;
          birth_date?: string | null;
          birth_place?: string | null;
          city_id?: string | null;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          death_date?: string | null;
          description?: string | null;
          fields?: Json | null;
          geo_linked_at?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          is_living?: boolean | null;
          lgbti_connection?: string | null;
          lgbti_details?: string | null;
          name: string;
          nationality?: string | null;
          next_concerts?: Json | null;
          profession?: string | null;
          profile_url?: string | null;
          pronouns?: string | null;
          regulatory_notes?: string | null;
          sanctions_status?: string | null;
          social_links?: Json | null;
          tags?: string[] | null;
          top_book?: string | null;
          updated_at?: string;
          verification_status?: string | null;
          view_count?: number | null;
          visibility?: string | null;
          website_url?: string | null;
        };
        Update: {
          achievements?: Json | null;
          bio?: string | null;
          birth_date?: string | null;
          birth_place?: string | null;
          city_id?: string | null;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          death_date?: string | null;
          description?: string | null;
          fields?: Json | null;
          geo_linked_at?: string | null;
          id?: string;
          image_url?: string | null;
          is_featured?: boolean | null;
          is_living?: boolean | null;
          lgbti_connection?: string | null;
          lgbti_details?: string | null;
          name?: string;
          nationality?: string | null;
          next_concerts?: Json | null;
          profession?: string | null;
          profile_url?: string | null;
          pronouns?: string | null;
          regulatory_notes?: string | null;
          sanctions_status?: string | null;
          social_links?: Json | null;
          tags?: string[] | null;
          top_book?: string | null;
          updated_at?: string;
          verification_status?: string | null;
          view_count?: number | null;
          visibility?: string | null;
          website_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'personalities_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personalities_country_id_fkey';
            columns: ['country_id'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['id'];
          },
        ];
      };
      placeholder_images: {
        Row: {
          category: string;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          file_size: number | null;
          filename: string;
          height: number | null;
          id: string;
          is_active: boolean | null;
          mime_type: string | null;
          storage_path: string;
          updated_at: string | null;
          width: number | null;
        };
        Insert: {
          category?: string;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          file_size?: number | null;
          filename: string;
          height?: number | null;
          id?: string;
          is_active?: boolean | null;
          mime_type?: string | null;
          storage_path: string;
          updated_at?: string | null;
          width?: number | null;
        };
        Update: {
          category?: string;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          file_size?: number | null;
          filename?: string;
          height?: number | null;
          id?: string;
          is_active?: boolean | null;
          mime_type?: string | null;
          storage_path?: string;
          updated_at?: string | null;
          width?: number | null;
        };
        Relationships: [];
      };
      post_comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          likes_count: number | null;
          mentions: Json | null;
          parent_comment_id: string | null;
          post_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          likes_count?: number | null;
          mentions?: Json | null;
          parent_comment_id?: string | null;
          post_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          likes_count?: number | null;
          mentions?: Json | null;
          parent_comment_id?: string | null;
          post_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_comments_parent_comment_id_fkey';
            columns: ['parent_comment_id'];
            isOneToOne: false;
            referencedRelation: 'post_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_comments_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'community_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'post_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'post_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      post_likes: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'post_likes_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'community_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_likes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'post_likes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'post_likes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      presence_statuses: {
        Row: {
          description: string | null;
          id: string;
          is_selectable: boolean | null;
          name: string;
        };
        Insert: {
          description?: string | null;
          id?: string;
          is_selectable?: boolean | null;
          name: string;
        };
        Update: {
          description?: string | null;
          id?: string;
          is_selectable?: boolean | null;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          accessibility_needs: string | null;
          activism_involvement: string[] | null;
          age_range: string | null;
          avatar_config: Json | null;
          avatar_type: string | null;
          avatar_url: string | null;
          background_check: boolean | null;
          bdsm_role: string | null;
          bio: string | null;
          body_type: string | null;
          boundaries_and_limits: string[] | null;
          causes_supported: string[] | null;
          chosen_family_status: string | null;
          chosen_name: string | null;
          coming_out_status: Json | null;
          communication_about_sex: string | null;
          communication_preferences: Json | null;
          communication_style: string | null;
          community_involvement: string[] | null;
          community_roles: string[] | null;
          company: string | null;
          consent_practices: string[] | null;
          content_warnings: string[] | null;
          created_at: string;
          cultural_background: string[] | null;
          current_relationship_status: string | null;
          date_of_birth: string | null;
          dating_preferences: Json | null;
          diet_preferences: string[] | null;
          disability_status: string | null;
          display_name: string | null;
          drinking_preference: string | null;
          education: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_phone_encrypted: string | null;
          emergency_contact_relationship: string | null;
          ethnicity: string | null;
          exercise_frequency: string | null;
          eye_color: string | null;
          family_acceptance_level: string | null;
          favorite_books: string[] | null;
          favorite_movies: string[] | null;
          favorite_music_genres: string[] | null;
          financial_situation: string | null;
          first_name: string | null;
          food_preferences: string[] | null;
          gender_identity: string | null;
          gender_identity_encrypted: string | null;
          hair_color: string | null;
          has_children: boolean | null;
          has_pets: boolean | null;
          height_cm: number | null;
          hobbies: string[] | null;
          housing_situation: string | null;
          id: string;
          immigration_status: string | null;
          income_range: string | null;
          income_range_encrypted: string | null;
          industry: string | null;
          interests: Json | null;
          intimacy_preferences: Json | null;
          is_business: boolean | null;
          is_online: boolean | null;
          jealousy_comfort_level: string | null;
          job_title: string | null;
          kink_experience_level: string | null;
          kink_interests: string[] | null;
          languages: Json | null;
          last_active_at: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          life_philosophy: string | null;
          location: string | null;
          looking_for: string[] | null;
          love_languages: string[] | null;
          mailbox_address: string | null;
          medication_status: string | null;
          mental_health_advocacy: boolean | null;
          mental_health_openness: string | null;
          mutual_aid_interests: string[] | null;
          name_pronunciation: string | null;
          neighborhood_preference: string | null;
          neurodivergent_status: string | null;
          occupation: string | null;
          partner_preferences: Json | null;
          personality_type: string | null;
          pet_preferences: string | null;
          phone: string | null;
          phone_encrypted: string | null;
          photos_visibility: string | null;
          physical_affection_preference: string | null;
          political_views: string | null;
          political_views_encrypted: string | null;
          preferences: Json | null;
          privacy_settings: Json | null;
          profile_completion_percentage: number | null;
          pronouns: string | null;
          protection_preferences: string[] | null;
          relationship_goals: string[] | null;
          relationship_goals_detailed: string[] | null;
          relationship_status: string | null;
          relationship_status_encrypted: string | null;
          relationship_structure_preference: string[] | null;
          relationship_style: string | null;
          religious_beliefs: string | null;
          religious_beliefs_encrypted: string | null;
          response_time_preference: string | null;
          romance_style: string | null;
          romantic_orientation: string | null;
          safe_space_preferences: string[] | null;
          sexual_exploration_openness: string | null;
          sexual_frequency_preference: string | null;
          sexual_health_status: string | null;
          sexual_orientation: string | null;
          sexual_orientation_details: Json | null;
          sexual_orientation_encrypted: string | null;
          sleep_schedule: string | null;
          smoking_preference: string | null;
          social_links: Json | null;
          support_offering: string[] | null;
          support_seeking: string[] | null;
          therapy_friendly: boolean | null;
          transportation_method: string | null;
          travel_preferences: Json | null;
          updated_at: string;
          user_id: string;
          user_mode: Database['public']['Enums']['user_mode'] | null;
          verified_email: boolean | null;
          verified_identity: boolean | null;
          verified_phone: boolean | null;
          volunteer_work: string[] | null;
          wants_children: string | null;
          website: string | null;
          willing_to_relocate: boolean | null;
          work_schedule: string | null;
          workplace_safety: string | null;
          zodiac_sign: string | null;
        };
        Insert: {
          accessibility_needs?: string | null;
          activism_involvement?: string[] | null;
          age_range?: string | null;
          avatar_config?: Json | null;
          avatar_type?: string | null;
          avatar_url?: string | null;
          background_check?: boolean | null;
          bdsm_role?: string | null;
          bio?: string | null;
          body_type?: string | null;
          boundaries_and_limits?: string[] | null;
          causes_supported?: string[] | null;
          chosen_family_status?: string | null;
          chosen_name?: string | null;
          coming_out_status?: Json | null;
          communication_about_sex?: string | null;
          communication_preferences?: Json | null;
          communication_style?: string | null;
          community_involvement?: string[] | null;
          community_roles?: string[] | null;
          company?: string | null;
          consent_practices?: string[] | null;
          content_warnings?: string[] | null;
          created_at?: string;
          cultural_background?: string[] | null;
          current_relationship_status?: string | null;
          date_of_birth?: string | null;
          dating_preferences?: Json | null;
          diet_preferences?: string[] | null;
          disability_status?: string | null;
          display_name?: string | null;
          drinking_preference?: string | null;
          education?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          emergency_contact_phone_encrypted?: string | null;
          emergency_contact_relationship?: string | null;
          ethnicity?: string | null;
          exercise_frequency?: string | null;
          eye_color?: string | null;
          family_acceptance_level?: string | null;
          favorite_books?: string[] | null;
          favorite_movies?: string[] | null;
          favorite_music_genres?: string[] | null;
          financial_situation?: string | null;
          first_name?: string | null;
          food_preferences?: string[] | null;
          gender_identity?: string | null;
          gender_identity_encrypted?: string | null;
          hair_color?: string | null;
          has_children?: boolean | null;
          has_pets?: boolean | null;
          height_cm?: number | null;
          hobbies?: string[] | null;
          housing_situation?: string | null;
          id?: string;
          immigration_status?: string | null;
          income_range?: string | null;
          income_range_encrypted?: string | null;
          industry?: string | null;
          interests?: Json | null;
          intimacy_preferences?: Json | null;
          is_business?: boolean | null;
          is_online?: boolean | null;
          jealousy_comfort_level?: string | null;
          job_title?: string | null;
          kink_experience_level?: string | null;
          kink_interests?: string[] | null;
          languages?: Json | null;
          last_active_at?: string | null;
          last_name?: string | null;
          last_seen_at?: string | null;
          life_philosophy?: string | null;
          location?: string | null;
          looking_for?: string[] | null;
          love_languages?: string[] | null;
          mailbox_address?: string | null;
          medication_status?: string | null;
          mental_health_advocacy?: boolean | null;
          mental_health_openness?: string | null;
          mutual_aid_interests?: string[] | null;
          name_pronunciation?: string | null;
          neighborhood_preference?: string | null;
          neurodivergent_status?: string | null;
          occupation?: string | null;
          partner_preferences?: Json | null;
          personality_type?: string | null;
          pet_preferences?: string | null;
          phone?: string | null;
          phone_encrypted?: string | null;
          photos_visibility?: string | null;
          physical_affection_preference?: string | null;
          political_views?: string | null;
          political_views_encrypted?: string | null;
          preferences?: Json | null;
          privacy_settings?: Json | null;
          profile_completion_percentage?: number | null;
          pronouns?: string | null;
          protection_preferences?: string[] | null;
          relationship_goals?: string[] | null;
          relationship_goals_detailed?: string[] | null;
          relationship_status?: string | null;
          relationship_status_encrypted?: string | null;
          relationship_structure_preference?: string[] | null;
          relationship_style?: string | null;
          religious_beliefs?: string | null;
          religious_beliefs_encrypted?: string | null;
          response_time_preference?: string | null;
          romance_style?: string | null;
          romantic_orientation?: string | null;
          safe_space_preferences?: string[] | null;
          sexual_exploration_openness?: string | null;
          sexual_frequency_preference?: string | null;
          sexual_health_status?: string | null;
          sexual_orientation?: string | null;
          sexual_orientation_details?: Json | null;
          sexual_orientation_encrypted?: string | null;
          sleep_schedule?: string | null;
          smoking_preference?: string | null;
          social_links?: Json | null;
          support_offering?: string[] | null;
          support_seeking?: string[] | null;
          therapy_friendly?: boolean | null;
          transportation_method?: string | null;
          travel_preferences?: Json | null;
          updated_at?: string;
          user_id: string;
          user_mode?: Database['public']['Enums']['user_mode'] | null;
          verified_email?: boolean | null;
          verified_identity?: boolean | null;
          verified_phone?: boolean | null;
          volunteer_work?: string[] | null;
          wants_children?: string | null;
          website?: string | null;
          willing_to_relocate?: boolean | null;
          work_schedule?: string | null;
          workplace_safety?: string | null;
          zodiac_sign?: string | null;
        };
        Update: {
          accessibility_needs?: string | null;
          activism_involvement?: string[] | null;
          age_range?: string | null;
          avatar_config?: Json | null;
          avatar_type?: string | null;
          avatar_url?: string | null;
          background_check?: boolean | null;
          bdsm_role?: string | null;
          bio?: string | null;
          body_type?: string | null;
          boundaries_and_limits?: string[] | null;
          causes_supported?: string[] | null;
          chosen_family_status?: string | null;
          chosen_name?: string | null;
          coming_out_status?: Json | null;
          communication_about_sex?: string | null;
          communication_preferences?: Json | null;
          communication_style?: string | null;
          community_involvement?: string[] | null;
          community_roles?: string[] | null;
          company?: string | null;
          consent_practices?: string[] | null;
          content_warnings?: string[] | null;
          created_at?: string;
          cultural_background?: string[] | null;
          current_relationship_status?: string | null;
          date_of_birth?: string | null;
          dating_preferences?: Json | null;
          diet_preferences?: string[] | null;
          disability_status?: string | null;
          display_name?: string | null;
          drinking_preference?: string | null;
          education?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          emergency_contact_phone_encrypted?: string | null;
          emergency_contact_relationship?: string | null;
          ethnicity?: string | null;
          exercise_frequency?: string | null;
          eye_color?: string | null;
          family_acceptance_level?: string | null;
          favorite_books?: string[] | null;
          favorite_movies?: string[] | null;
          favorite_music_genres?: string[] | null;
          financial_situation?: string | null;
          first_name?: string | null;
          food_preferences?: string[] | null;
          gender_identity?: string | null;
          gender_identity_encrypted?: string | null;
          hair_color?: string | null;
          has_children?: boolean | null;
          has_pets?: boolean | null;
          height_cm?: number | null;
          hobbies?: string[] | null;
          housing_situation?: string | null;
          id?: string;
          immigration_status?: string | null;
          income_range?: string | null;
          income_range_encrypted?: string | null;
          industry?: string | null;
          interests?: Json | null;
          intimacy_preferences?: Json | null;
          is_business?: boolean | null;
          is_online?: boolean | null;
          jealousy_comfort_level?: string | null;
          job_title?: string | null;
          kink_experience_level?: string | null;
          kink_interests?: string[] | null;
          languages?: Json | null;
          last_active_at?: string | null;
          last_name?: string | null;
          last_seen_at?: string | null;
          life_philosophy?: string | null;
          location?: string | null;
          looking_for?: string[] | null;
          love_languages?: string[] | null;
          mailbox_address?: string | null;
          medication_status?: string | null;
          mental_health_advocacy?: boolean | null;
          mental_health_openness?: string | null;
          mutual_aid_interests?: string[] | null;
          name_pronunciation?: string | null;
          neighborhood_preference?: string | null;
          neurodivergent_status?: string | null;
          occupation?: string | null;
          partner_preferences?: Json | null;
          personality_type?: string | null;
          pet_preferences?: string | null;
          phone?: string | null;
          phone_encrypted?: string | null;
          photos_visibility?: string | null;
          physical_affection_preference?: string | null;
          political_views?: string | null;
          political_views_encrypted?: string | null;
          preferences?: Json | null;
          privacy_settings?: Json | null;
          profile_completion_percentage?: number | null;
          pronouns?: string | null;
          protection_preferences?: string[] | null;
          relationship_goals?: string[] | null;
          relationship_goals_detailed?: string[] | null;
          relationship_status?: string | null;
          relationship_status_encrypted?: string | null;
          relationship_structure_preference?: string[] | null;
          relationship_style?: string | null;
          religious_beliefs?: string | null;
          religious_beliefs_encrypted?: string | null;
          response_time_preference?: string | null;
          romance_style?: string | null;
          romantic_orientation?: string | null;
          safe_space_preferences?: string[] | null;
          sexual_exploration_openness?: string | null;
          sexual_frequency_preference?: string | null;
          sexual_health_status?: string | null;
          sexual_orientation?: string | null;
          sexual_orientation_details?: Json | null;
          sexual_orientation_encrypted?: string | null;
          sleep_schedule?: string | null;
          smoking_preference?: string | null;
          social_links?: Json | null;
          support_offering?: string[] | null;
          support_seeking?: string[] | null;
          therapy_friendly?: boolean | null;
          transportation_method?: string | null;
          travel_preferences?: Json | null;
          updated_at?: string;
          user_id?: string;
          user_mode?: Database['public']['Enums']['user_mode'] | null;
          verified_email?: boolean | null;
          verified_identity?: boolean | null;
          verified_phone?: boolean | null;
          volunteer_work?: string[] | null;
          wants_children?: string | null;
          website?: string | null;
          willing_to_relocate?: boolean | null;
          work_schedule?: string | null;
          workplace_safety?: string | null;
          zodiac_sign?: string | null;
        };
        Relationships: [];
      };
      profiles_audit_log: {
        Row: {
          accessed_columns: string[] | null;
          accessing_user_id: string | null;
          action: string;
          created_at: string | null;
          id: string;
          ip_address: unknown;
          profile_user_id: string;
          user_agent: string | null;
        };
        Insert: {
          accessed_columns?: string[] | null;
          accessing_user_id?: string | null;
          action: string;
          created_at?: string | null;
          id?: string;
          ip_address?: unknown;
          profile_user_id: string;
          user_agent?: string | null;
        };
        Update: {
          accessed_columns?: string[] | null;
          accessing_user_id?: string | null;
          action?: string;
          created_at?: string | null;
          id?: string;
          ip_address?: unknown;
          profile_user_id?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      push_notification_logs: {
        Row: {
          body: string | null;
          created_at: string;
          data: Json | null;
          id: string;
          notification_type: string;
          sent_at: string | null;
          status: string;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          data?: Json | null;
          id?: string;
          notification_type: string;
          sent_at?: string | null;
          status?: string;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          data?: Json | null;
          id?: string;
          notification_type?: string;
          sent_at?: string | null;
          status?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      queer_villages: {
        Row: {
          boundaries: Json | null;
          city_id: string;
          country_id: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          featured: boolean | null;
          history: string | null;
          id: string;
          image_url: string | null;
          images: string[] | null;
          latitude: number | null;
          longitude: number | null;
          name: string;
          notable_landmarks: string[] | null;
          slug: string;
          tags: string[] | null;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
        };
        Insert: {
          boundaries?: Json | null;
          city_id: string;
          country_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          featured?: boolean | null;
          history?: string | null;
          id?: string;
          image_url?: string | null;
          images?: string[] | null;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          notable_landmarks?: string[] | null;
          slug: string;
          tags?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Update: {
          boundaries?: Json | null;
          city_id?: string;
          country_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          featured?: boolean | null;
          history?: string | null;
          id?: string;
          image_url?: string | null;
          images?: string[] | null;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          notable_landmarks?: string[] | null;
          slug?: string;
          tags?: string[] | null;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'queer_villages_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'queer_villages_country_id_fkey';
            columns: ['country_id'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['id'];
          },
        ];
      };
      rag_conversations: {
        Row: {
          context_used: Json | null;
          created_at: string;
          embedding: string | null;
          id: string;
          query: string;
          response: string;
          session_id: string;
          user_id: string | null;
        };
        Insert: {
          context_used?: Json | null;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          query: string;
          response: string;
          session_id: string;
          user_id?: string | null;
        };
        Update: {
          context_used?: Json | null;
          created_at?: string;
          embedding?: string | null;
          id?: string;
          query?: string;
          response?: string;
          session_id?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      redirect_events: {
        Row: {
          country: string | null;
          id: number;
          ip_hash: string | null;
          path: string;
          query: string | null;
          redirect_id: string;
          referer: string | null;
          status: number;
          ts: string;
          user_agent: string | null;
        };
        Insert: {
          country?: string | null;
          id?: number;
          ip_hash?: string | null;
          path: string;
          query?: string | null;
          redirect_id: string;
          referer?: string | null;
          status: number;
          ts?: string;
          user_agent?: string | null;
        };
        Update: {
          country?: string | null;
          id?: number;
          ip_hash?: string | null;
          path?: string;
          query?: string | null;
          redirect_id?: string;
          referer?: string | null;
          status?: number;
          ts?: string;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'redirect_events_redirect_id_fkey';
            columns: ['redirect_id'];
            isOneToOne: false;
            referencedRelation: 'redirects';
            referencedColumns: ['id'];
          },
        ];
      };
      redirects: {
        Row: {
          click_count: number;
          click_limit: number | null;
          created_at: string;
          created_by: string | null;
          end_at: string | null;
          id: string;
          is_enabled: boolean;
          match_kind: Database['public']['Enums']['redirect_match_kind'];
          notes: string | null;
          preserve_query: boolean;
          query_mode: Database['public']['Enums']['redirect_query_mode'];
          query_override: Json | null;
          slug: string | null;
          source_path: string | null;
          start_at: string | null;
          status_code: number;
          target: string;
          type: Database['public']['Enums']['redirect_type'];
          updated_at: string;
          utm_defaults: Json | null;
        };
        Insert: {
          click_count?: number;
          click_limit?: number | null;
          created_at?: string;
          created_by?: string | null;
          end_at?: string | null;
          id?: string;
          is_enabled?: boolean;
          match_kind?: Database['public']['Enums']['redirect_match_kind'];
          notes?: string | null;
          preserve_query?: boolean;
          query_mode?: Database['public']['Enums']['redirect_query_mode'];
          query_override?: Json | null;
          slug?: string | null;
          source_path?: string | null;
          start_at?: string | null;
          status_code?: number;
          target: string;
          type?: Database['public']['Enums']['redirect_type'];
          updated_at?: string;
          utm_defaults?: Json | null;
        };
        Update: {
          click_count?: number;
          click_limit?: number | null;
          created_at?: string;
          created_by?: string | null;
          end_at?: string | null;
          id?: string;
          is_enabled?: boolean;
          match_kind?: Database['public']['Enums']['redirect_match_kind'];
          notes?: string | null;
          preserve_query?: boolean;
          query_mode?: Database['public']['Enums']['redirect_query_mode'];
          query_override?: Json | null;
          slug?: string | null;
          source_path?: string | null;
          start_at?: string | null;
          status_code?: number;
          target?: string;
          type?: Database['public']['Enums']['redirect_type'];
          updated_at?: string;
          utm_defaults?: Json | null;
        };
        Relationships: [];
      };
      regions: {
        Row: {
          continent_id: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          continent_id: string;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          continent_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'regions_continent_id_fkey';
            columns: ['continent_id'];
            isOneToOne: false;
            referencedRelation: 'continents';
            referencedColumns: ['id'];
          },
        ];
      };
      role_audit_logs: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          performed_by: string;
          role: Database['public']['Enums']['app_role'];
          target_user_id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          performed_by: string;
          role: Database['public']['Enums']['app_role'];
          target_user_id: string;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          performed_by?: string;
          role?: Database['public']['Enums']['app_role'];
          target_user_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      scrape_runs: {
        Row: {
          completed_at: string | null;
          created_at: string | null;
          duration_ms: number | null;
          error_message: string | null;
          id: string;
          items_duplicate: number | null;
          items_error: number | null;
          items_found: number | null;
          items_new: number | null;
          items_staged: number | null;
          job_id: string | null;
          pages_crawled: number | null;
          run_config: Json | null;
          run_log: Json | null;
          source_id: string;
          started_at: string | null;
          status: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          items_duplicate?: number | null;
          items_error?: number | null;
          items_found?: number | null;
          items_new?: number | null;
          items_staged?: number | null;
          job_id?: string | null;
          pages_crawled?: number | null;
          run_config?: Json | null;
          run_log?: Json | null;
          source_id: string;
          started_at?: string | null;
          status?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          items_duplicate?: number | null;
          items_error?: number | null;
          items_found?: number | null;
          items_new?: number | null;
          items_staged?: number | null;
          job_id?: string | null;
          pages_crawled?: number | null;
          run_config?: Json | null;
          run_log?: Json | null;
          source_id?: string;
          started_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'scrape_runs_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'import_jobs_enhanced';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'scrape_runs_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'scrape_sources';
            referencedColumns: ['id'];
          },
        ];
      };
      scrape_sources: {
        Row: {
          consecutive_failures: number | null;
          content_type: string;
          created_at: string | null;
          id: string;
          is_enabled: boolean | null;
          last_error: string | null;
          last_run_at: string | null;
          last_success_at: string | null;
          max_pages_per_run: number | null;
          name: string;
          priority: number | null;
          rate_limit_ms: number | null;
          respect_robots_txt: boolean | null;
          schedule_cron: string | null;
          schedule_interval_hours: number | null;
          scrape_config: Json;
          scrape_method: string;
          slug: string;
          target_table: string;
          total_items_fetched: number | null;
          total_runs: number | null;
          updated_at: string | null;
          url: string;
          user_agent: string | null;
        };
        Insert: {
          consecutive_failures?: number | null;
          content_type: string;
          created_at?: string | null;
          id?: string;
          is_enabled?: boolean | null;
          last_error?: string | null;
          last_run_at?: string | null;
          last_success_at?: string | null;
          max_pages_per_run?: number | null;
          name: string;
          priority?: number | null;
          rate_limit_ms?: number | null;
          respect_robots_txt?: boolean | null;
          schedule_cron?: string | null;
          schedule_interval_hours?: number | null;
          scrape_config?: Json;
          scrape_method?: string;
          slug: string;
          target_table: string;
          total_items_fetched?: number | null;
          total_runs?: number | null;
          updated_at?: string | null;
          url: string;
          user_agent?: string | null;
        };
        Update: {
          consecutive_failures?: number | null;
          content_type?: string;
          created_at?: string | null;
          id?: string;
          is_enabled?: boolean | null;
          last_error?: string | null;
          last_run_at?: string | null;
          last_success_at?: string | null;
          max_pages_per_run?: number | null;
          name?: string;
          priority?: number | null;
          rate_limit_ms?: number | null;
          respect_robots_txt?: boolean | null;
          schedule_cron?: string | null;
          schedule_interval_hours?: number | null;
          scrape_config?: Json;
          scrape_method?: string;
          slug?: string;
          target_table?: string;
          total_items_fetched?: number | null;
          total_runs?: number | null;
          updated_at?: string | null;
          url?: string;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      scraper_dedupe_decisions: {
        Row: {
          confidence: number;
          created_at: string | null;
          decision: string;
          entity_a_id: string;
          entity_b_id: string;
          entity_type: string;
          id: string;
          match_method: string;
        };
        Insert: {
          confidence: number;
          created_at?: string | null;
          decision: string;
          entity_a_id: string;
          entity_b_id: string;
          entity_type: string;
          id?: string;
          match_method: string;
        };
        Update: {
          confidence?: number;
          created_at?: string | null;
          decision?: string;
          entity_a_id?: string;
          entity_b_id?: string;
          entity_type?: string;
          id?: string;
          match_method?: string;
        };
        Relationships: [];
      };
      scraper_entity_map: {
        Row: {
          canonical_entity_id: string;
          confidence: number | null;
          created_at: string | null;
          entity_type: string;
          id: string;
          source_id: string;
          source_name: string;
          updated_at: string | null;
        };
        Insert: {
          canonical_entity_id: string;
          confidence?: number | null;
          created_at?: string | null;
          entity_type: string;
          id?: string;
          source_id: string;
          source_name: string;
          updated_at?: string | null;
        };
        Update: {
          canonical_entity_id?: string;
          confidence?: number | null;
          created_at?: string | null;
          entity_type?: string;
          id?: string;
          source_id?: string;
          source_name?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      scraper_events: {
        Row: {
          address: string | null;
          category: string | null;
          city: string | null;
          country: string | null;
          created_at: string | null;
          description: string | null;
          end_datetime: string | null;
          first_seen_at: string | null;
          id: string;
          images: string[] | null;
          last_seen_at: string | null;
          lat: number | null;
          lng: number | null;
          name: string;
          price_range: string | null;
          region: string | null;
          source_url: string;
          start_datetime: string;
          tags: string[] | null;
          ticket_url: string | null;
          timezone: string | null;
          updated_at: string | null;
          venue_name: string | null;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          category?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_datetime?: string | null;
          first_seen_at?: string | null;
          id?: string;
          images?: string[] | null;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name: string;
          price_range?: string | null;
          region?: string | null;
          source_url: string;
          start_datetime: string;
          tags?: string[] | null;
          ticket_url?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          venue_name?: string | null;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          category?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_datetime?: string | null;
          first_seen_at?: string | null;
          id?: string;
          images?: string[] | null;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name?: string;
          price_range?: string | null;
          region?: string | null;
          source_url?: string;
          start_datetime?: string;
          tags?: string[] | null;
          ticket_url?: string | null;
          timezone?: string | null;
          updated_at?: string | null;
          venue_name?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      scraper_ingest_runs: {
        Row: {
          blocked_by_robots: number | null;
          entities_deduped: number | null;
          entities_inserted: number | null;
          entities_parsed: number | null;
          entities_updated: number | null;
          entity_type: string | null;
          errors: Json | null;
          failed_requests: number | null;
          finished_at: string | null;
          id: string;
          pages_fetched: number | null;
          source_name: string;
          started_at: string | null;
          status: string;
        };
        Insert: {
          blocked_by_robots?: number | null;
          entities_deduped?: number | null;
          entities_inserted?: number | null;
          entities_parsed?: number | null;
          entities_updated?: number | null;
          entity_type?: string | null;
          errors?: Json | null;
          failed_requests?: number | null;
          finished_at?: string | null;
          id?: string;
          pages_fetched?: number | null;
          source_name: string;
          started_at?: string | null;
          status: string;
        };
        Update: {
          blocked_by_robots?: number | null;
          entities_deduped?: number | null;
          entities_inserted?: number | null;
          entities_parsed?: number | null;
          entities_updated?: number | null;
          entity_type?: string | null;
          errors?: Json | null;
          failed_requests?: number | null;
          finished_at?: string | null;
          id?: string;
          pages_fetched?: number | null;
          source_name?: string;
          started_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      scraper_places: {
        Row: {
          city: string;
          country: string;
          created_at: string | null;
          description: string | null;
          first_seen_at: string | null;
          id: string;
          images: string[] | null;
          last_seen_at: string | null;
          lat: number | null;
          lng: number | null;
          name: string;
          region: string | null;
          source_url: string;
          tags: string[] | null;
          updated_at: string | null;
          wikipedia_url: string | null;
        };
        Insert: {
          city: string;
          country: string;
          created_at?: string | null;
          description?: string | null;
          first_seen_at?: string | null;
          id?: string;
          images?: string[] | null;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name: string;
          region?: string | null;
          source_url: string;
          tags?: string[] | null;
          updated_at?: string | null;
          wikipedia_url?: string | null;
        };
        Update: {
          city?: string;
          country?: string;
          created_at?: string | null;
          description?: string | null;
          first_seen_at?: string | null;
          id?: string;
          images?: string[] | null;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name?: string;
          region?: string | null;
          source_url?: string;
          tags?: string[] | null;
          updated_at?: string | null;
          wikipedia_url?: string | null;
        };
        Relationships: [];
      };
      scraper_snapshots: {
        Row: {
          content: string;
          content_hash: string;
          content_type: string;
          fetched_at: string | null;
          id: string;
          source_name: string;
          url: string;
        };
        Insert: {
          content: string;
          content_hash: string;
          content_type: string;
          fetched_at?: string | null;
          id?: string;
          source_name: string;
          url: string;
        };
        Update: {
          content?: string;
          content_hash?: string;
          content_type?: string;
          fetched_at?: string | null;
          id?: string;
          source_name?: string;
          url?: string;
        };
        Relationships: [];
      };
      scraper_stays: {
        Row: {
          address: string | null;
          category: string | null;
          city: string;
          country: string;
          created_at: string | null;
          description: string | null;
          first_seen_at: string | null;
          id: string;
          images: string[] | null;
          last_seen_at: string | null;
          lat: number | null;
          lng: number | null;
          name: string;
          phone: string | null;
          price_range: string | null;
          region: string | null;
          source_url: string;
          tags: string[] | null;
          updated_at: string | null;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          category?: string | null;
          city: string;
          country: string;
          created_at?: string | null;
          description?: string | null;
          first_seen_at?: string | null;
          id?: string;
          images?: string[] | null;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name: string;
          phone?: string | null;
          price_range?: string | null;
          region?: string | null;
          source_url: string;
          tags?: string[] | null;
          updated_at?: string | null;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          category?: string | null;
          city?: string;
          country?: string;
          created_at?: string | null;
          description?: string | null;
          first_seen_at?: string | null;
          id?: string;
          images?: string[] | null;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name?: string;
          phone?: string | null;
          price_range?: string | null;
          region?: string | null;
          source_url?: string;
          tags?: string[] | null;
          updated_at?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      scraper_venues: {
        Row: {
          address: string | null;
          category: string | null;
          city: string;
          country: string;
          created_at: string | null;
          description: string | null;
          first_seen_at: string | null;
          id: string;
          images: string[] | null;
          last_seen_at: string | null;
          lat: number | null;
          lng: number | null;
          name: string;
          opening_hours: string | null;
          phone: string | null;
          price_range: string | null;
          region: string | null;
          source_url: string;
          tags: string[] | null;
          updated_at: string | null;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          category?: string | null;
          city: string;
          country: string;
          created_at?: string | null;
          description?: string | null;
          first_seen_at?: string | null;
          id?: string;
          images?: string[] | null;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name: string;
          opening_hours?: string | null;
          phone?: string | null;
          price_range?: string | null;
          region?: string | null;
          source_url: string;
          tags?: string[] | null;
          updated_at?: string | null;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          category?: string | null;
          city?: string;
          country?: string;
          created_at?: string | null;
          description?: string | null;
          first_seen_at?: string | null;
          id?: string;
          images?: string[] | null;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name?: string;
          opening_hours?: string | null;
          phone?: string | null;
          price_range?: string | null;
          region?: string | null;
          source_url?: string;
          tags?: string[] | null;
          updated_at?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      security_events: {
        Row: {
          created_at: string;
          details: Json | null;
          event_type: string;
          id: string;
          ip_address: unknown;
          metadata: Json | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          details?: Json | null;
          event_type: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          details?: Json | null;
          event_type?: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      security_monitoring: {
        Row: {
          created_at: string | null;
          event_type: string;
          id: string;
          ip_address: unknown;
          metadata: Json | null;
          severity: string;
          target_user_id: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          event_type: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json | null;
          severity?: string;
          target_user_id?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          event_type?: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json | null;
          severity?: string;
          target_user_id?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      session_config: {
        Row: {
          created_at: string;
          id: string;
          max_concurrent_sessions: number;
          require_reauthentication_minutes: number;
          timeout_minutes: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          max_concurrent_sessions?: number;
          require_reauthentication_minutes?: number;
          timeout_minutes?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          max_concurrent_sessions?: number;
          require_reauthentication_minutes?: number;
          timeout_minutes?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      suspicious_activities: {
        Row: {
          activity_type: string;
          created_at: string;
          details: Json | null;
          id: string;
          ip_address: unknown;
          is_resolved: boolean;
          severity: string;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          activity_type: string;
          created_at?: string;
          details?: Json | null;
          id?: string;
          ip_address?: unknown;
          is_resolved?: boolean;
          severity?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          activity_type?: string;
          created_at?: string;
          details?: Json | null;
          id?: string;
          ip_address?: unknown;
          is_resolved?: boolean;
          severity?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tag_aliases: {
        Row: {
          alias_name: string;
          alias_slug: string;
          alias_type: string;
          canonical_tag_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          alias_name: string;
          alias_slug: string;
          alias_type?: string;
          canonical_tag_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          alias_name?: string;
          alias_slug?: string;
          alias_type?: string;
          canonical_tag_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tag_aliases_canonical_tag_id_fkey';
            columns: ['canonical_tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags_with_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tag_aliases_canonical_tag_id_fkey';
            columns: ['canonical_tag_id'];
            isOneToOne: false;
            referencedRelation: 'unified_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      tag_categories: {
        Row: {
          color: string | null;
          created_at: string;
          description: string | null;
          id: string;
          level: number;
          name: string;
          parent_id: string | null;
          slug: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          level?: number;
          name: string;
          parent_id?: string | null;
          slug: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          level?: number;
          name?: string;
          parent_id?: string | null;
          slug?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tag_categories_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'tag_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      tag_category_assignments: {
        Row: {
          category_id: string;
          created_at: string;
          id: string;
          is_primary: boolean;
          tag_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          tag_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tag_category_assignments_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'tag_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tag_category_assignments_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags_with_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tag_category_assignments_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'unified_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      tag_favorites: {
        Row: {
          created_at: string;
          id: string;
          tag_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          tag_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          tag_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tag_relationships: {
        Row: {
          created_at: string;
          id: string;
          relationship_type: string;
          similarity_score: number;
          tag1_id: string;
          tag2_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          relationship_type?: string;
          similarity_score: number;
          tag1_id: string;
          tag2_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          relationship_type?: string;
          similarity_score?: number;
          tag1_id?: string;
          tag2_id?: string;
        };
        Relationships: [];
      };
      tag_suggestions: {
        Row: {
          ai_model: string | null;
          batch_id: string | null;
          confidence: number;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source: string;
          status: string;
          suggested_tag_name: string;
          tag_id: string | null;
        };
        Insert: {
          ai_model?: string | null;
          batch_id?: string | null;
          confidence: number;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source?: string;
          status?: string;
          suggested_tag_name: string;
          tag_id?: string | null;
        };
        Update: {
          ai_model?: string | null;
          batch_id?: string | null;
          confidence?: number;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source?: string;
          status?: string;
          suggested_tag_name?: string;
          tag_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tag_suggestions_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags_with_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tag_suggestions_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'unified_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      target_groups: {
        Row: {
          color: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      ui_themes: {
        Row: {
          id: string;
          is_dark: boolean | null;
          name: string;
        };
        Insert: {
          id?: string;
          is_dark?: boolean | null;
          name: string;
        };
        Update: {
          id?: string;
          is_dark?: boolean | null;
          name?: string;
        };
        Relationships: [];
      };
      unified_tag_assignments: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          tag_id: string;
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          tag_id: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'unified_tag_assignments_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'tags_with_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'unified_tag_assignments_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'unified_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      unified_tags: {
        Row: {
          category: string | null;
          category_id: string | null;
          color: string | null;
          created_at: string;
          deprecated_at: string | null;
          deprecation_reason: string | null;
          description: string | null;
          id: string;
          image_url: string | null;
          merged_into_id: string | null;
          name: string;
          slug: string;
          status: string;
          updated_at: string;
          usage_count: number | null;
          wikipedia_url: string | null;
        };
        Insert: {
          category?: string | null;
          category_id?: string | null;
          color?: string | null;
          created_at?: string;
          deprecated_at?: string | null;
          deprecation_reason?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          merged_into_id?: string | null;
          name: string;
          slug: string;
          status?: string;
          updated_at?: string;
          usage_count?: number | null;
          wikipedia_url?: string | null;
        };
        Update: {
          category?: string | null;
          category_id?: string | null;
          color?: string | null;
          created_at?: string;
          deprecated_at?: string | null;
          deprecation_reason?: string | null;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          merged_into_id?: string | null;
          name?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
          usage_count?: number | null;
          wikipedia_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'unified_tags_merged_into_id_fkey';
            columns: ['merged_into_id'];
            isOneToOne: false;
            referencedRelation: 'tags_with_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'unified_tags_merged_into_id_fkey';
            columns: ['merged_into_id'];
            isOneToOne: false;
            referencedRelation: 'unified_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      user_follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_id: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          follower_id: string;
          following_id: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_follows_following_id_fkey';
            columns: ['following_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_follows_following_id_fkey';
            columns: ['following_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_follows_following_id_fkey';
            columns: ['following_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      user_passkey_enrollment: {
        Row: {
          created_at: string;
          device_name: string | null;
          enrolled_at: string | null;
          id: string;
          is_enrolled: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_name?: string | null;
          enrolled_at?: string | null;
          id?: string;
          is_enrolled?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_name?: string | null;
          enrolled_at?: string | null;
          id?: string;
          is_enrolled?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_passkeys: {
        Row: {
          counter: number;
          created_at: string;
          credential_id: string;
          credential_id_encrypted: string | null;
          id: string;
          is_revoked: boolean;
          last_used_at: string | null;
          passkey_encryption_key_id: string | null;
          public_key: string;
          public_key_encrypted: string | null;
          user_id: string;
        };
        Insert: {
          counter?: number;
          created_at?: string;
          credential_id: string;
          credential_id_encrypted?: string | null;
          id?: string;
          is_revoked?: boolean;
          last_used_at?: string | null;
          passkey_encryption_key_id?: string | null;
          public_key: string;
          public_key_encrypted?: string | null;
          user_id: string;
        };
        Update: {
          counter?: number;
          created_at?: string;
          credential_id?: string;
          credential_id_encrypted?: string | null;
          id?: string;
          is_revoked?: boolean;
          last_used_at?: string | null;
          passkey_encryption_key_id?: string | null;
          public_key?: string;
          public_key_encrypted?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_photos: {
        Row: {
          caption: string | null;
          content_type: string | null;
          created_at: string;
          display_order: number | null;
          file_size: number | null;
          filename: string;
          id: string;
          is_profile_picture: boolean | null;
          is_public: boolean;
          storage_path: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          caption?: string | null;
          content_type?: string | null;
          created_at?: string;
          display_order?: number | null;
          file_size?: number | null;
          filename: string;
          id?: string;
          is_profile_picture?: boolean | null;
          is_public?: boolean;
          storage_path: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          caption?: string | null;
          content_type?: string | null;
          created_at?: string;
          display_order?: number | null;
          file_size?: number | null;
          filename?: string;
          id?: string;
          is_profile_picture?: boolean | null;
          is_public?: boolean;
          storage_path?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_push_tokens: {
        Row: {
          created_at: string;
          id: string;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          platform: string;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_relationships: {
        Row: {
          created_at: string;
          id: string;
          relationship_type: string;
          status: string;
          target_user_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          relationship_type: string;
          status?: string;
          target_user_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          relationship_type?: string;
          status?: string;
          target_user_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_role_audit_log: {
        Row: {
          action_type: string;
          admin_user_id: string;
          id: string;
          role_changed: Database['public']['Enums']['app_role'];
          target_user_id: string;
          timestamp: string;
        };
        Insert: {
          action_type: string;
          admin_user_id: string;
          id?: string;
          role_changed: Database['public']['Enums']['app_role'];
          target_user_id: string;
          timestamp?: string;
        };
        Update: {
          action_type?: string;
          admin_user_id?: string;
          id?: string;
          role_changed?: Database['public']['Enums']['app_role'];
          target_user_id?: string;
          timestamp?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database['public']['Enums']['app_role'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database['public']['Enums']['app_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database['public']['Enums']['app_role'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_sessions: {
        Row: {
          created_at: string;
          encryption_key_id: string | null;
          expires_at: string;
          id: string;
          ip_address: unknown;
          ip_address_encrypted: string | null;
          is_active: boolean;
          last_activity: string;
          session_token: string;
          session_token_encrypted: string | null;
          user_agent: string | null;
          user_agent_encrypted: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          encryption_key_id?: string | null;
          expires_at: string;
          id?: string;
          ip_address?: unknown;
          ip_address_encrypted?: string | null;
          is_active?: boolean;
          last_activity?: string;
          session_token: string;
          session_token_encrypted?: string | null;
          user_agent?: string | null;
          user_agent_encrypted?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          encryption_key_id?: string | null;
          expires_at?: string;
          id?: string;
          ip_address?: unknown;
          ip_address_encrypted?: string | null;
          is_active?: boolean;
          last_activity?: string;
          session_token?: string;
          session_token_encrypted?: string | null;
          user_agent?: string | null;
          user_agent_encrypted?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      venue_amenities: {
        Row: {
          category: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          slug: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          slug: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          slug?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      venue_categories: {
        Row: {
          color: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          slug: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          slug: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          slug?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      venue_checkins: {
        Row: {
          anonymized_at: string | null;
          approximate_only: boolean | null;
          auto_anonymize_after: string | null;
          checked_in_at: string;
          created_at: string;
          distance_meters: number | null;
          id: string;
          is_anonymized: boolean | null;
          is_public: boolean | null;
          latitude: number;
          location_precision: string | null;
          location_shared_with: Json | null;
          location_visibility: string | null;
          longitude: number;
          user_id: string;
          venue_id: string;
        };
        Insert: {
          anonymized_at?: string | null;
          approximate_only?: boolean | null;
          auto_anonymize_after?: string | null;
          checked_in_at?: string;
          created_at?: string;
          distance_meters?: number | null;
          id?: string;
          is_anonymized?: boolean | null;
          is_public?: boolean | null;
          latitude: number;
          location_precision?: string | null;
          location_shared_with?: Json | null;
          location_visibility?: string | null;
          longitude: number;
          user_id: string;
          venue_id: string;
        };
        Update: {
          anonymized_at?: string | null;
          approximate_only?: boolean | null;
          auto_anonymize_after?: string | null;
          checked_in_at?: string;
          created_at?: string;
          distance_meters?: number | null;
          id?: string;
          is_anonymized?: boolean | null;
          is_public?: boolean | null;
          latitude?: number;
          location_precision?: string | null;
          location_shared_with?: Json | null;
          location_visibility?: string | null;
          longitude?: number;
          user_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_checkins_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      venue_favorites: {
        Row: {
          created_at: string;
          id: string;
          user_id: string;
          venue_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          user_id: string;
          venue_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          user_id?: string;
          venue_id?: string;
        };
        Relationships: [];
      };
      venue_reviews: {
        Row: {
          content: string | null;
          created_at: string;
          helpful_count: number | null;
          id: string;
          rating: number;
          title: string | null;
          updated_at: string;
          user_id: string;
          venue_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          helpful_count?: number | null;
          id?: string;
          rating: number;
          title?: string | null;
          updated_at?: string;
          user_id: string;
          venue_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          helpful_count?: number | null;
          id?: string;
          rating?: number;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_reviews_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'venue_reviews_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'venue_reviews_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'venue_reviews_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      venue_services: {
        Row: {
          category: string | null;
          created_at: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean | null;
          name: string;
          slug: string;
          sort_order: number | null;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          slug: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          created_at?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          slug?: string;
          sort_order?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      venue_tag_assignments: {
        Row: {
          created_at: string;
          id: string;
          tag_id: string;
          venue_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          tag_id: string;
          venue_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          tag_id?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_tag_assignments_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      venues: {
        Row: {
          accessibility_attributes: string[] | null;
          accessibility_notes: string | null;
          address: string;
          amenities: string[] | null;
          category: string;
          city: string;
          city_id: string | null;
          country: string;
          country_id: string | null;
          created_at: string;
          created_by: string | null;
          data_source: string | null;
          description: string | null;
          email: string | null;
          external_id: string | null;
          featured: boolean | null;
          foursquare_data: Json | null;
          foursquare_id: string | null;
          foursquare_rating: number | null;
          geo_linked_at: string | null;
          hours: Json | null;
          id: string;
          images: string[] | null;
          instagram: string | null;
          last_synced_at: string | null;
          latitude: number | null;
          longitude: number | null;
          name: string;
          phone: string | null;
          postal_code: string | null;
          price_range: number | null;
          queer_village_id: string | null;
          services: string[] | null;
          state: string | null;
          sync_status: string | null;
          tags: string[] | null;
          target_groups: string[] | null;
          tomtom_data: Json | null;
          tomtom_id: string | null;
          tomtom_rating: number | null;
          tripadvisor_id: string | null;
          tripadvisor_rating: number | null;
          tripadvisor_review_count: number | null;
          updated_at: string;
          verified: boolean | null;
          website: string | null;
        };
        Insert: {
          accessibility_attributes?: string[] | null;
          accessibility_notes?: string | null;
          address: string;
          amenities?: string[] | null;
          category: string;
          city: string;
          city_id?: string | null;
          country?: string;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_source?: string | null;
          description?: string | null;
          email?: string | null;
          external_id?: string | null;
          featured?: boolean | null;
          foursquare_data?: Json | null;
          foursquare_id?: string | null;
          foursquare_rating?: number | null;
          geo_linked_at?: string | null;
          hours?: Json | null;
          id?: string;
          images?: string[] | null;
          instagram?: string | null;
          last_synced_at?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          phone?: string | null;
          postal_code?: string | null;
          price_range?: number | null;
          queer_village_id?: string | null;
          services?: string[] | null;
          state?: string | null;
          sync_status?: string | null;
          tags?: string[] | null;
          target_groups?: string[] | null;
          tomtom_data?: Json | null;
          tomtom_id?: string | null;
          tomtom_rating?: number | null;
          tripadvisor_id?: string | null;
          tripadvisor_rating?: number | null;
          tripadvisor_review_count?: number | null;
          updated_at?: string;
          verified?: boolean | null;
          website?: string | null;
        };
        Update: {
          accessibility_attributes?: string[] | null;
          accessibility_notes?: string | null;
          address?: string;
          amenities?: string[] | null;
          category?: string;
          city?: string;
          city_id?: string | null;
          country?: string;
          country_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_source?: string | null;
          description?: string | null;
          email?: string | null;
          external_id?: string | null;
          featured?: boolean | null;
          foursquare_data?: Json | null;
          foursquare_id?: string | null;
          foursquare_rating?: number | null;
          geo_linked_at?: string | null;
          hours?: Json | null;
          id?: string;
          images?: string[] | null;
          instagram?: string | null;
          last_synced_at?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          phone?: string | null;
          postal_code?: string | null;
          price_range?: number | null;
          queer_village_id?: string | null;
          services?: string[] | null;
          state?: string | null;
          sync_status?: string | null;
          tags?: string[] | null;
          target_groups?: string[] | null;
          tomtom_data?: Json | null;
          tomtom_id?: string | null;
          tomtom_rating?: number | null;
          tripadvisor_id?: string | null;
          tripadvisor_rating?: number | null;
          tripadvisor_review_count?: number | null;
          updated_at?: string;
          verified?: boolean | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'venues_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venues_country_id_fkey';
            columns: ['country_id'];
            isOneToOne: false;
            referencedRelation: 'countries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venues_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'venues_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'venues_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'safe_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'venues_queer_village_id_fkey';
            columns: ['queer_village_id'];
            isOneToOne: false;
            referencedRelation: 'queer_villages';
            referencedColumns: ['id'];
          },
        ];
      };
      video_processing_jobs: {
        Row: {
          completed_at: string | null;
          completed_renditions: number | null;
          created_at: string;
          current_stage: string | null;
          error_message: string | null;
          failed_renditions: number | null;
          id: string;
          processing_config: Json | null;
          progress_percent: number | null;
          results: Json | null;
          started_at: string | null;
          status: string;
          total_renditions: number | null;
          updated_at: string;
          video_id: string;
        };
        Insert: {
          completed_at?: string | null;
          completed_renditions?: number | null;
          created_at?: string;
          current_stage?: string | null;
          error_message?: string | null;
          failed_renditions?: number | null;
          id?: string;
          processing_config?: Json | null;
          progress_percent?: number | null;
          results?: Json | null;
          started_at?: string | null;
          status?: string;
          total_renditions?: number | null;
          updated_at?: string;
          video_id: string;
        };
        Update: {
          completed_at?: string | null;
          completed_renditions?: number | null;
          created_at?: string;
          current_stage?: string | null;
          error_message?: string | null;
          failed_renditions?: number | null;
          id?: string;
          processing_config?: Json | null;
          progress_percent?: number | null;
          results?: Json | null;
          started_at?: string | null;
          status?: string;
          total_renditions?: number | null;
          updated_at?: string;
          video_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'video_processing_jobs_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
      };
      video_renditions: {
        Row: {
          bitrate_kbps: number | null;
          codec: string;
          container: string;
          created_at: string;
          file_path: string;
          file_size: number | null;
          format: string;
          height: number | null;
          id: string;
          resolution: string;
          segment_count: number | null;
          video_id: string;
          width: number | null;
        };
        Insert: {
          bitrate_kbps?: number | null;
          codec: string;
          container: string;
          created_at?: string;
          file_path: string;
          file_size?: number | null;
          format: string;
          height?: number | null;
          id?: string;
          resolution: string;
          segment_count?: number | null;
          video_id: string;
          width?: number | null;
        };
        Update: {
          bitrate_kbps?: number | null;
          codec?: string;
          container?: string;
          created_at?: string;
          file_path?: string;
          file_size?: number | null;
          format?: string;
          height?: number | null;
          id?: string;
          resolution?: string;
          segment_count?: number | null;
          video_id?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'video_renditions_video_id_fkey';
            columns: ['video_id'];
            isOneToOne: false;
            referencedRelation: 'videos';
            referencedColumns: ['id'];
          },
        ];
      };
      videos: {
        Row: {
          captions_path: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          duration_seconds: number | null;
          id: string;
          metadata: Json | null;
          original_filename: string;
          original_height: number | null;
          original_size: number | null;
          original_width: number | null;
          poster_image_path: string | null;
          processing_job_id: string | null;
          status: string;
          storage_path: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          captions_path?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          id?: string;
          metadata?: Json | null;
          original_filename: string;
          original_height?: number | null;
          original_size?: number | null;
          original_width?: number | null;
          poster_image_path?: string | null;
          processing_job_id?: string | null;
          status?: string;
          storage_path: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          captions_path?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          id?: string;
          metadata?: Json | null;
          original_filename?: string;
          original_height?: number | null;
          original_size?: number | null;
          original_width?: number | null;
          poster_image_path?: string | null;
          processing_job_id?: string | null;
          status?: string;
          storage_path?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      workflow_definitions: {
        Row: {
          created_at: string | null;
          default_payload: Json | null;
          description: string | null;
          display_name: string | null;
          edge_function: string;
          id: string;
          is_enabled: boolean | null;
          max_concurrency: number | null;
          max_retries: number | null;
          name: string;
          priority: number | null;
          queue_name: string;
          retry_backoff_base: number | null;
          schedule: string | null;
          tags: string[] | null;
          timeout_seconds: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          default_payload?: Json | null;
          description?: string | null;
          display_name?: string | null;
          edge_function: string;
          id?: string;
          is_enabled?: boolean | null;
          max_concurrency?: number | null;
          max_retries?: number | null;
          name: string;
          priority?: number | null;
          queue_name: string;
          retry_backoff_base?: number | null;
          schedule?: string | null;
          tags?: string[] | null;
          timeout_seconds?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          default_payload?: Json | null;
          description?: string | null;
          display_name?: string | null;
          edge_function?: string;
          id?: string;
          is_enabled?: boolean | null;
          max_concurrency?: number | null;
          max_retries?: number | null;
          name?: string;
          priority?: number | null;
          queue_name?: string;
          retry_backoff_base?: number | null;
          schedule?: string | null;
          tags?: string[] | null;
          timeout_seconds?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      workflow_runs: {
        Row: {
          attempt: number | null;
          completed_at: string | null;
          created_at: string | null;
          definition_id: string | null;
          duration_ms: number | null;
          error_details: Json | null;
          error_message: string | null;
          id: string;
          idempotency_key: string | null;
          input_payload: Json | null;
          items_failed: number | null;
          items_processed: number | null;
          items_succeeded: number | null;
          items_total: number | null;
          max_attempts: number | null;
          next_retry_at: string | null;
          output_result: Json | null;
          pgmq_msg_id: number | null;
          progress_pct: number | null;
          queue_name: string;
          queued_at: string | null;
          started_at: string | null;
          status: string;
          triggered_by: string | null;
          updated_at: string | null;
          workflow_name: string;
        };
        Insert: {
          attempt?: number | null;
          completed_at?: string | null;
          created_at?: string | null;
          definition_id?: string | null;
          duration_ms?: number | null;
          error_details?: Json | null;
          error_message?: string | null;
          id?: string;
          idempotency_key?: string | null;
          input_payload?: Json | null;
          items_failed?: number | null;
          items_processed?: number | null;
          items_succeeded?: number | null;
          items_total?: number | null;
          max_attempts?: number | null;
          next_retry_at?: string | null;
          output_result?: Json | null;
          pgmq_msg_id?: number | null;
          progress_pct?: number | null;
          queue_name: string;
          queued_at?: string | null;
          started_at?: string | null;
          status?: string;
          triggered_by?: string | null;
          updated_at?: string | null;
          workflow_name: string;
        };
        Update: {
          attempt?: number | null;
          completed_at?: string | null;
          created_at?: string | null;
          definition_id?: string | null;
          duration_ms?: number | null;
          error_details?: Json | null;
          error_message?: string | null;
          id?: string;
          idempotency_key?: string | null;
          input_payload?: Json | null;
          items_failed?: number | null;
          items_processed?: number | null;
          items_succeeded?: number | null;
          items_total?: number | null;
          max_attempts?: number | null;
          next_retry_at?: string | null;
          output_result?: Json | null;
          pgmq_msg_id?: number | null;
          progress_pct?: number | null;
          queue_name?: string;
          queued_at?: string | null;
          started_at?: string | null;
          status?: string;
          triggered_by?: string | null;
          updated_at?: string | null;
          workflow_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workflow_runs_definition_id_fkey';
            columns: ['definition_id'];
            isOneToOne: false;
            referencedRelation: 'workflow_definitions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      events_public: {
        Row: {
          address: string | null;
          age_restriction: string | null;
          city: string | null;
          country: string | null;
          created_at: string | null;
          description: string | null;
          end_date: string | null;
          id: string | null;
          images: string[] | null;
          is_free: boolean | null;
          latitude: number | null;
          longitude: number | null;
          price_max: number | null;
          price_min: number | null;
          start_date: string | null;
          state: string | null;
          ticket_url: string | null;
          title: string | null;
          updated_at: string | null;
          venue_id: string | null;
          venue_name: string | null;
          website: string | null;
        };
        Insert: {
          address?: string | null;
          age_restriction?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string | null;
          images?: string[] | null;
          is_free?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          price_max?: number | null;
          price_min?: number | null;
          start_date?: string | null;
          state?: string | null;
          ticket_url?: string | null;
          title?: string | null;
          updated_at?: string | null;
          venue_id?: string | null;
          venue_name?: string | null;
          website?: string | null;
        };
        Update: {
          address?: string | null;
          age_restriction?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string | null;
          images?: string[] | null;
          is_free?: boolean | null;
          latitude?: number | null;
          longitude?: number | null;
          price_max?: number | null;
          price_min?: number | null;
          start_date?: string | null;
          state?: string | null;
          ticket_url?: string | null;
          title?: string | null;
          updated_at?: string | null;
          venue_id?: string | null;
          venue_name?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'events_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      public_profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          display_name: string | null;
          gender_identity: string | null;
          location: string | null;
          pronouns: string | null;
          sexual_orientation: string | null;
          social_links: Json | null;
          user_id: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: never;
          display_name?: string | null;
          gender_identity?: never;
          location?: never;
          pronouns?: never;
          sexual_orientation?: never;
          social_links?: Json | null;
          user_id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: never;
          display_name?: string | null;
          gender_identity?: never;
          location?: never;
          pronouns?: never;
          sexual_orientation?: never;
          social_links?: Json | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      safe_profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          display_name: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          display_name?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      tags_with_categories: {
        Row: {
          categories: Json | null;
          category: string | null;
          category_id: string | null;
          color: string | null;
          created_at: string | null;
          deprecated_at: string | null;
          deprecation_reason: string | null;
          description: string | null;
          id: string | null;
          image_url: string | null;
          merged_into_id: string | null;
          name: string | null;
          slug: string | null;
          status: string | null;
          updated_at: string | null;
          usage_count: number | null;
          wikipedia_url: string | null;
        };
        Insert: {
          categories?: never;
          category?: string | null;
          category_id?: string | null;
          color?: string | null;
          created_at?: string | null;
          deprecated_at?: string | null;
          deprecation_reason?: string | null;
          description?: string | null;
          id?: string | null;
          image_url?: string | null;
          merged_into_id?: string | null;
          name?: string | null;
          slug?: string | null;
          status?: string | null;
          updated_at?: string | null;
          usage_count?: number | null;
          wikipedia_url?: string | null;
        };
        Update: {
          categories?: never;
          category?: string | null;
          category_id?: string | null;
          color?: string | null;
          created_at?: string | null;
          deprecated_at?: string | null;
          deprecation_reason?: string | null;
          description?: string | null;
          id?: string | null;
          image_url?: string | null;
          merged_into_id?: string | null;
          name?: string | null;
          slug?: string | null;
          status?: string | null;
          updated_at?: string | null;
          usage_count?: number | null;
          wikipedia_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'unified_tags_merged_into_id_fkey';
            columns: ['merged_into_id'];
            isOneToOne: false;
            referencedRelation: 'tags_with_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'unified_tags_merged_into_id_fkey';
            columns: ['merged_into_id'];
            isOneToOne: false;
            referencedRelation: 'unified_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      venue_checkin_stats: {
        Row: {
          activity_level: string | null;
          days_with_checkins: number | null;
          last_checkin: string | null;
          total_checkins: number | null;
          venue_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'venue_checkins_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      add_tag_to_category: {
        Args: {
          p_category_id: string;
          p_is_primary?: boolean;
          p_tag_id: string;
        };
        Returns: undefined;
      };
      anonymize_location_data: {
        Args: { p_days_old?: number };
        Returns: number;
      };
      apply_content_change: { Args: { p_change_id: string }; Returns: boolean };
      approve_tag_suggestions: {
        Args: { p_reviewer_id?: string; p_suggestion_ids: string[] };
        Returns: number;
      };
      assign_user_role: {
        Args: { role_name: string; user_id: string };
        Returns: boolean;
      };
      audit_admin_data_access: {
        Args: {
          p_admin_id: string;
          p_data_type: string;
          p_justification: string;
          p_target_user_id: string;
        };
        Returns: boolean;
      };
      audit_admin_sensitive_access: {
        Args: {
          p_admin_id: string;
          p_data_type: string;
          p_justification: string;
          p_target_user_id: string;
        };
        Returns: boolean;
      };
      auto_clean_all_duplicates:
        | {
            Args: {
              p_auto_merge_threshold?: number;
              p_dry_run?: boolean;
              p_entity_types?: string[];
              p_limit?: number;
              p_review_threshold?: number;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_auto_merge_threshold?: number;
              p_dry_run?: boolean;
              p_entity_types?: string[];
              p_limit?: number;
              p_offset?: number;
              p_review_threshold?: number;
              p_scan_only?: boolean;
            };
            Returns: Json;
          };
      auto_clean_merge_duplicates: {
        Args: { dry_run?: boolean; near_dupe_threshold?: number };
        Returns: Json;
      };
      auto_remove_broken_link: { Args: { link_id: string }; Returns: undefined };
      basic_rate_limit: {
        Args: { identifier: string; max_attempts?: number };
        Returns: boolean;
      };
      batch_find_duplicates: {
        Args: { p_batch_limit?: number; p_target_table?: string };
        Returns: Json;
      };
      batch_match_tag_embeddings: {
        Args: {
          p_content_ids: string[];
          p_content_type: string;
          p_match_count?: number;
          p_match_threshold?: number;
        };
        Returns: {
          content_id: string;
          similarity: number;
          tag_id: string;
          tag_name: string;
        }[];
      };
      bulk_apply_batch_changes:
        | {
            Args: { p_batch_id: string };
            Returns: {
              error: true;
            } & 'Could not choose the best candidate function between: public.bulk_apply_batch_changes(p_batch_id => text), public.bulk_apply_batch_changes(p_batch_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved';
          }
        | {
            Args: { p_batch_id: string };
            Returns: {
              error: true;
            } & 'Could not choose the best candidate function between: public.bulk_apply_batch_changes(p_batch_id => text), public.bulk_apply_batch_changes(p_batch_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved';
          };
      bulk_apply_content_changes: {
        Args: { p_change_ids: string[] };
        Returns: number;
      };
      calculate_secure_venue_distance: {
        Args: { user_lat: number; user_lng: number; venue_id: string };
        Returns: number;
      };
      can_view_sensitive_profile_data: {
        Args: {
          privacy_field?: string;
          profile_user_id: string;
          requesting_user_id: string;
        };
        Returns: boolean;
      };
      check_financial_data_access: {
        Args: {
          p_admin_user_id: string;
          p_justification: string;
          p_user_id: string;
        };
        Returns: boolean;
      };
      check_mailbox_availability: { Args: { p_address: string }; Returns: Json };
      check_rate_limit_enhanced: {
        Args: {
          action_type?: string;
          identifier: string;
          max_attempts?: number;
          time_window_minutes?: number;
        };
        Returns: boolean;
      };
      clean_old_rate_limits: { Args: never; Returns: undefined };
      clean_staging_duplicates: {
        Args: { p_dry_run?: boolean; p_skip_threshold?: number };
        Returns: Json;
      };
      compute_tag_similarities: { Args: never; Returns: Json };
      create_notification: {
        Args: { data?: Json; message: string; type: string; user_id: string };
        Returns: string;
      };
      create_tag_relationships_table_if_not_exists: {
        Args: never;
        Returns: undefined;
      };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      decrement_comment_likes: {
        Args: { comment_id: string };
        Returns: undefined;
      };
      decrement_post_likes: { Args: { post_id: string }; Returns: undefined };
      detect_near_duplicate_tags: {
        Args: { min_sim?: number };
        Returns: {
          sim: number;
          tag_a_category: string;
          tag_a_name: string;
          tag_b_category: string;
          tag_b_name: string;
        }[];
      };
      find_city_duplicates: {
        Args: {
          p_country_id?: string;
          p_latitude?: number;
          p_longitude?: number;
          p_name: string;
          p_threshold?: number;
        };
        Returns: {
          city_id: string;
          city_name: string;
          combined_score: number;
          geo_distance_km: number;
          name_similarity: number;
          same_country: boolean;
        }[];
      };
      find_event_duplicates: {
        Args: { p_city?: string; p_start_date: string; p_title: string };
        Returns: {
          city_match: boolean;
          combined_score: number;
          date_diff_hours: number;
          event_id: string;
          event_title: string;
          title_similarity: number;
        }[];
      };
      find_nearest_airport: {
        Args: { visitor_lat: number; visitor_lng: number };
        Returns: {
          city_name: string;
          country_code: string;
          distance_km: number;
          iata_code: string;
        }[];
      };
      find_news_duplicates: {
        Args: {
          p_published_at?: string;
          p_source_id?: string;
          p_threshold?: number;
          p_title: string;
        };
        Returns: {
          article_id: string;
          article_title: string;
          combined_score: number;
          date_diff_hours: number;
          same_source: boolean;
          title_similarity: number;
        }[];
      };
      find_personality_duplicates: {
        Args: { p_name: string; p_threshold?: number };
        Returns: {
          name_similarity: number;
          personality_id: string;
          personality_name: string;
        }[];
      };
      find_queer_village: {
        Args: { p_city_id?: string; p_lat: number; p_lng: number };
        Returns: {
          match_type: string;
          village_id: string;
          village_name: string;
        }[];
      };
      find_venue_duplicates: {
        Args: {
          p_category?: string;
          p_latitude: number;
          p_longitude: number;
          p_name: string;
          p_threshold?: number;
        };
        Returns: {
          category_match: boolean;
          combined_score: number;
          geo_distance_m: number;
          name_similarity: number;
          venue_id: string;
          venue_name: string;
        }[];
      };
      fix_missing_junction_entries: { Args: never; Returns: number };
      get_automation_stats: { Args: never; Returns: Json };
      get_broken_marketplace_ids: { Args: never; Returns: string[] };
      get_category_ancestors: {
        Args: { p_category_id: string };
        Returns: {
          id: string;
          level: number;
          name: string;
          slug: string;
        }[];
      };
      get_category_tree: { Args: { p_parent_id?: string }; Returns: Json };
      get_entity_attributes: {
        Args: { entity_id_param: string; entity_type_param: string };
        Returns: {
          attribute_category: string;
          attribute_description: string;
          attribute_icon: string;
          attribute_id: string;
          attribute_name: string;
        }[];
      };
      get_entity_tags: {
        Args: { entity_id_param: string; entity_type_param: string };
        Returns: {
          tag_category: string;
          tag_description: string;
          tag_id: string;
          tag_name: string;
        }[];
      };
      get_import_statistics: { Args: never; Returns: Json };
      get_inbox_counts: { Args: { p_user_id: string }; Returns: Json };
      get_link_health_stats: { Args: never; Returns: Json };
      get_links_due_for_recheck: {
        Args: { batch_limit?: number };
        Returns: {
          auto_removed_at: string | null;
          check_count: number;
          cleaned_url: string | null;
          content_id: string;
          content_type: string;
          created_at: string;
          field_name: string;
          final_url: string | null;
          http_status: number | null;
          id: string;
          is_scraped_source: boolean | null;
          is_social: boolean | null;
          last_checked_at: string | null;
          original_url: string;
          scan_brands: string[] | null;
          scan_categories: string[] | null;
          scan_id: string | null;
          scan_score: number | null;
          scan_screenshot_url: string | null;
          scan_verdict: string | null;
          scanned_at: string | null;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'content_links';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_news_cron_status: {
        Args: never;
        Returns: {
          job_name: string;
          last_run: string;
          next_run: string;
          status: string;
        }[];
      };
      get_or_create_direct_conversation: {
        Args: { user1_id: string; user2_id: string };
        Returns: string;
      };
      get_public_profile_safe: {
        Args: { target_user_id: string };
        Returns: Json;
      };
      get_secure_profile_data: {
        Args: { target_user_id: string };
        Returns: Json;
      };
      get_secure_venue_checkins: { Args: { venue_id: string }; Returns: Json };
      get_similar_personalities: {
        Args: {
          min_similarity?: number;
          personality_uuid: string;
          result_limit?: number;
        };
        Returns: {
          birth_date: string;
          death_date: string;
          description: string;
          id: string;
          image_url: string;
          is_living: boolean;
          name: string;
          nationality: string;
          profession: string;
          similarity: number;
        }[];
      };
      get_similar_tags: {
        Args: { p_limit?: number; p_min_score?: number; p_tag_id: string };
        Returns: {
          category_color: string;
          category_name: string;
          relationship_type: string;
          similarity_score: number;
          tag_id: string;
          tag_name: string;
          tag_slug: string;
          usage_count: number;
        }[];
      };
      get_staging_page: {
        Args: {
          p_dedup_status?: string;
          p_page?: number;
          p_per_page?: number;
          p_review_status?: string;
          p_search?: string;
          p_sort_dir?: string;
          p_sort_field?: string;
          p_target_table?: string;
        };
        Returns: Json;
      };
      get_subcategories: {
        Args: { p_parent_id: string };
        Returns: {
          color: string;
          description: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          tag_count: number;
        }[];
      };
      get_table_policies:
        | {
            Args: { p_schema_name: string; p_table_name: string };
            Returns: {
              policy_cmd: string;
              policy_name: string;
              policy_qual: string;
              policy_roles: string[];
              policy_with_check: string;
            }[];
          }
        | {
            Args: { table_name_param: string };
            Returns: {
              command: string;
              policy_name: string;
              role_name: string;
              using_expr: string;
              with_check_expr: string;
            }[];
          };
      get_tag_categories: {
        Args: { p_tag_id: string };
        Returns: {
          category_id: string;
          category_name: string;
          is_primary: boolean;
        }[];
      };
      get_tag_graph_data: {
        Args: { p_category_filter?: string; p_min_score?: number };
        Returns: Json;
      };
      get_tag_linked_content: {
        Args: {
          p_limit?: number;
          p_tag_id: string;
          p_tag_name: string;
          p_tag_slug: string;
        };
        Returns: Json;
      };
      get_user_conversation_ids: {
        Args: { user_id_param?: string };
        Returns: {
          conversation_id: string;
        }[];
      };
      get_venues_by_tag: {
        Args: { max_results?: number; tag_values: string[] };
        Returns: {
          accessibility_attributes: string[] | null;
          accessibility_notes: string | null;
          address: string;
          amenities: string[] | null;
          category: string;
          city: string;
          city_id: string | null;
          country: string;
          country_id: string | null;
          created_at: string;
          created_by: string | null;
          data_source: string | null;
          description: string | null;
          email: string | null;
          external_id: string | null;
          featured: boolean | null;
          foursquare_data: Json | null;
          foursquare_id: string | null;
          foursquare_rating: number | null;
          geo_linked_at: string | null;
          hours: Json | null;
          id: string;
          images: string[] | null;
          instagram: string | null;
          last_synced_at: string | null;
          latitude: number | null;
          longitude: number | null;
          name: string;
          phone: string | null;
          postal_code: string | null;
          price_range: number | null;
          queer_village_id: string | null;
          services: string[] | null;
          state: string | null;
          sync_status: string | null;
          tags: string[] | null;
          target_groups: string[] | null;
          tomtom_data: Json | null;
          tomtom_id: string | null;
          tomtom_rating: number | null;
          tripadvisor_id: string | null;
          tripadvisor_rating: number | null;
          tripadvisor_review_count: number | null;
          updated_at: string;
          verified: boolean | null;
          website: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'venues';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      has_any_role_jwt: {
        Args: { required_roles: Database['public']['Enums']['app_role'][] };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database['public']['Enums']['app_role'];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_role_jwt: {
        Args: { required_role: Database['public']['Enums']['app_role'] };
        Returns: boolean;
      };
      increment_article_views: {
        Args: { article_id: string };
        Returns: undefined;
      };
      increment_automation_counters: {
        Args: {
          p_applied?: number;
          p_module_id: string;
          p_proposed?: number;
          p_runs?: number;
        };
        Returns: undefined;
      };
      increment_comment_likes: {
        Args: { comment_id: string };
        Returns: undefined;
      };
      increment_listing_views: {
        Args: { listing_id: string };
        Returns: undefined;
      };
      increment_personality_views: {
        Args: { personality_id: string };
        Returns: undefined;
      };
      increment_post_comments: { Args: { post_id: string }; Returns: undefined };
      increment_post_likes: { Args: { post_id: string }; Returns: undefined };
      is_admin: { Args: { user_id: string }; Returns: boolean };
      is_group_admin: {
        Args: { group_id: string; user_id: string };
        Returns: boolean;
      };
      jwt_claim: { Args: { claim: string }; Returns: string };
      log_security_event: {
        Args: {
          p_event_type: string;
          p_metadata?: Json;
          p_severity?: string;
          p_user_id?: string;
        };
        Returns: string;
      };
      log_sensitive_data_access: {
        Args: {
          p_access_method?: string;
          p_data_type: string;
          p_target_user_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      lookup_mailbox_user: { Args: { p_address: string }; Returns: string };
      match_content_embeddings: {
        Args: {
          match_count?: number;
          query_embedding: string;
          similarity_threshold?: number;
        };
        Returns: {
          content_id: string;
          content_text: string;
          content_type: string;
          metadata: Json;
          similarity: number;
        }[];
      };
      merge_entities: {
        Args: {
          p_entity_type: string;
          p_keep_id: string;
          p_merged_data?: Json;
          p_remove_id: string;
        };
        Returns: Json;
      };
      merge_tag: {
        Args: { canonical_tag_id: string; source_tag_id: string };
        Returns: undefined;
      };
      optimize_auth_uid_in_policies: {
        Args: never;
        Returns: {
          optimization_applied: string;
          performance_impact: string;
          policy_name: string;
          table_name: string;
        }[];
      };
      optimize_auth_uid_in_policy: {
        Args: {
          p_policy_name: string;
          p_schema_name: string;
          p_table_name: string;
        };
        Returns: string;
      };
      pgmq_archive: {
        Args: { p_msg_id: number; p_queue: string };
        Returns: boolean;
      };
      pgmq_delete: {
        Args: { p_msg_id: number; p_queue: string };
        Returns: boolean;
      };
      pgmq_metrics: {
        Args: { p_queue: string };
        Returns: {
          newest_msg_age_sec: number;
          oldest_msg_age_sec: number;
          queue_length: number;
          queue_name: string;
          total_messages: number;
        }[];
      };
      pgmq_metrics_all: {
        Args: never;
        Returns: {
          newest_msg_age_sec: number;
          oldest_msg_age_sec: number;
          queue_length: number;
          queue_name: string;
          total_messages: number;
        }[];
      };
      pgmq_read: {
        Args: { p_qty: number; p_queue: string; p_vt: number };
        Returns: {
          enqueued_at: string;
          message: Json;
          msg_id: number;
          read_ct: number;
          vt: string;
        }[];
      };
      pgmq_send: {
        Args: { p_delay?: number; p_msg: Json; p_queue: string };
        Returns: number;
      };
      pgmq_send_batch: {
        Args: { p_delay?: number; p_msgs: Json[]; p_queue: string };
        Returns: number[];
      };
      pgmq_set_vt: {
        Args: { p_msg_id: number; p_queue: string; vt_seconds: number };
        Returns: {
          enqueued_at: string;
          message: Json;
          msg_id: number;
          read_ct: number;
          vt: string;
        }[];
      };
      record_redirect_click: {
        Args: {
          p_country?: string;
          p_ip_hash?: string;
          p_path: string;
          p_query?: string;
          p_redirect_id: string;
          p_referer?: string;
          p_status?: number;
          p_user_agent?: string;
        };
        Returns: undefined;
      };
      refresh_dashboard_stats: { Args: never; Returns: undefined };
      remove_tag_from_category: {
        Args: { p_category_id: string; p_tag_id: string };
        Returns: undefined;
      };
      resolve_city_and_country: {
        Args: { p_city_name: string; p_country_name: string };
        Returns: {
          city_found: boolean;
          country_found: boolean;
          resolved_city_id: string;
          resolved_city_name: string;
          resolved_country_id: string;
          resolved_country_name: string;
        }[];
      };
      resolve_path_redirect: {
        Args: { p_path: string };
        Returns: {
          click_count: number;
          click_limit: number;
          id: string;
          match_kind: Database['public']['Enums']['redirect_match_kind'];
          preserve_query: boolean;
          query_mode: Database['public']['Enums']['redirect_query_mode'];
          query_override: Json;
          source_path: string;
          status_code: number;
          target: string;
          utm_defaults: Json;
        }[];
      };
      resolve_short_redirect: {
        Args: { p_slug: string };
        Returns: {
          click_count: number;
          click_limit: number;
          id: string;
          preserve_query: boolean;
          query_mode: Database['public']['Enums']['redirect_query_mode'];
          query_override: Json;
          slug: string;
          status_code: number;
          target: string;
          utm_defaults: Json;
        }[];
      };
      resolve_tag: {
        Args: { input_slug: string };
        Returns: {
          is_redirect: boolean;
          tag_id: string;
          tag_name: string;
          tag_slug: string;
        }[];
      };
      revert_content_change: { Args: { p_change_id: string }; Returns: boolean };
      scan_table_duplicates:
        | {
            Args: {
              p_entity_type: string;
              p_limit?: number;
              p_threshold?: number;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_entity_type: string;
              p_limit?: number;
              p_offset?: number;
              p_threshold?: number;
            };
            Returns: Json;
          };
      schedule_location_anonymization: { Args: never; Returns: undefined };
      secure_passkey_access: {
        Args: { p_operation: string; p_user_id: string };
        Returns: boolean;
      };
      tag_hygiene_report: {
        Args: never;
        Returns: {
          issue_count: number;
          issue_type: string;
          sample_items: string;
        }[];
      };
      universal_search: {
        Args: {
          category_filter?: string;
          content_types?: string[];
          featured_only?: boolean;
          geo_lat?: number;
          geo_lng?: number;
          location_filter?: string;
          radius_km?: number;
          result_limit?: number;
          search_query: string;
        };
        Returns: {
          content_type: string;
          description: string;
          featured: boolean;
          id: string;
          image_url: string;
          latitude: number;
          longitude: number;
          relevance_score: number;
          similarity_score: number;
          slug: string;
          subtitle: string;
          title: string;
        }[];
      };
      validate_content_security: {
        Args: { content_text: string; content_type?: string };
        Returns: Json;
      };
      validate_file_upload: {
        Args: { file_name: string; file_size: number; mime_type: string };
        Returns: Json;
      };
      validate_import_data: { Args: { data: Json }; Returns: boolean };
      validate_password_enhanced: {
        Args: { password_text: string };
        Returns: Json;
      };
      validate_profile_access: {
        Args: {
          access_type?: string;
          profile_user_id: string;
          requesting_user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: 'admin' | 'moderator' | 'user' | 'editor';
      cms_content_type:
        | 'event'
        | 'space'
        | 'place'
        | 'market'
        | 'resource'
        | 'community'
        | 'news'
        | 'page'
        | 'personality';
      cms_media_role: 'cover' | 'gallery' | 'attachment' | 'avatar' | 'thumbnail';
      cms_visibility_level: 'public' | 'private' | 'restricted';
      cms_workflow_state: 'draft' | 'review' | 'published' | 'archived';
      redirect_match_kind: 'EXACT' | 'WILDCARD' | 'REGEX';
      redirect_query_mode: 'PRESERVE' | 'DROP' | 'OVERRIDE';
      redirect_type: 'SHORT' | 'PATH';
      user_mode: 'dating' | 'friends' | 'exploration' | 'fun' | 'networking' | 'community';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ['admin', 'moderator', 'user', 'editor'],
      cms_content_type: [
        'event',
        'space',
        'place',
        'market',
        'resource',
        'community',
        'news',
        'page',
        'personality',
      ],
      cms_media_role: ['cover', 'gallery', 'attachment', 'avatar', 'thumbnail'],
      cms_visibility_level: ['public', 'private', 'restricted'],
      cms_workflow_state: ['draft', 'review', 'published', 'archived'],
      redirect_match_kind: ['EXACT', 'WILDCARD', 'REGEX'],
      redirect_query_mode: ['PRESERVE', 'DROP', 'OVERRIDE'],
      redirect_type: ['SHORT', 'PATH'],
      user_mode: ['dating', 'friends', 'exploration', 'fun', 'networking', 'community'],
    },
  },
} as const;
