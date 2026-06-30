-- =============================================================================
-- Vínculo HR SaaS — Fix RLS: lectura pública surveys/survey_questions
--
-- La migración 006 restringió SELECT público solo al rol anon. Los colaboradores
-- que abren el cuestionario con sesión activa (authenticated) quedaban sin filas.
-- Restaura el comportamiento de 004: SELECT para anon y authenticated.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS surveys_public_read ON public.surveys;
CREATE POLICY surveys_public_read
  ON public.surveys
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS survey_questions_public_read ON public.survey_questions;
CREATE POLICY survey_questions_public_read
  ON public.survey_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);

COMMIT;
