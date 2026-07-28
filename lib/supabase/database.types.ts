/**
 * Tipos canónicos del esquema multi-tenant V2 (organizations + managers + groups).
 * Usados por el cliente Supabase tipado para inserts/selects sin `as any`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Cliente B2B — raíz del tenant. */
export type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
};

export type OrganizationInsert = {
  id?: string;
  name: string;
  created_at?: string;
};

export type OrganizationUpdate = {
  id?: string;
  name?: string;
  created_at?: string;
};

/**
 * Manager HR vinculado a Auth (`user_id`) y a una organización.
 * `id` es la identidad de negocio; no confundir con `auth.users.id`.
 */
export type ManagerRow = {
  id: string;
  user_id: string;
  organization_id: string;
  name: string;
  email: string;
};

export type ManagerInsert = {
  id?: string;
  user_id: string;
  organization_id: string;
  name: string;
  email: string;
};

export type ManagerUpdate = {
  id?: string;
  user_id?: string;
  organization_id?: string;
  name?: string;
  email?: string;
};

/**
 * Equipo/evaluación. `organization_id` y `manager_id` son nullable
 * para retrocompatibilidad con pruebas locales y filas legacy.
 */
export type GroupRow = {
  id: string;
  name: string;
  age_band: string;
  created_at: string;
  organization_id: string | null;
  manager_id: string | null;
  tenant_id: string | null;
  active_ona_dimension?: string | null;
};

export type GroupInsert = {
  id?: string | number;
  name: string;
  age_band: string;
  created_at?: string;
  organization_id?: string | null;
  /** Opcional: FK → managers.id. Null en tests locales sin fila en managers. */
  manager_id?: string | null;
  tenant_id?: string | null;
  active_ona_dimension?: string | null;
};

export type GroupUpdate = {
  id?: string | number;
  name?: string;
  age_band?: string;
  created_at?: string;
  organization_id?: string | null;
  manager_id?: string | null;
  tenant_id?: string | null;
  active_ona_dimension?: string | null;
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: OrganizationRow;
        Insert: OrganizationInsert;
        Update: OrganizationUpdate;
        Relationships: [];
      };
      managers: {
        Row: ManagerRow;
        Insert: ManagerInsert;
        Update: ManagerUpdate;
        Relationships: [
          {
            foreignKeyName: "managers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: GroupRow;
        Insert: GroupInsert;
        Update: GroupUpdate;
        Relationships: [
          {
            foreignKeyName: "groups_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "managers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/** Alias legibles usados en lib/ y páginas. */
export type OrganizationRecord = OrganizationRow;
export type ManagerRecord = ManagerRow;
export type GroupRecord = GroupRow;
