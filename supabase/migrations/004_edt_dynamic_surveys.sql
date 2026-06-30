-- =============================================================================
-- Vínculo HR SaaS — Cuestionarios dinámicos EDT (surveys + survey_questions)
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
--
-- Objetivo:
--   • surveys          → cuestionario EDT por tenant (28 preguntas configurables)
--   • survey_questions → preguntas numeradas por bloque (Entorno, Dirección…)
--   • responses        → columna survey_id para vincular respuestas al cuestionario
--
-- Requisitos previos:
--   • Migración 003 (public.tenants, public.profiles, RLS en groups)
--   • Tabla public.responses existente (MVP)
--
-- RLS:
--   • Managers (authenticated): CRUD solo en surveys de su tenant_id
--   • Participantes (anon + link): SELECT público en surveys y survey_questions
--     (quien conoce el UUID del survey puede cargar el cuestionario)
--
-- Idempotente: IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 1. Tabla surveys
--    Un cuestionario EDT pertenece a un único tenant.
--    El participante accede vía link público con el UUID del survey.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.surveys (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT surveys_title_not_empty CHECK (char_length(trim(title)) > 0)
);

COMMENT ON TABLE public.surveys IS
  '[EDT] Cuestionario dinámico por tenant. Lectura pública vía link (UUID).';

COMMENT ON COLUMN public.surveys.tenant_id IS
  'Tenant propietario. ON DELETE CASCADE elimina cuestionarios del tenant.';

COMMENT ON COLUMN public.surveys.title IS
  'Título visible del cuestionario (ej. EDT ElevateX Q1 2026).';

CREATE INDEX IF NOT EXISTS idx_surveys_tenant_id
  ON public.surveys (tenant_id);


-- -----------------------------------------------------------------------------
-- 2. Tabla survey_questions
--    Preguntas ordenadas por question_number (1–28 en la EDT oficial).
--    block agrupa por pilar: Entorno, Dirección, Talento, EDT Transversal.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.survey_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id       UUID NOT NULL REFERENCES public.surveys (id) ON DELETE CASCADE,
  question_number INT  NOT NULL,
  text            TEXT NOT NULL,
  block           TEXT NOT NULL,

  CONSTRAINT survey_questions_text_not_empty CHECK (char_length(trim(text)) > 0),
  CONSTRAINT survey_questions_block_not_empty CHECK (char_length(trim(block)) > 0),
  CONSTRAINT survey_questions_number_positive CHECK (question_number > 0),
  CONSTRAINT survey_questions_unique_number_per_survey
    UNIQUE (survey_id, question_number)
);

COMMENT ON TABLE public.survey_questions IS
  '[EDT] Preguntas del cuestionario. Lectura pública junto al survey padre.';

COMMENT ON COLUMN public.survey_questions.question_number IS
  'Orden EDT (1–28). Debe ser único dentro del mismo survey_id.';

COMMENT ON COLUMN public.survey_questions.text IS
  'Enunciado de la pregunta mostrado al participante.';

COMMENT ON COLUMN public.survey_questions.block IS
  'Pilar EDT: Entorno (1–8), Dirección (9–16), Talento (17–24), EDT Transversal (25–28).';

CREATE INDEX IF NOT EXISTS idx_survey_questions_survey_id
  ON public.survey_questions (survey_id);

CREATE INDEX IF NOT EXISTS idx_survey_questions_block
  ON public.survey_questions (survey_id, block);


-- -----------------------------------------------------------------------------
-- 3. Columna survey_id en responses
--    Vincula cada respuesta al cuestionario EDT activo del equipo.
-- -----------------------------------------------------------------------------
ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS survey_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'responses_survey_id_fkey'
      AND conrelid = 'public.responses'::regclass
  ) THEN
    ALTER TABLE public.responses
      ADD CONSTRAINT responses_survey_id_fkey
      FOREIGN KEY (survey_id)
      REFERENCES public.surveys (id)
      ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN public.responses.survey_id IS
  '[EDT] Cuestionario al que pertenece la respuesta. CASCADE si se elimina el survey.';

CREATE INDEX IF NOT EXISTS idx_responses_survey_id
  ON public.responses (survey_id);


-- -----------------------------------------------------------------------------
-- 4. Row Level Security — surveys
-- -----------------------------------------------------------------------------

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

-- Lectura pública: el participante con el link (UUID) puede cargar el cuestionario.
DROP POLICY IF EXISTS surveys_public_select ON public.surveys;
CREATE POLICY surveys_public_select
  ON public.surveys
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Managers: ver solo surveys de su tenant.
DROP POLICY IF EXISTS surveys_tenant_select ON public.surveys;
CREATE POLICY surveys_tenant_select
  ON public.surveys
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT p.tenant_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS surveys_tenant_insert ON public.surveys;
CREATE POLICY surveys_tenant_insert
  ON public.surveys
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

DROP POLICY IF EXISTS surveys_tenant_update ON public.surveys;
CREATE POLICY surveys_tenant_update
  ON public.surveys
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (
      SELECT p.tenant_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id = (
      SELECT p.tenant_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS surveys_tenant_delete ON public.surveys;
CREATE POLICY surveys_tenant_delete
  ON public.surveys
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (
      SELECT p.tenant_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 5. Row Level Security — survey_questions
--    La administración hereda el tenant del survey padre.
-- -----------------------------------------------------------------------------

ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

-- Lectura pública: necesaria para renderizar el cuestionario sin login.
DROP POLICY IF EXISTS survey_questions_public_select ON public.survey_questions;
CREATE POLICY survey_questions_public_select
  ON public.survey_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Managers: SELECT reforzado por tenant (redundante con público, documenta intención).
DROP POLICY IF EXISTS survey_questions_tenant_select ON public.survey_questions;
CREATE POLICY survey_questions_tenant_select
  ON public.survey_questions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.surveys AS s
      INNER JOIN public.profiles AS p ON p.tenant_id = s.tenant_id
      WHERE s.id = survey_questions.survey_id
        AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS survey_questions_tenant_insert ON public.survey_questions;
CREATE POLICY survey_questions_tenant_insert
  ON public.survey_questions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.surveys AS s
      INNER JOIN public.profiles AS p ON p.tenant_id = s.tenant_id
      WHERE s.id = survey_questions.survey_id
        AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS survey_questions_tenant_update ON public.survey_questions;
CREATE POLICY survey_questions_tenant_update
  ON public.survey_questions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.surveys AS s
      INNER JOIN public.profiles AS p ON p.tenant_id = s.tenant_id
      WHERE s.id = survey_questions.survey_id
        AND p.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.surveys AS s
      INNER JOIN public.profiles AS p ON p.tenant_id = s.tenant_id
      WHERE s.id = survey_questions.survey_id
        AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS survey_questions_tenant_delete ON public.survey_questions;
CREATE POLICY survey_questions_tenant_delete
  ON public.survey_questions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.surveys AS s
      INNER JOIN public.profiles AS p ON p.tenant_id = s.tenant_id
      WHERE s.id = survey_questions.survey_id
        AND p.id = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 6. Notas post-migración
-- -----------------------------------------------------------------------------
-- • Seed EDT: INSERT en surveys + 28 filas en survey_questions por tenant.
-- • Link participante: /cuestionario/{survey_id} — anon SELECT ya permitido.
-- • INSERT en responses desde participantes: considerar política anon INSERT
--   filtrada por survey_id + participant_id en migración posterior.
-- • service_role bypass RLS (uso server-side only).

COMMIT;
