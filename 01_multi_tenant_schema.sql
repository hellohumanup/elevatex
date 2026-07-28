-- =============================================================================
-- Vínculo HR SaaS — 01: Esquema Multi-tenant B2B V2 (fundacional)
-- =============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
--
-- Contexto:
--   Arquitectura definitiva V2. Base limpia: elimina `profiles` del MVP y
--   sustituye el modelo por `organizations` + `managers`.
--   Se asume que ya existen `groups`, `participants` y `responses`.
--
-- Jerarquía de negocio:
--   organizations  → cliente B2B contratante (raíz del tenant)
--   managers       → usuarios HR autenticados (Supabase Auth) dentro de una org
--   groups         → equipos/evaluaciones propiedad de una org y gestionados por un manager
--   participants   → miembros de un equipo (heredan el tenant vía group_id)
--   responses      → respuestas del cuestionario (heredan el tenant vía group_id)
--
-- Notas:
--   • Idempotente: IF NOT EXISTS y comprobación de constraints antes de crearlas.
--   • organization_id y manager_id en groups son nullable en esta fase para no
--     romper filas legacy del MVP; tras backfill, conviene NOT NULL en organization_id.
--   • RLS no se activa aquí (migración posterior).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Limpieza legacy MVP — tabla profiles
--
-- Lógica de negocio:
--   `profiles` (id = auth.users.id) era el puente provisional entre Auth y el
--   tenant. En V2 ese rol lo asume `managers` (id propio + user_id → Auth).
--   CASCADE elimina en cascada políticas RLS, FKs, vistas, triggers y cualquier
--   otra dependencia sin necesidad de descubrirlas manualmente.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.profiles CASCADE;


-- -----------------------------------------------------------------------------
-- 1. Extensión para generación de UUID
--    Supabase incluye pgcrypto por defecto; se declara por seguridad.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 2. Tabla organizations
--
-- Lógica de negocio:
--   Cada fila representa un cliente B2B (empresa contratante). Es la entidad
--   raíz del multi-tenant: todos los equipos y managers deben colgar de una org.
--   El borrado en cascada propaga la limpieza hacia managers y groups asociados.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organizations_name_not_empty
    CHECK (char_length(trim(name)) > 0)
);

COMMENT ON TABLE public.organizations IS
  'Cliente B2B. Raíz del aislamiento multi-tenant.';

COMMENT ON COLUMN public.organizations.id IS
  'Identificador único del tenant (UUID).';

COMMENT ON COLUMN public.organizations.name IS
  'Nombre comercial o legal de la organización.';

COMMENT ON COLUMN public.organizations.created_at IS
  'Fecha de alta de la organización en la plataforma.';


-- -----------------------------------------------------------------------------
-- 3. Tabla managers
--
-- Lógica de negocio:
--   Un manager es un usuario de aplicación vinculado a Supabase Auth (user_id).
--   Pertenece a exactamente una organización (organization_id) y puede gestionar
--   uno o varios equipos (groups) de esa misma org.
--
--   Separamos `id` (identidad de negocio del manager) de `user_id` (cuenta Auth)
--   para mantener flexibilidad: el mismo usuario podría, en el futuro, operar
--   en varias organizaciones con registros distintos en managers.
--
--   La unicidad (user_id, organization_id) evita duplicar el mismo manager
--   dentro de un tenant.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.managers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL
                  REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL
                  REFERENCES public.organizations (id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,

  CONSTRAINT managers_name_not_empty
    CHECK (char_length(trim(name)) > 0),
  CONSTRAINT managers_email_not_empty
    CHECK (char_length(trim(email)) > 0),
  CONSTRAINT managers_user_org_unique
    UNIQUE (user_id, organization_id)
);

COMMENT ON TABLE public.managers IS
  'Manager HR autenticado. Puente entre auth.users y organizations.';

COMMENT ON COLUMN public.managers.id IS
  'Identidad de negocio del manager (referenciada por groups.manager_id).';

COMMENT ON COLUMN public.managers.user_id IS
  'UUID del usuario en Supabase Auth (auth.users.id).';

COMMENT ON COLUMN public.managers.organization_id IS
  'Organización a la que pertenece el manager. ON DELETE CASCADE.';

COMMENT ON COLUMN public.managers.name IS
  'Nombre visible del manager en la aplicación.';

COMMENT ON COLUMN public.managers.email IS
  'Email de contacto / login del manager.';

CREATE INDEX IF NOT EXISTS idx_managers_organization_id
  ON public.managers (organization_id);

CREATE INDEX IF NOT EXISTS idx_managers_user_id
  ON public.managers (user_id);

CREATE INDEX IF NOT EXISTS idx_managers_email
  ON public.managers (email);


-- -----------------------------------------------------------------------------
-- 4. Alteraciones en groups
--
-- Lógica de negocio:
--   • organization_id ancla cada equipo al tenant propietario. Permite filtrar
--     y aislar datos por cliente sin duplicar organization_id en participants
--     ni responses (estos heredan el tenant a través de group_id).
--
--   • manager_id identifica al responsable HR del equipo. Facilita RLS y
--     autorización: un manager solo ve/edita los groups donde es el gestor.
--
--   Regla de coherencia (aplicar en backfill y en la app):
--     El manager asignado debe pertenecer a la misma organization_id del group.
-- -----------------------------------------------------------------------------
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS manager_id UUID;

COMMENT ON COLUMN public.groups.organization_id IS
  'Organización propietaria del equipo (FK → organizations.id).';

COMMENT ON COLUMN public.groups.manager_id IS
  'Manager responsable del equipo (FK → managers.id).';


-- Limpieza de referencias huérfanas del MVP (p. ej. manager_id = auth.users.id tras
-- DROP profiles). Las columnas permanecen NULLables hasta el backfill manual V2.
ALTER TABLE public.groups
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE public.groups
  ALTER COLUMN manager_id DROP NOT NULL;

UPDATE public.groups
SET manager_id = NULL,
    organization_id = NULL;


-- FK: groups.organization_id → organizations.id
-- ON DELETE CASCADE: si se elimina el tenant, se eliminan sus equipos (y en cascada
-- participants/responses si ya tienen FK hacia groups con CASCADE).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'groups_organization_id_fkey'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations (id)
      ON DELETE CASCADE;
  END IF;
END $$;


-- FK: groups.manager_id → managers.id
-- ON DELETE SET NULL: si se da de baja un manager, el equipo permanece en la org
-- para reasignación; organization_id sigue definiendo el tenant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'groups_manager_id_fkey'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_manager_id_fkey
      FOREIGN KEY (manager_id)
      REFERENCES public.managers (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_groups_organization_id
  ON public.groups (organization_id);

CREATE INDEX IF NOT EXISTS idx_groups_manager_id
  ON public.groups (manager_id);


COMMIT;

-- =============================================================================
-- Post-ejecución recomendada (manual, fuera de este script):
--   1. INSERT INTO organizations (...) por cada cliente existente.
--   2. INSERT INTO managers (user_id, organization_id, name, email) por cada HR.
--   3. UPDATE groups SET organization_id = ..., manager_id = ... WHERE ...
--   4. Verificar coherencia: managers.organization_id = groups.organization_id.
--   5. ALTER TABLE groups ALTER COLUMN organization_id SET NOT NULL;
--   6. Activar RLS en organizations, managers y groups (migración aparte).
-- =============================================================================
