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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_config: {
        Row: {
          agent_enabled: boolean
          agent_name: string
          audio_enabled: boolean
          base_instruction: string
          catalog_in_prompt: boolean
          catalog_only_relevant: boolean
          company_info: Json
          faqs: Json
          how_it_works: string
          main_offer: string
          modules: Json
          modules_enabled: Json
          never_offer_first: boolean
          panel_link: string | null
          panel_screenshot_desktop_url: string | null
          panel_screenshot_mobile_url: string | null
          panel_screenshots_desktop: Json
          panel_screenshots_mobile: Json
          price_query_instruction: string
          response_delay_max_sec: number
          response_delay_min_sec: number
          script_ativo: string
          script_frio: string
          script_inativo: string
          send_panel_on_price: boolean
          services_realtime: boolean
          tone: string
          typing_indicator_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_enabled?: boolean
          agent_name?: string
          audio_enabled?: boolean
          base_instruction?: string
          catalog_in_prompt?: boolean
          catalog_only_relevant?: boolean
          company_info?: Json
          faqs?: Json
          how_it_works?: string
          main_offer?: string
          modules?: Json
          modules_enabled?: Json
          never_offer_first?: boolean
          panel_link?: string | null
          panel_screenshot_desktop_url?: string | null
          panel_screenshot_mobile_url?: string | null
          panel_screenshots_desktop?: Json
          panel_screenshots_mobile?: Json
          price_query_instruction?: string
          response_delay_max_sec?: number
          response_delay_min_sec?: number
          script_ativo?: string
          script_frio?: string
          script_inativo?: string
          send_panel_on_price?: boolean
          services_realtime?: boolean
          tone?: string
          typing_indicator_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_enabled?: boolean
          agent_name?: string
          audio_enabled?: boolean
          base_instruction?: string
          catalog_in_prompt?: boolean
          catalog_only_relevant?: boolean
          company_info?: Json
          faqs?: Json
          how_it_works?: string
          main_offer?: string
          modules?: Json
          modules_enabled?: Json
          never_offer_first?: boolean
          panel_link?: string | null
          panel_screenshot_desktop_url?: string | null
          panel_screenshot_mobile_url?: string | null
          panel_screenshots_desktop?: Json
          panel_screenshots_mobile?: Json
          price_query_instruction?: string
          response_delay_max_sec?: number
          response_delay_min_sec?: number
          script_ativo?: string
          script_frio?: string
          script_inativo?: string
          send_panel_on_price?: boolean
          services_realtime?: boolean
          tone?: string
          typing_indicator_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          level: string
          metadata: Json | null
          phone: string | null
          prompt: string | null
          response: string | null
          summary: string
          type: string
          user_id: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          level?: string
          metadata?: Json | null
          phone?: string | null
          prompt?: string | null
          response?: string | null
          summary: string
          type: string
          user_id?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          level?: string
          metadata?: Json | null
          phone?: string | null
          prompt?: string | null
          response?: string | null
          summary?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      auto_campaign_runs: {
        Row: {
          auto_campaign_id: string
          campaign_key: string
          contact_id: string
          error: string | null
          id: string
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          auto_campaign_id: string
          campaign_key: string
          contact_id: string
          error?: string | null
          id?: string
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          auto_campaign_id?: string
          campaign_key?: string
          contact_id?: string
          error?: string | null
          id?: string
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_campaign_runs_auto_campaign_id_fkey"
            columns: ["auto_campaign_id"]
            isOneToOne: false
            referencedRelation: "auto_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_campaign_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_campaigns: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          key: string
          message_template: string
          name: string
          trigger_hours: number
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          message_template: string
          name: string
          trigger_hours?: number
          trigger_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          message_template?: string
          name?: string
          trigger_hours?: number
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_logs: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          contact_name: string
          created_at: string
          id: string
          message_preview: string
          status: Database["public"]["Enums"]["log_status"]
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          contact_name: string
          created_at?: string
          id?: string
          message_preview: string
          status: Database["public"]["Enums"]["log_status"]
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          id?: string
          message_preview?: string
          status?: Database["public"]["Enums"]["log_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          daily_volume: number
          end_time: string
          id: string
          interval_minutes: number
          start_time: string
          state: Database["public"]["Enums"]["campaign_state"]
          target_profile: Database["public"]["Enums"]["contact_profile"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_volume?: number
          end_time?: string
          id?: string
          interval_minutes?: number
          start_time?: string
          state?: Database["public"]["Enums"]["campaign_state"]
          target_profile: Database["public"]["Enums"]["contact_profile"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_volume?: number
          end_time?: string
          id?: string
          interval_minutes?: number
          start_time?: string
          state?: Database["public"]["Enums"]["campaign_state"]
          target_profile?: Database["public"]["Enums"]["contact_profile"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalog_cache: {
        Row: {
          categoria: string
          created_at: string
          id: string
          maximo: number
          minimo: number
          nome: string
          preco_por_1000: number
          service_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          id?: string
          maximo?: number
          minimo?: number
          nome?: string
          preco_por_1000?: number
          service_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          maximo?: number
          minimo?: number
          nome?: string
          preco_por_1000?: number
          service_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          follow_up_count: number
          id: string
          last_interaction_at: string | null
          last_purchase_at: string | null
          nome: string
          perfil: Database["public"]["Enums"]["contact_profile"]
          photo_url: string | null
          source: string
          source_data: Json | null
          source_headline: string | null
          source_ref: string | null
          source_url: string | null
          status: Database["public"]["Enums"]["contact_status"]
          telefone: string
          temperatura: Database["public"]["Enums"]["contact_temperatura"]
          temperatura_updated_at: string | null
          updated_at: string
          user_id: string
          whatsapp_number_id: string | null
        }
        Insert: {
          created_at?: string
          follow_up_count?: number
          id?: string
          last_interaction_at?: string | null
          last_purchase_at?: string | null
          nome: string
          perfil?: Database["public"]["Enums"]["contact_profile"]
          photo_url?: string | null
          source?: string
          source_data?: Json | null
          source_headline?: string | null
          source_ref?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          telefone: string
          temperatura?: Database["public"]["Enums"]["contact_temperatura"]
          temperatura_updated_at?: string | null
          updated_at?: string
          user_id: string
          whatsapp_number_id?: string | null
        }
        Update: {
          created_at?: string
          follow_up_count?: number
          id?: string
          last_interaction_at?: string | null
          last_purchase_at?: string | null
          nome?: string
          perfil?: Database["public"]["Enums"]["contact_profile"]
          photo_url?: string | null
          source?: string
          source_data?: Json | null
          source_headline?: string | null
          source_ref?: string | null
          source_url?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          telefone?: string
          temperatura?: Database["public"]["Enums"]["contact_temperatura"]
          temperatura_updated_at?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agent_enabled: boolean
          auto_paused_at: string | null
          contact_id: string
          created_at: string
          id: string
          internal_note: string | null
          last_message_at: string | null
          last_message_preview: string | null
          needs_review: boolean
          review_reason: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          updated_at: string
          user_id: string
          whatsapp_number_id: string | null
        }
        Insert: {
          agent_enabled?: boolean
          auto_paused_at?: string | null
          contact_id: string
          created_at?: string
          id?: string
          internal_note?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          needs_review?: boolean
          review_reason?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          updated_at?: string
          user_id: string
          whatsapp_number_id?: string | null
        }
        Update: {
          agent_enabled?: boolean
          auto_paused_at?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          internal_note?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          needs_review?: boolean
          review_reason?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          updated_at?: string
          user_id?: string
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_logs: {
        Row: {
          already_existed: number
          created_at: string
          error: string | null
          id: string
          new_imported: number
          status: string
          total_found: number
          user_id: string
          whatsapp_number_id: string | null
        }
        Insert: {
          already_existed?: number
          created_at?: string
          error?: string | null
          id?: string
          new_imported?: number
          status?: string
          total_found?: number
          user_id: string
          whatsapp_number_id?: string | null
        }
        Update: {
          already_existed?: number
          created_at?: string
          error?: string | null
          id?: string
          new_imported?: number
          status?: string
          total_found?: number
          user_id?: string
          whatsapp_number_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_logs_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      forbidden_rules: {
        Row: {
          created_at: string
          deflection: string | null
          enabled: boolean
          id: string
          position: number
          rule: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deflection?: string | null
          enabled?: boolean
          id?: string
          position?: number
          rule: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deflection?: string | null
          enabled?: boolean
          id?: string
          position?: number
          rule?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      free_test_services: {
        Row: {
          category: string
          created_at: string
          enabled: boolean
          id: string
          quantity: number
          service_id: string
          service_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          enabled?: boolean
          id?: string
          quantity?: number
          service_id: string
          service_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          enabled?: boolean
          id?: string
          quantity?: number
          service_id?: string
          service_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      free_trials: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          criado_em: string
          followup_sent_at: string | null
          id: string
          last_checked_at: string | null
          link_enviado: string
          link_normalized: string | null
          notified_completed: boolean
          notified_completed_at: string | null
          order_id: string | null
          quantidade: number
          raw_response: Json | null
          servico: string | null
          start_count: number | null
          status: string
          telefone: string
          updated_at: string
          upsell_offered: boolean
          user_id: string
          views_atuais: number | null
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          criado_em?: string
          followup_sent_at?: string | null
          id?: string
          last_checked_at?: string | null
          link_enviado: string
          link_normalized?: string | null
          notified_completed?: boolean
          notified_completed_at?: string | null
          order_id?: string | null
          quantidade?: number
          raw_response?: Json | null
          servico?: string | null
          start_count?: number | null
          status?: string
          telefone: string
          updated_at?: string
          upsell_offered?: boolean
          user_id: string
          views_atuais?: number | null
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          criado_em?: string
          followup_sent_at?: string | null
          id?: string
          last_checked_at?: string | null
          link_enviado?: string
          link_normalized?: string | null
          notified_completed?: boolean
          notified_completed_at?: string | null
          order_id?: string | null
          quantidade?: number
          raw_response?: Json | null
          servico?: string | null
          start_count?: number | null
          status?: string
          telefone?: string
          updated_at?: string
          upsell_offered?: boolean
          user_id?: string
          views_atuais?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "free_trials_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_trials_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          anthropic_api_key: string | null
          elevenlabs_api_key: string | null
          elevenlabs_voice_id: string | null
          free_trial_enabled: boolean
          openai_api_key: string | null
          smm_api_key: string | null
          smm_last_sync_at: string | null
          smm_last_sync_count: number | null
          smm_last_sync_error: string | null
          smm_panel_url: string | null
          smm_service_id: string | null
          uazapi_admin_token: string | null
          uazapi_token: string | null
          uazapi_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anthropic_api_key?: string | null
          elevenlabs_api_key?: string | null
          elevenlabs_voice_id?: string | null
          free_trial_enabled?: boolean
          openai_api_key?: string | null
          smm_api_key?: string | null
          smm_last_sync_at?: string | null
          smm_last_sync_count?: number | null
          smm_last_sync_error?: string | null
          smm_panel_url?: string | null
          smm_service_id?: string | null
          uazapi_admin_token?: string | null
          uazapi_token?: string | null
          uazapi_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anthropic_api_key?: string | null
          elevenlabs_api_key?: string | null
          elevenlabs_voice_id?: string | null
          free_trial_enabled?: boolean
          openai_api_key?: string | null
          smm_api_key?: string | null
          smm_last_sync_at?: string | null
          smm_last_sync_count?: number | null
          smm_last_sync_error?: string | null
          smm_panel_url?: string | null
          smm_service_id?: string | null
          uazapi_admin_token?: string | null
          uazapi_token?: string | null
          uazapi_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          content: string
          context: string | null
          created_at: string
          id: string
          image_url: string | null
          kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          context?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          context?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          audio_url: string | null
          body: string
          conversation_id: string
          created_at: string
          external_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          sender: Database["public"]["Enums"]["message_sender"]
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          body: string
          conversation_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          sender: Database["public"]["Enums"]["message_sender"]
          user_id: string
        }
        Update: {
          audio_url?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          sender?: Database["public"]["Enums"]["message_sender"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      panel_guide: {
        Row: {
          created_at: string
          description: string | null
          extracted_content: string | null
          id: string
          image_url: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          extracted_content?: string | null
          id?: string
          image_url: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          extracted_content?: string | null
          id?: string
          image_url?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      processed_messages: {
        Row: {
          message_id: string
          processed_at: string
        }
        Insert: {
          message_id: string
          processed_at?: string
        }
        Update: {
          message_id?: string
          processed_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_modules: {
        Row: {
          conteudo: string
          created_at: string
          enabled: boolean
          id: string
          modulo_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conteudo?: string
          created_at?: string
          enabled?: boolean
          id?: string
          modulo_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          enabled?: boolean
          id?: string
          modulo_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      welcome_funnel_runs: {
        Row: {
          contact_id: string
          fired_at: string
          funnel_id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          fired_at?: string
          funnel_id: string
          user_id: string
        }
        Update: {
          contact_id?: string
          fired_at?: string
          funnel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcome_funnel_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "welcome_funnel_runs_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "welcome_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_funnels: {
        Row: {
          created_at: string
          delay_seconds: number
          enabled: boolean
          id: string
          name: string
          sort_order: number
          steps: Json
          trigger_keywords: string
          updated_at: string
          user_id: string
          whatsapp_number_id: string
        }
        Insert: {
          created_at?: string
          delay_seconds?: number
          enabled?: boolean
          id?: string
          name?: string
          sort_order?: number
          steps?: Json
          trigger_keywords?: string
          updated_at?: string
          user_id: string
          whatsapp_number_id: string
        }
        Update: {
          created_at?: string
          delay_seconds?: number
          enabled?: boolean
          id?: string
          name?: string
          sort_order?: number
          steps?: Json
          trigger_keywords?: string
          updated_at?: string
          user_id?: string
          whatsapp_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welcome_funnels_whatsapp_number_id_fkey"
            columns: ["whatsapp_number_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_numbers: {
        Row: {
          created_at: string
          disparos_mode: boolean
          id: string
          last_connected_at: string | null
          meta_ads_enabled: boolean
          nome: string
          status: string
          uazapi_admin_token: string | null
          uazapi_token: string | null
          uazapi_url: string | null
          updated_at: string
          user_id: string
          welcome_funnel: Json
        }
        Insert: {
          created_at?: string
          disparos_mode?: boolean
          id?: string
          last_connected_at?: string | null
          meta_ads_enabled?: boolean
          nome: string
          status?: string
          uazapi_admin_token?: string | null
          uazapi_token?: string | null
          uazapi_url?: string | null
          updated_at?: string
          user_id: string
          welcome_funnel?: Json
        }
        Update: {
          created_at?: string
          disparos_mode?: boolean
          id?: string
          last_connected_at?: string | null
          meta_ads_enabled?: boolean
          nome?: string
          status?: string
          uazapi_admin_token?: string | null
          uazapi_token?: string | null
          uazapi_url?: string | null
          updated_at?: string
          user_id?: string
          welcome_funnel?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_agent_logs: { Args: never; Returns: undefined }
    }
    Enums: {
      campaign_state: "parado" | "rodando" | "pausado"
      contact_profile: "ativo" | "frio" | "inativo"
      contact_status:
        | "nao_abordado"
        | "em_conversa"
        | "convertido"
        | "sem_resposta"
        | "bloqueado"
      contact_temperatura: "quente" | "morno" | "frio" | "bloqueado" | "cliente"
      conversation_status: "agente_respondendo" | "aguardando" | "convertido"
      log_status: "enviado" | "respondido" | "falha"
      message_kind: "texto" | "audio"
      message_sender: "agente" | "cliente"
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
      campaign_state: ["parado", "rodando", "pausado"],
      contact_profile: ["ativo", "frio", "inativo"],
      contact_status: [
        "nao_abordado",
        "em_conversa",
        "convertido",
        "sem_resposta",
        "bloqueado",
      ],
      contact_temperatura: ["quente", "morno", "frio", "bloqueado", "cliente"],
      conversation_status: ["agente_respondendo", "aguardando", "convertido"],
      log_status: ["enviado", "respondido", "falha"],
      message_kind: ["texto", "audio"],
      message_sender: ["agente", "cliente"],
    },
  },
} as const
