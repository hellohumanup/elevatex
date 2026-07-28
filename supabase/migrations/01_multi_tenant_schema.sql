-- =============================================================================
-- Vínculo HR SaaS — 01: Esquema Multi-tenant (organizations + managers + groups)
-- =============================================================================
-- Archivo: supabase/migrations/01_multi_tenant_schema.sql
--
-- Objetivo:
--   • organizations  → tenant raíz (id UUID, name, slug unique, created_at)
--   • managers       → perfiles HR (id → auth.users, organization_id, role, full_name)
--   • groups         → organization_id + manager_id
--   • RLS            → lectura/escritura acotada a la organization_id del usuario
--
-- Compatibilidad:
--   • Idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS).
--   • No elimina tablas legacy (profiles, tenants). No rompe filas existentes:
--     organization_id / manager_id en groups quedan nullable hasta backfill.
--   • Columnas opcionales name / email / user_id en managers permiten que el
--     cliente actual (selects por user_id + name) siga funcionando si ya existían
--     o si se rellenan en el alta del manager.
--
-- Nota: service_role bypassa RLS (uso server-side exclusivo).
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 1. organizations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organizations_name_not_empty
    CHECK (char_length(trim(name)) > 0)
);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Unique slug (permite NULL para filas legacy sin slug).
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_key
  ON public.organizations (slug)
  WHERE slug IS NOT NULL;

COMMENT ON TABLE public.organizations IS
  'Cliente B2B. Raíz del aislamiento multi-tenant.';

COMMENT ON COLUMN public.organizations.slug IS
  'Identificador URL-friendly único del tenant (nullable en legacy).';


-- -----------------------------------------------------------------------------
-- 2. managers (perfiles HR)
--    Modelo canónico: id = auth.users.id
--    Si la tabla ya existe con id propio + user_id, solo se añaden columnas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.managers (
  id              UUID PRIMARY KEY
                  REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL
                  REFERENCES public.organizations (id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'manager',
  full_name       TEXT NOT NULL,
  -- Compatibilidad con selects actuales del app (opcionales)
  name            TEXT,
  email           TEXT,
  user_id         UUID REFERENCES auth.users (id) ON DELETE CASCADE,

  CONSTRAINT managers_role_allowed
    CHECK (role IN ('admin', 'manager')),
  CONSTRAINT managers_full_name_not_empty
    CHECK (char_length(trim(full_name)) > 0)
);

ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'manager';

ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.managers
  ADD COLUMN IF NOT EXISTS user_id UUID;

-- Backfill suave: full_name desde name si venía vacío.
UPDATE public.managers
SET full_name = COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(name), ''), 'Manager')
WHERE full_name IS NULL OR trim(full_name) = '';

-- Backfill suave: name desde full_name para selects legacy.
UPDATE public.managers
SET name = COALESCE(NULLIF(trim(name), ''), NULLIF(trim(full_name), ''))
WHERE name IS NULL OR trim(name) = '';

-- Backfill suave: user_id = id cuando el PK es el usuario Auth.
UPDATE public.managers
SET user_id = id
WHERE user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = managers.id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'managers_organization_id_fkey'
      AND conrelid = 'public.managers'::regclass
  ) THEN
    ALTER TABLE public.managers
      ADD CONSTRAINT managers_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations (id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'managers_role_allowed'
      AND conrelid = 'public.managers'::regclass
  ) THEN
    ALTER TABLE public.managers
      ADD CONSTRAINT managers_role_allowed
      CHECK (role IN ('admin', 'manager'));
  END IF;
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'managers_role_allowed omitido: hay roles fuera de (admin, manager).';
END $$;

CREATE INDEX IF NOT EXISTS idx_managers_organization_id
  ON public.managers (organization_id);

CREATE INDEX IF NOT EXISTS idx_managers_user_id
  ON public.managers (user_id);

COMMENT ON TABLE public.managers IS
  'Perfil HR. id referencia auth.users (modelo 1:1) o identidad de negocio + user_id.';

COMMENT ON COLUMN public.managers.role IS
  'Rol dentro de la organización: admin | manager.';

COMMENT ON COLUMN public.managers.full_name IS
  'Nombre completo visible del manager.';


-- -----------------------------------------------------------------------------
-- 3. groups — organization_id + manager_id
-- -----------------------------------------------------------------------------
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS manager_id UUID;

COMMENT ON COLUMN public.groups.organization_id IS
  'Organización propietaria del equipo (FK → organizations.id).';

COMMENT ON COLUMN public.groups.manager_id IS
  'Manager responsable del equipo (FK → managers.id).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
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


-- -----------------------------------------------------------------------------
-- 4. Helper RLS — organization_id del usuario autenticado
--    Soporta managers.id = auth.uid() y managers.user_id = auth.uid().
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.organization_id
  FROM public.managers AS m
  WHERE m.id = auth.uid()
     OR m.user_id = auth.uid()
  ORDER BY m.id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_user_organization_id() IS
  'UUID de organizations.id del manager autenticado, o NULL si no está vinculado.';

GRANT EXECUTE ON FUNCTION public.current_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_organization_id() TO anon;


-- -----------------------------------------------------------------------------
-- 5. RLS básico por organization_id
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups         ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.managers       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups         TO authenticated;

-- organizations
DROP POLICY IF EXISTS organizations_select_own ON public.organizations;
DROP POLICY IF EXISTS organizations_insert_own ON public.organizations;
DROP POLICY IF EXISTS organizations_update_own ON public.organizations;
DROP POLICY IF EXISTS organizations_delete_own ON public.organizations;

CREATE POLICY organizations_select_own
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (id = public.current_user_organization_id());

CREATE POLICY organizations_insert_own
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Alta inicial: sin org vinculada aún, o insertando la propia org.
    public.current_user_organization_id() IS NULL
    OR id = public.current_user_organization_id()
  );

CREATE POLICY organizations_update_own
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (id = public.current_user_organization_id())
  WITH CHECK (id = public.current_user_organization_id());

CREATE POLICY organizations_delete_own
  ON public.organizations
  FOR DELETE
  TO authenticated
  USING (id = public.current_user_organization_id());

-- managers
DROP POLICY IF EXISTS managers_select_own_org ON public.managers;
DROP POLICY IF EXISTS managers_insert_own_org ON public.managers;
DROP POLICY IF EXISTS managers_update_own_org ON public.managers;
DROP POLICY IF EXISTS managers_delete_own_org ON public.managers;

CREATE POLICY managers_select_own_org
  ON public.managers
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_user_organization_id()
    OR id = auth.uid()
    OR user_id = auth.uid()
  );

CREATE POLICY managers_insert_own_org
  ON public.managers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = auth.uid()
    OR user_id = auth.uid()
    OR organization_id = public.current_user_organization_id()
    OR public.current_user_organization_id() IS NULL
  );

CREATE POLICY managers_update_own_org
  ON public.managers
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.current_user_organization_id()
    OR id = auth.uid()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    organization_id = public.current_user_organization_id()
  );

CREATE POLICY managers_delete_own_org
  ON public.managers
  FOR DELETE
  TO authenticated
  USING (
    organization_id = public.current_user_organization_id()
  );

-- groups
DROP POLICY IF EXISTS groups_select_own_org ON public.groups;
DROP POLICY IF EXISTS groups_insert_own_org ON public.groups;
DROP POLICY IF EXISTS groups_update_own_org ON public.groups;
DROP POLICY IF EXISTS groups_delete_own_org ON public.groups;

CREATE POLICY groups_select_own_org
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_user_organization_id()
    OR manager_id = auth.uid()
  );

CREATE POLICY groups_insert_own_org
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    OR (
      public.current_user_organization_id() IS NULL
      AND manager_id = auth.uid()
    )
  );

CREATE POLICY groups_update_own_org
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.current_user_organization_id()
    OR manager_id = auth.uid()
  )
  WITH CHECK (
    organization_id = public.current_user_organization_id()
    OR manager_id = auth.uid()
  );

CREATE POLICY groups_delete_own_org
  ON public.groups
  FOR DELETE
  TO authenticated
  USING (
    organization_id = public.current_user_organization_id()
    OR manager_id = auth.uid()
  );

COMMIT;

-- =============================================================================
-- Post-ejecución recomendada:
--   1. INSERT INTO organizations (name, slug) …
--   2. INSERT INTO managers (id, organization_id, role, full_name, name, email, user_id)
--      con id = auth.users.id (y user_id = id para compatibilidad).
--   3. UPDATE groups SET organization_id = …, manager_id = … WHERE …
--   4. ALTER TABLE groups ALTER COLUMN organization_id SET NOT NULL; (tras backfill)
-- =============================================================================
