-- =============================================================================
-- Vínculo HR SaaS — Esquema relacional Multi-tenant (fundacional)
-- =============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
--
-- Objetivo:
--   Escalar Vínculo a una arquitectura B2B multi-tenant con tres pilares:
--     1. organizations  → tenant raíz (cliente contratante)
--     2. profiles       → managers vinculados 1:1 con auth.users
--     3. groups         → equipos anclados a organization_id + manager_id
--
-- Alcance de este script:
--   • Solo estructura relacional (tablas, columnas, FKs, índices).
--   • Sin políticas RLS (se añadirán en una migración posterior).
--
-- Requisitos previos:
--   • Supabase Auth habilitado (auth.users).
--   • Tabla public.groups ya existente (MVP actual).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Extensión UUID
--    Supabase incluye pgcrypto; se declara por seguridad en entornos nuevos.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 1. Tabla organizations
--    Cada fila representa un cliente B2B (organización contratante).
--    Es la entidad raíz del aislamiento de datos multi-tenant.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organizations_name_not_empty
    CHECK (char_length(trim(name)) > 0)
);

COMMENT ON TABLE public.organizations IS
  '[Multi-tenant] Cliente B2B. Raíz del aislamiento de datos por organización.';

COMMENT ON COLUMN public.organizations.id IS
  'UUID del tenant. Referenciado por profiles.organization_id y groups.organization_id.';

COMMENT ON COLUMN public.organizations.name IS
  'Nombre comercial o legal de la organización.';

COMMENT ON COLUMN public.organizations.created_at IS
  'Fecha de alta de la organización en la plataforma.';


-- -----------------------------------------------------------------------------
-- 2. Tabla profiles (Managers)
--    Perfil de aplicación 1:1 con auth.users.
--    organization_id determina a qué cliente pertenece el manager autenticado.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY
                  REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL
                  REFERENCES public.organizations (id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'manager',

  CONSTRAINT profiles_role_not_empty
    CHECK (char_length(trim(role)) > 0)
);

COMMENT ON TABLE public.profiles IS
  '[Multi-tenant] Perfil del manager. id = auth.users.id.';

COMMENT ON COLUMN public.profiles.id IS
  'UUID del usuario autenticado (FK → auth.users.id).';

COMMENT ON COLUMN public.profiles.organization_id IS
  'Organización a la que pertenece el manager (FK → organizations.id).';

COMMENT ON COLUMN public.profiles.role IS
  'Rol dentro de la organización (p. ej. manager, admin).';

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
  ON public.profiles (organization_id);


-- -----------------------------------------------------------------------------
-- 3. Alteraciones en groups
--    Ancla cada equipo a su tenant (organization_id) y a su manager (manager_id).
-- -----------------------------------------------------------------------------

-- 3a. Columnas nuevas (nullable en migración para no romper filas existentes;
--     tras backfill, se puede aplicar NOT NULL en organization_id).
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS manager_id UUID;

COMMENT ON COLUMN public.groups.organization_id IS
  '[Multi-tenant] Organización propietaria del equipo (FK → organizations.id).';

COMMENT ON COLUMN public.groups.manager_id IS
  '[Multi-tenant] Manager responsable del equipo (FK → profiles.id = auth.users.id).';


-- 3b. Foreign Key: groups.organization_id → organizations.id
ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_organization_id_fkey;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_organization_id_fkey
  FOREIGN KEY (organization_id)
  REFERENCES public.organizations (id)
  ON DELETE CASCADE;


-- 3c. Foreign Key: groups.manager_id → profiles.id
ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_manager_id_fkey;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_manager_id_fkey
  FOREIGN KEY (manager_id)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;


-- 3d. Índices para joins y filtros por tenant/manager
CREATE INDEX IF NOT EXISTS idx_groups_organization_id
  ON public.groups (organization_id);

CREATE INDEX IF NOT EXISTS idx_groups_manager_id
  ON public.groups (manager_id);


COMMIT;

-- =============================================================================
-- Post-ejecución recomendada (manual, fuera de este script):
--   1. INSERT INTO organizations (...) para cada cliente existente.
--   2. INSERT INTO profiles (id, organization_id, role) por cada manager.
--   3. UPDATE groups SET organization_id = ..., manager_id = ... WHERE ...
--   4. ALTER TABLE groups ALTER COLUMN organization_id SET NOT NULL;
--   5. Activar RLS en organizations, profiles y groups (migración aparte).
-- =============================================================================
