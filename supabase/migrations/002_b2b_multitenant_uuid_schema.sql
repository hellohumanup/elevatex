-- =============================================================================
-- Vínculo HR SaaS — Esquema B2B Multi-tenant (Supabase)
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
--
-- Objetivo:
--   • organizations  → tenant raíz (UUID)
--   • profiles       → managers vinculados a auth.users
--   • groups         → organization_id obligatorio por equipo
--   • CASCADE        → integridad referencial en la jerarquía tenant → equipo → datos
--
-- Compatibilidad:
--   • Idempotente (IF NOT EXISTS, comprobación de constraints).
--   • Si ya ejecutaste 001_multi_tenant_organizations.sql (BIGINT), este script
--     migra organizations.id y groups.organization_id a UUID preservando datos.
--   • Asume que ya existen public.groups, public.participants y public.responses
--     (creadas previamente en tu proyecto).
--   • RLS: NO se activa aquí (ver bloque final de comentarios).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Extensión para UUID (Supabase la incluye; IF NOT EXISTS por seguridad)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Tabla organizations (tenant raíz) — UUID
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  org_id_type TEXT;
BEGIN
  SELECT c.data_type
  INTO org_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'organizations'
    AND c.column_name = 'id';

  -- Caso A: tabla inexistente → crear con UUID
  IF org_id_type IS NULL THEN
    CREATE TABLE public.organizations (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

  -- Caso B: ya existe con BIGINT (migración 001) → migrar a UUID
  ELSIF org_id_type = 'bigint' THEN
    CREATE TABLE IF NOT EXISTS public._organizations_uuid_migration (
      old_id BIGINT PRIMARY KEY,
      new_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()
    );

    INSERT INTO public._organizations_uuid_migration (old_id, new_id)
    SELECT o.id, gen_random_uuid()
    FROM public.organizations o
    ON CONFLICT (old_id) DO NOTHING;

    CREATE TABLE public.organizations_new (
      id         UUID PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO public.organizations_new (id, name, created_at)
    SELECT m.new_id, o.name, o.created_at
    FROM public.organizations o
    JOIN public._organizations_uuid_migration m ON m.old_id = o.id;

    -- groups.organization_id (BIGINT) → columna temporal UUID
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'groups'
        AND column_name = 'organization_id'
        AND data_type = 'bigint'
    ) THEN
      ALTER TABLE public.groups
        ADD COLUMN IF NOT EXISTS organization_id_uuid UUID;

      UPDATE public.groups g
      SET organization_id_uuid = m.new_id
      FROM public._organizations_uuid_migration m
      WHERE g.organization_id = m.old_id;

      ALTER TABLE public.groups
        DROP CONSTRAINT IF EXISTS groups_organization_id_fkey;

      ALTER TABLE public.groups
        DROP COLUMN IF EXISTS organization_id;

      ALTER TABLE public.groups
        RENAME COLUMN organization_id_uuid TO organization_id;
    END IF;

    -- survey_responses.organization_id (BIGINT) → UUID si existe la columna
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'survey_responses'
        AND column_name = 'organization_id'
        AND data_type = 'bigint'
    ) THEN
      ALTER TABLE public.survey_responses
        ADD COLUMN IF NOT EXISTS organization_id_uuid UUID;

      UPDATE public.survey_responses sr
      SET organization_id_uuid = m.new_id
      FROM public._organizations_uuid_migration m
      WHERE sr.organization_id = m.old_id;

      ALTER TABLE public.survey_responses
        DROP COLUMN IF EXISTS organization_id;

      ALTER TABLE public.survey_responses
        RENAME COLUMN organization_id_uuid TO organization_id;
    END IF;

    DROP TABLE public.organizations;
    ALTER TABLE public.organizations_new RENAME TO organizations;

    DROP TABLE IF EXISTS public._organizations_uuid_migration;

  -- Caso C: ya es UUID → no hacer nada destructivo
  ELSIF org_id_type = 'uuid' THEN
    NULL;
  ELSE
    RAISE EXCEPTION
      'organizations.id tiene tipo % no soportado. Esperado: bigint (001) o uuid.',
      org_id_type;
  END IF;
END $$;

COMMENT ON TABLE public.organizations IS
  '[Multi-tenant] Organización cliente del SaaS B2B. Raíz de aislamiento de datos.';

COMMENT ON COLUMN public.organizations.id IS
  'UUID del tenant. Referenciado por profiles y groups.';

COMMENT ON COLUMN public.organizations.name IS
  'Nombre comercial o legal de la organización.';

COMMENT ON COLUMN public.organizations.created_at IS
  'Alta del tenant en la plataforma.';

-- -----------------------------------------------------------------------------
-- 2. Tabla profiles (Managers) — UUID → auth.users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'manager',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_email_not_empty CHECK (char_length(trim(email)) > 0),
  CONSTRAINT profiles_role_not_empty CHECK (char_length(trim(role)) > 0)
);

COMMENT ON TABLE public.profiles IS
  '[Multi-tenant] Perfil de manager HR vinculado a auth.users y a un tenant.';

COMMENT ON COLUMN public.profiles.id IS
  'Mismo UUID que auth.users.id (1:1 con el usuario autenticado).';

COMMENT ON COLUMN public.profiles.organization_id IS
  'Tenant al que pertenece el manager. ON DELETE CASCADE si se elimina la org.';

COMMENT ON COLUMN public.profiles.email IS
  'Email de contacto / login del manager.';

COMMENT ON COLUMN public.profiles.role IS
  'Rol dentro del tenant. Por defecto: manager.';

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
  ON public.profiles (organization_id);

CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (email);

-- Si profiles ya existía con otras columnas (full_name, etc.), no las tocamos.
-- Solo añadimos organization_id y role si faltan:
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'manager';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- FK profiles → organizations (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_organization_id_fkey'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations (id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- FK profiles → auth.users (si la tabla se creó antes sin la referencia)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_id_fkey'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id)
      REFERENCES auth.users (id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 3. groups.organization_id (UUID, FK estricta al tenant)
-- -----------------------------------------------------------------------------
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS organization_id UUID;

COMMENT ON COLUMN public.groups.organization_id IS
  '[Multi-tenant] Tenant propietario del equipo. Obligatorio en producción.';

-- Asignar tenant por defecto a equipos huérfanos (compatibilidad con datos legacy)
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  SELECT id INTO default_org_id
  FROM public.organizations
  ORDER BY created_at ASC
  LIMIT 1;

  IF default_org_id IS NULL THEN
    INSERT INTO public.organizations (name)
    VALUES ('Vínculo · Organización principal')
    RETURNING id INTO default_org_id;
  END IF;

  UPDATE public.groups
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;
END $$;

-- FK groups → organizations ON DELETE CASCADE
DO $$
BEGIN
  ALTER TABLE public.groups
    DROP CONSTRAINT IF EXISTS groups_organization_id_fkey;

  ALTER TABLE public.groups
    ADD CONSTRAINT groups_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.organizations (id)
    ON DELETE CASCADE;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'No se pudo crear groups_organization_id_fkey: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_groups_organization_id
  ON public.groups (organization_id);

-- -----------------------------------------------------------------------------
-- 4. CASCADE: participants → groups, responses → groups
--    (al borrar un equipo, se borran participantes y respuestas)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'participants'
  ) THEN
    ALTER TABLE public.participants
      DROP CONSTRAINT IF EXISTS participants_group_id_fkey;

    ALTER TABLE public.participants
      ADD CONSTRAINT participants_group_id_fkey
      FOREIGN KEY (group_id)
      REFERENCES public.groups (id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'participants_group_id_fkey: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'responses'
  ) THEN
    ALTER TABLE public.responses
      DROP CONSTRAINT IF EXISTS responses_group_id_fkey;

    ALTER TABLE public.responses
      ADD CONSTRAINT responses_group_id_fkey
      FOREIGN KEY (group_id)
      REFERENCES public.groups (id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'responses_group_id_fkey: %', SQLERRM;
END $$;

-- CASCADE opcional: responses → participants (si participant_id existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'responses'
      AND column_name = 'participant_id'
  ) THEN
    ALTER TABLE public.responses
      DROP CONSTRAINT IF EXISTS responses_participant_id_fkey;

    ALTER TABLE public.responses
      ADD CONSTRAINT responses_participant_id_fkey
      FOREIGN KEY (participant_id)
      REFERENCES public.participants (id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'responses_participant_id_fkey: %', SQLERRM;
END $$;

-- Índices útiles para consultas multi-tenant
CREATE INDEX IF NOT EXISTS idx_participants_group_id
  ON public.participants (group_id);

CREATE INDEX IF NOT EXISTS idx_responses_group_id
  ON public.responses (group_id);

COMMIT;

-- =============================================================================
-- 5. POLÍTICAS RLS (Row Level Security) — NO ACTIVAR AÚN
-- =============================================================================
-- Objetivo: aislar datos por organization_id una vez autenticado el manager.
-- Ejecutar en una migración posterior (003_rls_policies.sql) cuando pases de
-- localhost a staging/producción.
--
-- Ejemplo de políticas a implementar:
--
--   ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.groups         ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.participants   ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.responses      ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
--
--   -- Helper: organization_id del usuario autenticado
--   CREATE OR REPLACE FUNCTION public.current_user_organization_id()
--   RETURNS UUID
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$
--     SELECT organization_id
--     FROM public.profiles
--     WHERE id = auth.uid()
--     LIMIT 1;
--   $$;
--
--   -- profiles: cada manager solo ve/edita su propio perfil
--   CREATE POLICY profiles_select_own ON public.profiles
--     FOR SELECT USING (id = auth.uid());
--
--   -- groups: solo equipos del tenant del manager
--   CREATE POLICY groups_tenant_isolation ON public.groups
--     FOR ALL USING (organization_id = public.current_user_organization_id());
--
--   -- participants / responses: vía JOIN o subconsulta al group del tenant
--   CREATE POLICY participants_tenant_isolation ON public.participants
--     FOR ALL USING (
--       group_id IN (
--         SELECT g.id FROM public.groups g
--         WHERE g.organization_id = public.current_user_organization_id()
--       )
--     );
--
--   CREATE POLICY responses_tenant_isolation ON public.responses
--     FOR ALL USING (
--       group_id IN (
--         SELECT g.id FROM public.groups g
--         WHERE g.organization_id = public.current_user_organization_id()
--       )
--     );
--
--   -- survey_responses: filtrar por organization_id directo
--   CREATE POLICY survey_responses_tenant_isolation ON public.survey_responses
--     FOR ALL USING (organization_id = public.current_user_organization_id());
--
-- Nota: durante pruebas en localhost con anon key, mantener RLS desactivado
-- o usar service_role solo en scripts de seed/admin controlado.
-- =============================================================================
