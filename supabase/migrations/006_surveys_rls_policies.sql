-- =============================================================================
-- Vínculo HR SaaS — RLS: surveys + survey_questions
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
--
-- Objetivo:
--   • Managers autenticados: ALL en surveys solo de su tenant (profiles.tenant_id)
--   • Participantes (anon): SELECT público en surveys y survey_questions
--     para cargar el cuestionario vía enlace mágico sin registro
--
-- Requisitos previos:
--   • Migración 004 (tablas surveys, survey_questions)
--   • Migración 003 (public.profiles con tenant_id)
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- =============================================================================

BEGIN;


-- -----------------------------------------------------------------------------
-- 1. Activar Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 2. Helper conceptual (inline en cada política)
--    tenant del manager autenticado:
--      (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- 3. Políticas — surveys
-- -----------------------------------------------------------------------------

-- Elimina políticas granulares previas (migración 004) para evitar solapamientos.
DROP POLICY IF EXISTS surveys_public_select ON public.surveys;
DROP POLICY IF EXISTS surveys_tenant_select ON public.surveys;
DROP POLICY IF EXISTS surveys_tenant_insert ON public.surveys;
DROP POLICY IF EXISTS surveys_tenant_update ON public.surveys;
DROP POLICY IF EXISTS surveys_tenant_delete ON public.surveys;
DROP POLICY IF EXISTS surveys_manager_tenant_all ON public.surveys;
DROP POLICY IF EXISTS surveys_public_read ON public.surveys;

-- Managers: SELECT, INSERT, UPDATE y DELETE solo en surveys de su tenant.
CREATE POLICY surveys_manager_tenant_all
  ON public.surveys
  FOR ALL
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

-- Lectura pública (enlace mágico): anon y authenticated pueden leer surveys.
CREATE POLICY surveys_public_read
  ON public.surveys
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- -----------------------------------------------------------------------------
-- 4. Políticas — survey_questions
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS survey_questions_public_select ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_tenant_select ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_tenant_insert ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_tenant_update ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_tenant_delete ON public.survey_questions;
DROP POLICY IF EXISTS survey_questions_public_read ON public.survey_questions;

-- Managers: CRUD de preguntas solo en surveys de su tenant (hereda aislamiento del padre).
CREATE POLICY survey_questions_manager_tenant_all
  ON public.survey_questions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.surveys AS s
      INNER JOIN public.profiles AS p ON p.tenant_id = s.tenant_id
      WHERE s.id = survey_questions.survey_id
        AND p.id = auth.uid()
        AND s.tenant_id IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.surveys AS s
      INNER JOIN public.profiles AS p ON p.tenant_id = s.tenant_id
      WHERE s.id = survey_questions.survey_id
        AND p.id = auth.uid()
        AND s.tenant_id IS NOT NULL
    )
  );

-- Lectura pública: el participante anónimo puede cargar preguntas del cuestionario.
CREATE POLICY survey_questions_public_read
  ON public.survey_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);


COMMIT;


-- • La política ALL en survey_questions permite a los Managers editar preguntas
--   del survey de su tenant (complemento necesario al ALL de surveys).
-- • service_role bypass RLS (uso server-side only).
