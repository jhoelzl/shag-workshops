export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      dance_classes: {
        Row: {
          id: string;
          title_de: string;
          title_en: string;
          description_de: string | null;
          description_en: string | null;
          level: string | null;
          location: string | null;
          location_details: string | null;
          location_url: string | null;
          max_leads: number;
          max_follows: number;
          min_leads: number;
          min_follows: number;
          price_eur: number | null;
          is_donation: boolean;
          registration_opens_at: string | null;
          registration_closes_at: string | null;
          dance: string | null;
          teachers: string | null;
          what_to_bring_de: string | null;
          what_to_bring_en: string | null;
          preview_text_de: string | null;
          preview_text_en: string | null;
          donation_text_de: string | null;
          donation_text_en: string | null;
          donation_subtext_de: string | null;
          donation_subtext_en: string | null;
          auto_confirm: boolean;
          is_preview: boolean;
          is_public: boolean;
          notification_email: string | null;
          image_url: string | null;
          image_overlay_alpha: number | null;
          headline_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Relationships: [];
        Insert: {
          id?: string;
          title_de: string;
          title_en: string;
          description_de?: string | null;
          description_en?: string | null;
          level?: string | null;
          location?: string | null;
          location_details?: string | null;
          location_url?: string | null;
          max_leads: number;
          max_follows: number;
          min_leads?: number;
          min_follows?: number;
          price_eur?: number | null;
          is_donation?: boolean;
          registration_opens_at?: string | null;
          registration_closes_at?: string | null;
          dance?: string | null;
          teachers?: string | null;
          what_to_bring_de?: string | null;
          what_to_bring_en?: string | null;
          preview_text_de?: string | null;
          preview_text_en?: string | null;
          donation_text_de?: string | null;
          donation_text_en?: string | null;
          donation_subtext_de?: string | null;
          donation_subtext_en?: string | null;
          auto_confirm?: boolean;
          is_preview?: boolean;
          is_public?: boolean;
          notification_email?: string | null;
          image_url?: string | null;
          image_overlay_alpha?: number | null;
          headline_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title_de?: string;
          title_en?: string;
          description_de?: string | null;
          description_en?: string | null;
          level?: string | null;
          location?: string | null;
          location_details?: string | null;
          location_url?: string | null;
          max_leads?: number;
          max_follows?: number;
          min_leads?: number;
          min_follows?: number;
          price_eur?: number | null;
          is_donation?: boolean;
          registration_opens_at?: string | null;
          registration_closes_at?: string | null;
          dance?: string | null;
          teachers?: string | null;
          what_to_bring_de?: string | null;
          what_to_bring_en?: string | null;
          preview_text_de?: string | null;
          preview_text_en?: string | null;
          donation_text_de?: string | null;
          donation_text_en?: string | null;
          donation_subtext_de?: string | null;
          donation_subtext_en?: string | null;
          auto_confirm?: boolean;
          is_preview?: boolean;
          is_public?: boolean;
          notification_email?: string | null;
          image_url?: string | null;
          image_overlay_alpha?: number | null;
          headline_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      class_sessions: {
        Row: {
          id: string;
          dance_class_id: string;
          session_date: string;
          start_time: string;
          end_time: string;
          note: string | null;
          created_at: string;
        };
        Relationships: [];
        Insert: {
          id?: string;
          dance_class_id: string;
          session_date: string;
          start_time: string;
          end_time: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          dance_class_id?: string;
          session_date?: string;
          start_time?: string;
          end_time?: string;
          note?: string | null;
          created_at?: string;
        };
      };
      registrations: {
        Row: {
          id: string;
          dance_class_id: string;
          email: string;
          name: string;
          role: 'lead' | 'follow';
          partner_name: string | null;
          comment: string | null;
          status: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled';
          admin_notes: string | null;
          locale: 'de' | 'en';
          created_at: string;
        };
        Relationships: [];
        Insert: {
          id?: string;
          dance_class_id: string;
          email: string;
          name: string;
          role: 'lead' | 'follow';
          partner_name?: string | null;
          comment?: string | null;
          status?: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled';
          admin_notes?: string | null;
          locale?: 'de' | 'en';
          created_at?: string;
        };
        Update: {
          id?: string;
          dance_class_id?: string;
          email?: string;
          name?: string;
          role?: 'lead' | 'follow';
          partner_name?: string | null;
          comment?: string | null;
          status?: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled';
          admin_notes?: string | null;
          locale?: 'de' | 'en';
          created_at?: string;
        };
      };
      registration_history: {
        Row: {
          id: string;
          registration_id: string;
          dance_class_id: string;
          event_type: 'created' | 'status_changed' | 'email_sent' | 'email_failed' | 'email_skipped';
          old_status: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | null;
          new_status: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | null;
          triggered_by: 'public_registration' | 'admin_registration' | 'admin_status_change' | 'system';
          actor_user_id: string | null;
          email_type: string | null;
          email_recipient: string | null;
          email_subject: string | null;
          note: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Relationships: [];
        Insert: {
          id?: string;
          registration_id: string;
          dance_class_id: string;
          event_type: 'created' | 'status_changed' | 'email_sent' | 'email_failed' | 'email_skipped';
          old_status?: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | null;
          new_status?: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | null;
          triggered_by?: 'public_registration' | 'admin_registration' | 'admin_status_change' | 'system';
          actor_user_id?: string | null;
          email_type?: string | null;
          email_recipient?: string | null;
          email_subject?: string | null;
          note?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          registration_id?: string;
          dance_class_id?: string;
          event_type?: 'created' | 'status_changed' | 'email_sent' | 'email_failed' | 'email_skipped';
          old_status?: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | null;
          new_status?: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | null;
          triggered_by?: 'public_registration' | 'admin_registration' | 'admin_status_change' | 'system';
          actor_user_id?: string | null;
          email_type?: string | null;
          email_recipient?: string | null;
          email_subject?: string | null;
          note?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
      };
      class_admin_permissions: {
        Row: {
          id: string;
          user_id: string;
          dance_class_id: string;
          created_by: string | null;
          created_at: string;
        };
        Relationships: [];
        Insert: {
          id?: string;
          user_id: string;
          dance_class_id: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          dance_class_id?: string;
          created_by?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      class_registration_counts: {
        Row: {
          dance_class_id: string | null;
          lead_count: number | null;
          follow_count: number | null;
          leads_available: number | null;
          follows_available: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_super_admin: {
        Args: { uid: string };
        Returns: boolean;
      };
      can_access_class: {
        Args: { uid: string; class_id: string };
        Returns: boolean;
      };
      list_admin_users: {
        Args: Record<string, never>;
        Returns: { id: string; email: string; is_super_admin: boolean }[];
      };
      get_my_class_permissions: {
        Args: Record<string, never>;
        Returns: { dance_class_id: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type DanceClass = Database['public']['Tables']['dance_classes']['Row'];
export type ClassSession = Database['public']['Tables']['class_sessions']['Row'];
export type Registration = Database['public']['Tables']['registrations']['Row'];
export type RegistrationHistory = Database['public']['Tables']['registration_history']['Row'];
export type ClassAdminPermission = Database['public']['Tables']['class_admin_permissions']['Row'];

// Admin user type for permission management
export type AdminUser = {
  id: string;
  email: string;
  is_super_admin: boolean;
};
