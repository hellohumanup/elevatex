-- =============================================================================
-- Vínculo HR SaaS — 018: Cuestionarios dinámicos ONA (dimensiones de élite)
-- =============================================================================
-- Objetivo:
--   Evolucionar public.survey_questions hacia el modelo de campañas ONA
--   por dimensión (información / confianza / innovación), sin romper EDT.
--
-- Campos canónicos para el frontend dinámico:
--   id, dimension, question_text, max_choices, created_at
--
-- También:
--   • Plantilla global "ONA Élite · Dimensiones" (organization_id NULL)
--   • Seed de 3 preguntas ona_nomination (UUIDs estables)
--   • groups.active_ona_dimension → dimensión activa de la campaña
--
-- Idempotente. Ejecutar en Supabase SQL Editor o vía migraciones.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 1. Evolución de survey_questions (additive; no DROP)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.survey_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension       TEXT,
  question_text   TEXT NOT NULL DEFAULT '',
  max_choices     INT4 NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS dimension TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS question_text TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS max_choices INT4 NOT NULL DEFAULT 3;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Compatibilidad con columnas data-driven / EDT (015)
ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS survey_id UUID;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS question_type TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS order_index INT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS text TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS block TEXT;

ALTER TABLE public.survey_questions
  ADD COLUMN IF NOT EXISTS question_number INT;

-- Backfill question_text desde text legacy
UPDATE public.survey_questions
SET question_text = text
WHERE (question_text IS NULL OR char_length(trim(question_text)) = 0)
  AND text IS NOT NULL
  AND char_length(trim(text)) > 0;

UPDATE public.survey_questions
SET max_choices = 3
WHERE max_choices IS NULL OR max_choices < 1;

UPDATE public.survey_questions
SET created_at = COALESCE(created_at, now())
WHERE created_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'survey_questions_max_choices_positive'
      AND conrelid = 'public.survey_questions'::regclass
  ) THEN
    ALTER TABLE public.survey_questions
      ADD CONSTRAINT survey_questions_max_choices_positive
      CHECK (max_choices > 0);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.survey_questions.dimension IS
  'Dimensión ONA/EDT de la pregunta (ej. informacion, confianza, innovacion).';

COMMENT ON COLUMN public.survey_questions.question_text IS
  'Enunciado exacto mostrado al colaborador.';

COMMENT ON COLUMN public.survey_questions.max_choices IS
  'Máximo de nominaciones permitidas (default 3).';

COMMENT ON COLUMN public.survey_questions.created_at IS
  'Timestamp de creación de la pregunta.';

CREATE INDEX IF NOT EXISTS idx_survey_questions_dimension
  ON public.survey_questions (lower(trim(dimension)))
  WHERE dimension IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_survey_questions_type_dimension
  ON public.survey_questions (question_type, lower(trim(dimension)))
  WHERE question_type = 'ona_nomination';


-- -----------------------------------------------------------------------------
-- 2. Dimensión activa de campaña en el equipo (selección del mánager)
-- -----------------------------------------------------------------------------
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS active_ona_dimension TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'groups_active_ona_dimension_valid'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_active_ona_dimension_valid
      CHECK (
        active_ona_dimension IS NULL
        OR lower(trim(active_ona_dimension)) IN (
          'informacion',
          'confianza',
          'innovacion'
        )
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.groups.active_ona_dimension IS
  'Dimensión ONA activa de la campaña de evaluación (informacion | confianza | innovacion).';


-- -----------------------------------------------------------------------------
-- 3. Vista limpia para el frontend (solo campos canónicos ONA élite)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.ona_elite_questions AS
SELECT
  sq.id,
  lower(trim(sq.dimension)) AS dimension,
  sq.question_text,
  COALESCE(sq.max_choices, 3) AS max_choices,
  sq.created_at
FROM public.survey_questions AS sq
WHERE sq.question_type = 'ona_nomination'
  AND lower(trim(COALESCE(sq.dimension, ''))) IN (
    'informacion',
    'confianza',
    'innovacion'
  )
  AND char_length(trim(COALESCE(sq.question_text, ''))) > 0;

COMMENT ON VIEW public.ona_elite_questions IS
  'Catálogo ONA élite (información / confianza / innovación) para campañas dinámicas.';

GRANT SELECT ON public.ona_elite_questions TO authenticated, anon;


-- -----------------------------------------------------------------------------
-- 4. Seed — plantilla + 3 preguntas estándar de élite
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_survey_id UUID := 'a1000001-0001-4000-8000-000000000000'::uuid;
  v_q_info    UUID := 'a1000001-0001-4000-8000-000000000001'::uuid;
  v_q_trust   UUID := 'a1000001-0001-4000-8000-000000000002'::uuid;
  v_q_innov   UUID := 'a1000001-0001-4000-8000-000000000003'::uuid;
BEGIN
  -- Asegurar fila surveys (plantilla global)
  INSERT INTO public.surveys (id, organization_id, name, is_active, created_at)
  VALUES (
    v_survey_id,
    NULL,
    'ONA Élite · Dimensiones',
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    is_active = true;

  -- Si surveys aún usa `title` (legacy 004) sin `name`
  BEGIN
    EXECUTE $sql$
      UPDATE public.surveys
      SET title = COALESCE(NULLIF(trim(title), ''), 'ONA Élite · Dimensiones')
      WHERE id = 'a1000001-0001-4000-8000-000000000000'::uuid
    $sql$;
  EXCEPTION
    WHEN undefined_column THEN NULL;
  END;

  -- Información
  INSERT INTO public.survey_questions (
    id,
    survey_id,
    question_text,
    question_type,
    dimension,
    order_index,
    max_choices,
    created_at,
    text,
    block,
    question_number
  )
  VALUES (
    v_q_info,
    v_survey_id,
    '¿A quién acudes cuando necesitas información crítica o conocimiento especializado para avanzar en tu trabajo? (Selecciona hasta 3)',
    'ona_nomination',
    'informacion',
    1,
    3,
    now(),
    '¿A quién acudes cuando necesitas información crítica o conocimiento especializado para avanzar en tu trabajo? (Selecciona hasta 3)',
    'informacion',
    1
  )
  ON CONFLICT (id) DO UPDATE
  SET
    question_text = EXCLUDED.question_text,
    question_type = 'ona_nomination',
    dimension = 'informacion',
    max_choices = 3,
    text = EXCLUDED.question_text,
    block = 'informacion';

  -- Confianza
  INSERT INTO public.survey_questions (
    id,
    survey_id,
    question_text,
    question_type,
    dimension,
    order_index,
    max_choices,
    created_at,
    text,
    block,
    question_number
  )
  VALUES (
    v_q_trust,
    v_survey_id,
    '¿En quién confías para hablar con sinceridad sobre problemas delicados del equipo o pedir apoyo cuando lo necesitas? (Selecciona hasta 3)',
    'ona_nomination',
    'confianza',
    2,
    3,
    now(),
    '¿En quién confías para hablar con sinceridad sobre problemas delicados del equipo o pedir apoyo cuando lo necesitas? (Selecciona hasta 3)',
    'confianza',
    2
  )
  ON CONFLICT (id) DO UPDATE
  SET
    question_text = EXCLUDED.question_text,
    question_type = 'ona_nomination',
    dimension = 'confianza',
    max_choices = 3,
    text = EXCLUDED.question_text,
    block = 'confianza';

  -- Innovación
  INSERT INTO public.survey_questions (
    id,
    survey_id,
    question_text,
    question_type,
    dimension,
    order_index,
    max_choices,
    created_at,
    text,
    block,
    question_number
  )
  VALUES (
    v_q_innov,
    v_survey_id,
    '¿Con quién generas las mejores ideas o experimentas enfoques nuevos para mejorar el trabajo del equipo? (Selecciona hasta 3)',
    'ona_nomination',
    'innovacion',
    3,
    3,
    now(),
    '¿Con quién generas las mejores ideas o experimentas enfoques nuevos para mejorar el trabajo del equipo? (Selecciona hasta 3)',
    'innovacion',
    3
  )
  ON CONFLICT (id) DO UPDATE
  SET
    question_text = EXCLUDED.question_text,
    question_type = 'ona_nomination',
    dimension = 'innovacion',
    max_choices = 3,
    text = EXCLUDED.question_text,
    block = 'innovacion';

  RAISE NOTICE 'SEED OK — ONA Élite · Dimensiones survey_id=% (3 preguntas)', v_survey_id;
END $$;

COMMIT;

-- Verificación
SELECT
  id,
  dimension,
  max_choices,
  left(question_text, 72) AS question_preview,
  created_at
FROM public.ona_elite_questions
ORDER BY
  CASE dimension
    WHEN 'informacion' THEN 1
    WHEN 'confianza' THEN 2
    WHEN 'innovacion' THEN 3
    ELSE 9
  END;
