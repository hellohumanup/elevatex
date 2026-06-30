-- =============================================================================
-- Vínculo HR SaaS — Arquitectura Multi-tenant base (tenants + profiles + RLS)
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
--
-- Objetivo:
--   • tenants   → raíz del aislamiento B2B (UUID)
--   • profiles  → usuario autenticado (auth.users) vinculado a un tenant
--   • groups    → columna tenant_id + RLS por tenant del manager
--
-- Requisitos previos:
--   • Extensión pgcrypto (gen_random_uuid)
--   • Tabla public.groups ya existente en el proyecto MVP
--   • Supabase Auth habilitado (auth.users)
--
-- Idempotente: IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Extensión UUID
--    Supabase incluye pgcrypto; lo declaramos por seguridad en entornos nuevos.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 1. Tabla tenants
--    Cada fila representa un cliente B2B (organización contratante).
--    Es la entidad raíz del aislamiento de datos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tenants_name_not_empty CHECK (char_length(trim(name)) > 0)
);

COMMENT ON TABLE public.tenants IS
  '[Multi-tenant] Cliente B2B. Raíz del aislamiento de datos por tenant.';

COMMENT ON COLUMN public.tenants.id IS
  'UUID del tenant. Referenciado por profiles.tenant_id y groups.tenant_id.';

COMMENT ON COLUMN public.tenants.name IS
  'Nombre comercial o legal del cliente.';

COMMENT ON COLUMN public.tenants.created_at IS
  'Fecha de alta del tenant en la plataforma.';


-- -----------------------------------------------------------------------------
-- 2. Tabla profiles
--    Perfil de aplicación 1:1 con auth.users.
--    El tenant_id determina a qué cliente pertenece el manager autenticado.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id  UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  name       TEXT,
  role       TEXT NOT NULL DEFAULT 'manager',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT profiles_role_not_empty CHECK (char_length(trim(role)) > 0)
);

-- Compatibilidad: si profiles existía de migraciones anteriores, añadir columnas.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'manager';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON TABLE public.profiles IS
  '[Multi-tenant] Perfil del usuario autenticado vinculado a un tenant.';

COMMENT ON COLUMN public.profiles.id IS
  'Mismo UUID que auth.users.id (PK compartida con Supabase Auth).';

COMMENT ON COLUMN public.profiles.tenant_id IS
  'Tenant al que pertenece el usuario. NULL si el tenant fue eliminado (SET NULL).';

COMMENT ON COLUMN public.profiles.name IS
  'Nombre visible del manager en la aplicación.';

COMMENT ON COLUMN public.profiles.role IS
  'Rol dentro del tenant. Por defecto: manager.';

COMMENT ON COLUMN public.profiles.updated_at IS
  'Última actualización del perfil.';

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id
  ON public.profiles (tenant_id);


-- -----------------------------------------------------------------------------
-- 3. Columna tenant_id en groups
--    Cada equipo pertenece a un único tenant. ON DELETE CASCADE elimina
--    equipos huérfanos si se borra el tenant (ajustar según política de negocio).
-- -----------------------------------------------------------------------------
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'groups_tenant_id_fkey'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants (id)
      ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN public.groups.tenant_id IS
  '[Multi-tenant] Tenant propietario del equipo. Usado por RLS para aislar datos.';

CREATE INDEX IF NOT EXISTS idx_groups_tenant_id
  ON public.groups (tenant_id);


-- -----------------------------------------------------------------------------
-- 4. Row Level Security (RLS) en groups
--    Solo el usuario autenticado cuyo profiles.tenant_id coincide con
--    groups.tenant_id puede leer o modificar filas de su tenant.
-- -----------------------------------------------------------------------------

-- Activa RLS: deniega todo acceso anon/authenticated salvo políticas explícitas.
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Helper inline: tenant del usuario autenticado (auth.uid() → profiles.tenant_id).
-- Si el perfil no existe o tenant_id es NULL, la subconsulta devuelve NULL y
-- ninguna fila de groups coincidirá (aislamiento total).

DROP POLICY IF EXISTS groups_tenant_select ON public.groups;
CREATE POLICY groups_tenant_select
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = (
      SELECT p.tenant_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS groups_tenant_insert ON public.groups;
CREATE POLICY groups_tenant_insert
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = (
      SELECT p.tenant_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS groups_tenant_update ON public.groups;
CREATE POLICY groups_tenant_update
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = (
      SELECT p.tenant_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IS NOT NULL
    AND tenant_id = (
      SELECT p.tenant_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS groups_tenant_delete ON public.groups;
CREATE POLICY groups_tenant_delete
  ON public.groups
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND tenant_id = (
      SELECT p.tenant_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 5. Notas post-migración (ejecutar manualmente según entorno)
-- -----------------------------------------------------------------------------
-- • Poblar tenants y asignar tenant_id en profiles y groups existentes antes
--   de depender de RLS en producción.
-- • Crear trigger en auth.users → INSERT en profiles al registrarse (opcional).
-- • Extender RLS a participants, responses, etc. con la misma regla de tenant.
-- • service_role bypass RLS por defecto en Supabase (uso server-side only).

COMMIT;
