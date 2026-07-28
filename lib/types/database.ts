/**
 * Punto de entrada de tipos de base de datos.
 * Reexporta el esquema canónico multi-tenant de Supabase.
 */
export type {
  Database,
  Json,
  ManagerRole,
  OrganizationRow,
  OrganizationInsert,
  OrganizationUpdate,
  OrganizationRecord,
  ManagerRow,
  ManagerInsert,
  ManagerUpdate,
  ManagerRecord,
  GroupRow,
  GroupInsert,
  GroupUpdate,
  GroupRecord,
} from "@/lib/supabase/database.types";
