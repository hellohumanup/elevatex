/**
 * Tipos canónicos del esquema multi-tenant
 * (organizations + managers + groups).
 *
 * Fuente de verdad para el cliente Supabase tipado.
 * Compatibilidad: campos opcionales (`user_id`, `name`, `email`, `tenant_id`)
 * preservan selects/inserts del flujo actual sin romper builds.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Rol HR dentro de una organización. */
export type ManagerRole = "admin" | "manager";

/** Cliente B2B — raíz del tenant. */
export type OrganizationRow = {
  id: string;
  name: string;
  /** Identificador URL-friendly único (nullable en filas legacy). */
  slug: string | null;
  created_at: string;
};

export type OrganizationInsert = {
  id?: string;
  name: string;
  slug?: string | null;
  created_at?: string;
};

export type OrganizationUpdate = {
  id?: string;
  name?: string;
  slug?: string | null;
  created_at?: string;
};

/**
 * Manager / perfil HR.
 * Modelo canónico: `id` → `auth.users.id`, con `role` y `full_name`.
 * Campos opcionales (`user_id`, `name`, `email`) mantienen el flujo actual.
 */
export type ManagerRow = {
  id: string;
  organization_id: string;
  role: ManagerRole | string;
  full_name: string;
  /** Compat: suele coincidir con `id` cuando el PK es auth.users.id. */
  user_id?: string | null;
  /** Compat: alias histórico de `full_name`. */
  name?: string | null;
  email?: string | null;
};

export type ManagerInsert = {
  id: string;
  organization_id: string;
  role?: ManagerRole | string;
  full_name: string;
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
};

export type ManagerUpdate = {
  id?: string;
  organization_id?: string;
  role?: ManagerRole | string;
  full_name?: string;
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
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
    Functions: {
      current_user_organization_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/** Alias legibles usados en lib/ y páginas. */
export type OrganizationRecord = OrganizationRow;
export type ManagerRecord = ManagerRow;
export type GroupRecord = GroupRow;
