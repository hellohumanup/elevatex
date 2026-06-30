-- =============================================================================
-- Vínculo HR SaaS — 015: Cuestionarios data-driven (surveys + survey_questions)
-- =============================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
--
-- Objetivo:
--   Migrar cuestionarios estáticos a un modelo dinámico en BD:
--     • surveys           → encuesta por organización (o plantilla global)
--     • survey_questions  → preguntas tipadas (EDT / ONA) ordenadas
--
-- FIX legacy:
--   Si survey_questions ya existía sin survey_id (CREATE TABLE IF NOT EXISTS
--   no la recreaba), esta migración añade survey_id, id y columnas nuevas
--   con ALTER TABLE explícitos antes de índices, RLS y SEED.
--
-- Idempotente: IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 0a. Asegurar organizations (FK de surveys)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT organizations_name_not_empty
    CHECK (char_length(trim(name)) > 0)
);


-- -----------------------------------------------------------------------------
-- 0b. Helper — organization_id del manager autenticado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_organization_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    p.organization_id,
    (
      SELECT g.organization_id
      FROM public.groups AS g
      WHERE g.manager_id = p.id
        AND g.organization_id IS NOT NULL
      ORDER BY g.created_at DESC NULLS LAST
      LIMIT 1
    )
  )
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
$$;

COMMENT ON FUNCTION public.auth_user_organization_id() IS
  'UUID de la organización del manager autenticado (profiles.organization_id).';


-- -----------------------------------------------------------------------------
-- 1. Tabla surveys (crear o evolucionar desde migración 004)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.surveys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  name            TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'surveys_organization_id_fkey'
      AND conrelid = 'public.surveys'::regclass
  ) THEN
    ALTER TABLE public.surveys
      ADD CONSTRAINT surveys_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations (id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'surveys'
      AND column_name = 'title'
  ) THEN
    EXECUTE $sql$
      UPDATE public.surveys
      SET name = title
      WHERE (name IS NULL OR char_length(trim(name)) = 0)
        AND title IS NOT NULL
        AND char_length(trim(title)) > 0
    $sql$;
  END IF;
END $$;

UPDATE public.surveys
SET name = 'Encuesta sin nombre'
WHERE name IS NULL OR char_length(trim(name)) = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'surveys_name_not_empty'
      AND conrelid = 'public.surveys'::regclass
  ) THEN
    ALTER TABLE public.surveys
      ADD CONSTRAINT surveys_name_not_empty
      CHECK (char_length(trim(name)) > 0);
  END IF;
END $$;

ALTER TABLE public.surveys
  ALTER COLUMN name SET NOT NULL;

COMMENT ON TABLE public.surveys IS
  '[Data-driven] Cuestionario dinámico. organization_id NULL = plantilla global reutilizable.';

COMMENT ON COLUMN public.surveys.organization_id IS
  'Organización propietaria. NULL = plantilla global (solo lectura para managers).';

COMMENT ON COLUMN public.surveys.name IS
  'Nombre visible del cuestionario (ej. EDT Q1 2026 · Equipo Ventas).';

COMMENT ON COLUMN public.surveys.is_active IS
  'Si false, oculta la encuesta para colaboradores anon (salvo bypass service_role).';

CREATE INDEX IF NOT EXISTS idx_surveys_organization_id
  ON public.surveys (organization_id);

CREATE INDEX IF NOT EXISTS idx_surveys_is_active
  ON public.surveys (is_active)
  WHERE is_active = true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'surveys'
      AND column_name = 'tenant_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.surveys ALTER COLUMN tenant_id DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'surveys'
      AND column_name = 'title'
  ) THEN
    EXECUTE 'ALTER TABLE public.surveys ALTER COLUMN title DROP NOT NULL';
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. Tabla survey_questions — evolución legacy explícita
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.survey_questions') IS NULL THEN
    CREATE TABLE public.survey_questions (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      survey_id      UUID NOT NULL,
      question_text  TEXT NOT NULL,
      question_type  TEXT NOT NULL,
      dimension      TEXT,
      order_index    INT  NOT NULL,

      CONSTRAINT survey_questions_text_not_empty
        CHECK (char_length(trim(question_text)) > 0),

      CONSTRAINT survey_questions_type_valid
        CHECK (question_type IN ('edt_metric', 'ona_nomination')),

      CONSTRAINT survey_questions_order_positive
        CHECK (order_index > 0),

      CONSTRAINT survey_questions_unique_order_per_survey
        UNIQUE (survey_id, order_index),

      CONSTRAINT survey_questions_survey_id_fkey
        FOREIGN KEY (survey_id)
        REFERENCES public.surveys (id)
        ON DELETE CASCADE
    );
  END IF;
END $$;

-- Columnas legacy 004 (por si la tabla existía con otro shape)
ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS survey_id UUID;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS text TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS block TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS question_number INT;

-- Columnas data-driven 015
ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS question_text TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS question_type TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS dimension TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS order_index INT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS option_a TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS option_b TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS option_c TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS option_d TEXT;

-- PK en id si faltaba (tablas legacy sin PK uuid)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.survey_questions'::regclass
      AND contype = 'p'
  ) THEN
    UPDATE public.survey_questions
    SET id = gen_random_uuid()
    WHERE id IS NULL;

    ALTER TABLE public.survey_questions
      ALTER COLUMN id SET NOT NULL;

    ALTER TABLE public.survey_questions
      ADD CONSTRAINT survey_questions_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN
    NULL;
  WHEN duplicate_object THEN
    NULL;
END $$;

UPDATE public.survey_questions
SET id = gen_random_uuid()
WHERE id IS NULL;

-- FK survey_id → surveys (crítico si la columna se acaba de añadir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'survey_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'survey_questions_survey_id_fkey'
      AND conrelid = 'public.survey_questions'::regclass
  ) THEN
    ALTER TABLE public.survey_questions
      ADD CONSTRAINT survey_questions_survey_id_fkey
      FOREIGN KEY (survey_id)
      REFERENCES public.surveys (id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Backfills legacy → data-driven
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'text'
  ) THEN
    EXECUTE $sql$
      UPDATE public.survey_questions
      SET question_text = text
      WHERE (question_text IS NULL OR char_length(trim(question_text)) = 0)
        AND text IS NOT NULL
        AND char_length(trim(text)) > 0
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'block'
  ) THEN
    EXECUTE $sql$
      UPDATE public.survey_questions
      SET dimension = block
      WHERE dimension IS NULL
        AND block IS NOT NULL
        AND char_length(trim(block)) > 0
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'question_number'
  ) THEN
    EXECUTE $sql$
      UPDATE public.survey_questions
      SET order_index = question_number
      WHERE order_index IS NULL
        AND question_number IS NOT NULL
        AND question_number > 0
    $sql$;
  END IF;
END $$;

UPDATE public.survey_questions
SET question_type = 'edt_metric'
WHERE question_type IS NULL OR char_length(trim(question_type)) = 0;

UPDATE public.survey_questions
SET question_text = 'Pregunta pendiente de configurar'
WHERE question_text IS NULL OR char_length(trim(question_text)) = 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'text'
  ) THEN
    EXECUTE $sql$
      UPDATE public.survey_questions
      SET question_text = text
      WHERE (question_text IS NULL OR char_length(trim(question_text)) = 0)
        AND text IS NOT NULL
        AND char_length(trim(text)) > 0
    $sql$;
  END IF;
END $$;

UPDATE public.survey_questions
SET order_index = COALESCE(question_number, 1)
WHERE order_index IS NULL OR order_index <= 0;

-- Constraints data-driven (solo si no existen)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'survey_questions_text_not_empty'
      AND conrelid = 'public.survey_questions'::regclass
  ) THEN
    ALTER TABLE public.survey_questions
      ADD CONSTRAINT survey_questions_text_not_empty
      CHECK (char_length(trim(question_text)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'survey_questions_type_valid'
      AND conrelid = 'public.survey_questions'::regclass
  ) THEN
    ALTER TABLE public.survey_questions
      ADD CONSTRAINT survey_questions_type_valid
      CHECK (question_type IN ('edt_metric', 'ona_nomination'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'survey_questions_order_positive'
      AND conrelid = 'public.survey_questions'::regclass
  ) THEN
    ALTER TABLE public.survey_questions
      ADD CONSTRAINT survey_questions_order_positive
      CHECK (order_index > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'survey_questions_unique_order_per_survey'
      AND conrelid = 'public.survey_questions'::regclass
  ) THEN
    ALTER TABLE public.survey_questions
      ADD CONSTRAINT survey_questions_unique_order_per_survey
      UNIQUE (survey_id, order_index);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

ALTER TABLE public.survey_questions
  ALTER COLUMN question_text SET NOT NULL;

ALTER TABLE public.survey_questions
  ALTER COLUMN question_type SET NOT NULL;

ALTER TABLE public.survey_questions
  ALTER COLUMN order_index SET NOT NULL;

COMMENT ON TABLE public.survey_questions IS
  '[Data-driven] Preguntas de un cuestionario. Tipos: edt_metric | ona_nomination.';

COMMENT ON COLUMN public.survey_questions.survey_id IS
  'FK al cuestionario padre (public.surveys.id). ON DELETE CASCADE.';

COMMENT ON COLUMN public.survey_questions.question_type IS
  'edt_metric = escala A–D EDT; ona_nomination = nominación ONA (influencia/comunicación).';

COMMENT ON COLUMN public.survey_questions.dimension IS
  'Bloque EDT (Entorno, Dirección, Talento, Transversal) o eje ONA (influencia, comunicacion).';

COMMENT ON COLUMN public.survey_questions.order_index IS
  'Orden de presentación dentro del survey (único por survey_id).';

-- Índices solo si survey_id existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'survey_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_survey_questions_survey_id ON public.survey_questions (survey_id)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'survey_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'order_index'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_survey_questions_survey_order ON public.survey_questions (survey_id, order_index)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'survey_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'question_type'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_survey_questions_type ON public.survey_questions (survey_id, question_type)';
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 3. Permisos base
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.surveys          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_questions TO authenticated;

GRANT SELECT ON public.surveys          TO anon;
GRANT SELECT ON public.survey_questions TO anon;


-- -----------------------------------------------------------------------------
-- 4. RLS — surveys
-- -----------------------------------------------------------------------------
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS surveys_public_select            ON public.surveys;
DROP POLICY IF EXISTS surveys_tenant_select            ON public.surveys;
DROP POLICY IF EXISTS surveys_tenant_insert            ON public.surveys;
DROP POLICY IF EXISTS surveys_tenant_update            ON public.surveys;
DROP POLICY IF EXISTS surveys_tenant_delete            ON public.surveys;
DROP POLICY IF EXISTS surveys_manager_tenant_all       ON public.surveys;
DROP POLICY IF EXISTS surveys_public_read              ON public.surveys;
DROP POLICY IF EXISTS "Managers pueden ver sus encuestas" ON public.surveys;
DROP POLICY IF EXISTS surveys_manager_select           ON public.surveys;
DROP POLICY IF EXISTS surveys_manager_insert           ON public.surveys;
DROP POLICY IF EXISTS surveys_manager_update           ON public.surveys;
DROP POLICY IF EXISTS surveys_manager_delete           ON public.surveys;
DROP POLICY IF EXISTS surveys_anon_select              ON public.surveys;

CREATE POLICY surveys_manager_select
  ON public.surveys
  FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = public.auth_user_organization_id()
  );

CREATE POLICY surveys_manager_insert
  ON public.surveys
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.auth_user_organization_id()
  );

CREATE POLICY surveys_manager_update
  ON public.surveys
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.auth_user_organization_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.auth_user_organization_id()
  );

CREATE POLICY surveys_manager_delete
  ON public.surveys
  FOR DELETE
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.auth_user_organization_id()
  );

CREATE POLICY surveys_anon_select
  ON public.surveys
  FOR SELECT
  TO anon
  USING (is_active = true);


-- -----------------------------------------------------------------------------
-- 5. RLS — survey_questions (requiere survey_id)
-- -----------------------------------------------------------------------------
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS survey_questions_public_select       ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_tenant_select       ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_tenant_insert       ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_tenant_update       ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_tenant_delete       ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_manager_tenant_all  ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_public_read         ON public.survey_questions;
DROP POLICY IF EXISTS "Lectura auténticada de preguntas" ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_manager_select      ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_manager_insert      ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_manager_update      ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_manager_delete      ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_anon_select         ON public.survey_questions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'survey_id'
  ) THEN
    RAISE EXCEPTION
      'survey_questions.survey_id sigue sin existir tras la migración. Revisa el esquema legacy manualmente.';
  END IF;

  EXECUTE $pol$
    CREATE POLICY survey_questions_manager_select
      ON public.survey_questions
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.surveys AS s
          WHERE s.id = survey_questions.survey_id
            AND (
              s.organization_id IS NULL
              OR s.organization_id = public.auth_user_organization_id()
            )
        )
      )
  $pol$;

  EXECUTE $pol$
    CREATE POLICY survey_questions_manager_insert
      ON public.survey_questions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.surveys AS s
          WHERE s.id = survey_questions.survey_id
            AND s.organization_id IS NOT NULL
            AND s.organization_id = public.auth_user_organization_id()
        )
      )
  $pol$;

  EXECUTE $pol$
    CREATE POLICY survey_questions_manager_update
      ON public.survey_questions
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.surveys AS s
          WHERE s.id = survey_questions.survey_id
            AND s.organization_id IS NOT NULL
            AND s.organization_id = public.auth_user_organization_id()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.surveys AS s
          WHERE s.id = survey_questions.survey_id
            AND s.organization_id IS NOT NULL
            AND s.organization_id = public.auth_user_organization_id()
        )
      )
  $pol$;

  EXECUTE $pol$
    CREATE POLICY survey_questions_manager_delete
      ON public.survey_questions
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.surveys AS s
          WHERE s.id = survey_questions.survey_id
            AND s.organization_id IS NOT NULL
            AND s.organization_id = public.auth_user_organization_id()
        )
      )
  $pol$;

  EXECUTE $pol$
    CREATE POLICY survey_questions_anon_select
      ON public.survey_questions
      FOR SELECT
      TO anon
      USING (
        EXISTS (
          SELECT 1
          FROM public.surveys AS s
          WHERE s.id = survey_questions.survey_id
            AND s.is_active = true
        )
      )
  $pol$;
END $$;


-- -----------------------------------------------------------------------------
-- 6. SEED — Plantilla global "EDT + ONA Estándar" (organization_id NULL)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_survey_id UUID;
  v_has_legacy_text BOOLEAN;
  v_has_survey_id BOOLEAN;
  v_has_order_index BOOLEAN;
  v_has_options BOOLEAN;
  -- Opciones EDT estándar (escala A–D)
  c_edt_option_a CONSTANT TEXT := 'Totalmente de acuerdo';
  c_edt_option_b CONSTANT TEXT := 'De acuerdo';
  c_edt_option_c CONSTANT TEXT := 'En desacuerdo';
  c_edt_option_d CONSTANT TEXT := 'Totalmente en desacuerdo';
  c_ona_option_empty CONSTANT TEXT := '';
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'survey_id'
  ) INTO v_has_survey_id;

  IF NOT v_has_survey_id THEN
    RAISE EXCEPTION 'SEED abortado: falta survey_questions.survey_id';
  END IF;

  SELECT s.id
  INTO v_survey_id
  FROM public.surveys AS s
  WHERE s.organization_id IS NULL
    AND s.name = 'Plantilla EDT + ONA Estándar'
  LIMIT 1;

  IF v_survey_id IS NULL THEN
    INSERT INTO public.surveys (organization_id, name, is_active)
    VALUES (NULL, 'Plantilla EDT + ONA Estándar', true)
    RETURNING id INTO v_survey_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'surveys'
      AND column_name = 'title'
  ) THEN
    UPDATE public.surveys
    SET title = name
    WHERE id = v_survey_id
      AND (title IS NULL OR title IS DISTINCT FROM name);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'text'
  ) INTO v_has_legacy_text;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'order_index'
  ) INTO v_has_order_index;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'option_a'
  ) INTO v_has_options;

  IF v_has_order_index THEN
    DELETE FROM public.survey_questions
    WHERE survey_id = v_survey_id
      AND order_index BETWEEN 1 AND 6;
  ELSE
    DELETE FROM public.survey_questions
    WHERE survey_id = v_survey_id
      AND question_number BETWEEN 1 AND 6;
  END IF;

  IF v_has_legacy_text AND v_has_options THEN
    INSERT INTO public.survey_questions (
      survey_id,
      question_text,
      question_type,
      dimension,
      order_index,
      text,
      block,
      question_number,
      option_a,
      option_b,
      option_c,
      option_d
    )
    VALUES
      (
        v_survey_id,
        'Siento que el ambiente de trabajo del equipo es respetuoso y colaborativo.',
        'edt_metric',
        'Entorno',
        1,
        'Siento que el ambiente de trabajo del equipo es respetuoso y colaborativo.',
        'Entorno',
        1,
        c_edt_option_a,
        c_edt_option_b,
        c_edt_option_c,
        c_edt_option_d
      ),
      (
        v_survey_id,
        'Existe un clima psicológico seguro para expresar opiniones sin miedo.',
        'edt_metric',
        'Entorno',
        2,
        'Existe un clima psicológico seguro para expresar opiniones sin miedo.',
        'Entorno',
        2,
        c_edt_option_a,
        c_edt_option_b,
        c_edt_option_c,
        c_edt_option_d
      ),
      (
        v_survey_id,
        'Conozco con claridad la prioridad estratégica del equipo para este trimestre.',
        'edt_metric',
        'Dirección',
        3,
        'Conozco con claridad la prioridad estratégica del equipo para este trimestre.',
        'Dirección',
        3,
        c_edt_option_a,
        c_edt_option_b,
        c_edt_option_c,
        c_edt_option_d
      ),
      (
        v_survey_id,
        'Mi responsable directo modela los comportamientos que espera del equipo.',
        'edt_metric',
        'Dirección',
        4,
        'Mi responsable directo modela los comportamientos que espera del equipo.',
        'Dirección',
        4,
        c_edt_option_a,
        c_edt_option_b,
        c_edt_option_c,
        c_edt_option_d
      ),
      (
        v_survey_id,
        '¿Con qué compañeros te sientes más alineado/a en la visión y los objetivos del equipo? (Selecciona hasta 3)',
        'ona_nomination',
        'influencia',
        5,
        '¿Con qué compañeros te sientes más alineado/a en la visión y los objetivos del equipo? (Selecciona hasta 3)',
        'influencia',
        5,
        c_ona_option_empty,
        c_ona_option_empty,
        c_ona_option_empty,
        c_ona_option_empty
      ),
      (
        v_survey_id,
        '¿Con quién te comunicas con más frecuencia en el día a día para resolver el trabajo? (Selecciona hasta 3)',
        'ona_nomination',
        'comunicacion',
        6,
        '¿Con quién te comunicas con más frecuencia en el día a día para resolver el trabajo? (Selecciona hasta 3)',
        'comunicacion',
        6,
        c_ona_option_empty,
        c_ona_option_empty,
        c_ona_option_empty,
        c_ona_option_empty
      );
  ELSIF v_has_options THEN
    INSERT INTO public.survey_questions (
      survey_id,
      question_text,
      question_type,
      dimension,
      order_index,
      option_a,
      option_b,
      option_c,
      option_d
    )
    VALUES
      (
        v_survey_id,
        'Siento que el ambiente de trabajo del equipo es respetuoso y colaborativo.',
        'edt_metric',
        'Entorno',
        1,
        c_edt_option_a,
        c_edt_option_b,
        c_edt_option_c,
        c_edt_option_d
      ),
      (
        v_survey_id,
        'Existe un clima psicológico seguro para expresar opiniones sin miedo.',
        'edt_metric',
        'Entorno',
        2,
        c_edt_option_a,
        c_edt_option_b,
        c_edt_option_c,
        c_edt_option_d
      ),
      (
        v_survey_id,
        'Conozco con claridad la prioridad estratégica del equipo para este trimestre.',
        'edt_metric',
        'Dirección',
        3,
        c_edt_option_a,
        c_edt_option_b,
        c_edt_option_c,
        c_edt_option_d
      ),
      (
        v_survey_id,
        'Mi responsable directo modela los comportamientos que espera del equipo.',
        'edt_metric',
        'Dirección',
        4,
        c_edt_option_a,
        c_edt_option_b,
        c_edt_option_c,
        c_edt_option_d
      ),
      (
        v_survey_id,
        '¿Con qué compañeros te sientes más alineado/a en la visión y los objetivos del equipo? (Selecciona hasta 3)',
        'ona_nomination',
        'influencia',
        5,
        c_ona_option_empty,
        c_ona_option_empty,
        c_ona_option_empty,
        c_ona_option_empty
      ),
      (
        v_survey_id,
        '¿Con quién te comunicas con más frecuencia en el día a día para resolver el trabajo? (Selecciona hasta 3)',
        'ona_nomination',
        'comunicacion',
        6,
        c_ona_option_empty,
        c_ona_option_empty,
        c_ona_option_empty,
        c_ona_option_empty
      );
  ELSIF v_has_legacy_text THEN
    INSERT INTO public.survey_questions (
      survey_id,
      question_text,
      question_type,
      dimension,
      order_index,
      text,
      block,
      question_number
    )
    VALUES
      (
        v_survey_id,
        'Siento que el ambiente de trabajo del equipo es respetuoso y colaborativo.',
        'edt_metric',
        'Entorno',
        1,
        'Siento que el ambiente de trabajo del equipo es respetuoso y colaborativo.',
        'Entorno',
        1
      ),
      (
        v_survey_id,
        'Existe un clima psicológico seguro para expresar opiniones sin miedo.',
        'edt_metric',
        'Entorno',
        2,
        'Existe un clima psicológico seguro para expresar opiniones sin miedo.',
        'Entorno',
        2
      ),
      (
        v_survey_id,
        'Conozco con claridad la prioridad estratégica del equipo para este trimestre.',
        'edt_metric',
        'Dirección',
        3,
        'Conozco con claridad la prioridad estratégica del equipo para este trimestre.',
        'Dirección',
        3
      ),
      (
        v_survey_id,
        'Mi responsable directo modela los comportamientos que espera del equipo.',
        'edt_metric',
        'Dirección',
        4,
        'Mi responsable directo modela los comportamientos que espera del equipo.',
        'Dirección',
        4
      ),
      (
        v_survey_id,
        '¿Con qué compañeros te sientes más alineado/a en la visión y los objetivos del equipo? (Selecciona hasta 3)',
        'ona_nomination',
        'influencia',
        5,
        '¿Con qué compañeros te sientes más alineado/a en la visión y los objetivos del equipo? (Selecciona hasta 3)',
        'influencia',
        5
      ),
      (
        v_survey_id,
        '¿Con quién te comunicas con más frecuencia en el día a día para resolver el trabajo? (Selecciona hasta 3)',
        'ona_nomination',
        'comunicacion',
        6,
        '¿Con quién te comunicas con más frecuencia en el día a día para resolver el trabajo? (Selecciona hasta 3)',
        'comunicacion',
        6
      );
  ELSE
    INSERT INTO public.survey_questions (
      survey_id,
      question_text,
      question_type,
      dimension,
      order_index
    )
    VALUES
      (
        v_survey_id,
        'Siento que el ambiente de trabajo del equipo es respetuoso y colaborativo.',
        'edt_metric',
        'Entorno',
        1
      ),
      (
        v_survey_id,
        'Existe un clima psicológico seguro para expresar opiniones sin miedo.',
        'edt_metric',
        'Entorno',
        2
      ),
      (
        v_survey_id,
        'Conozco con claridad la prioridad estratégica del equipo para este trimestre.',
        'edt_metric',
        'Dirección',
        3
      ),
      (
        v_survey_id,
        'Mi responsable directo modela los comportamientos que espera del equipo.',
        'edt_metric',
        'Dirección',
        4
      ),
      (
        v_survey_id,
        '¿Con qué compañeros te sientes más alineado/a en la visión y los objetivos del equipo? (Selecciona hasta 3)',
        'ona_nomination',
        'influencia',
        5
      ),
      (
        v_survey_id,
        '¿Con quién te comunicas con más frecuencia en el día a día para resolver el trabajo? (Selecciona hasta 3)',
        'ona_nomination',
        'comunicacion',
        6
      );
  END IF;

  RAISE NOTICE 'SEED OK — Plantilla EDT + ONA Estándar survey_id = %', v_survey_id;
END $$;


COMMIT;


-- =============================================================================
-- 7. Verificación post-ejecución (ejecutar DESPUÉS del COMMIT anterior)
-- =============================================================================
DO $$
DECLARE
  v_has_survey_id BOOLEAN;
  v_count INT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'survey_questions'
      AND column_name = 'survey_id'
  ) INTO v_has_survey_id;

  IF NOT v_has_survey_id THEN
    RAISE EXCEPTION 'Verificación fallida: survey_questions.survey_id no existe';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.survey_questions AS sq
  INNER JOIN public.surveys AS s ON s.id = sq.survey_id
  WHERE s.organization_id IS NULL
    AND s.name = 'Plantilla EDT + ONA Estándar';

  RAISE NOTICE 'Verificación OK — % preguntas en Plantilla EDT + ONA Estándar', v_count;
END $$;
