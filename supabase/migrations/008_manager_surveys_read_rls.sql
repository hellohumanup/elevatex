-- =============================================================================
-- Vínculo HR SaaS — RLS: lectura Manager en surveys + survey_questions
--
-- Corrige 403 / arrays vacíos para Managers autenticados:
--   • GRANT SELECT explícito a authenticated y anon
--   • Política SELECT por tenant en surveys (Managers)
--   • Lectura amplia de survey_questions (authenticated + anon)
--   • Perfil propio legible (tenant_id para filtrar encuestas)
--   • Lectura de responses del tenant (conteos en panel admin)
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Permisos base (PostgREST devuelve 403 si falta GRANT)
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.surveys TO authenticated, anon;
GRANT SELECT ON public.survey_questions TO authenticated, anon;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.responses TO authenticated;


-- -----------------------------------------------------------------------------
-- 1. profiles — el Manager debe leer su tenant_id
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());


-- -----------------------------------------------------------------------------
-- 2. surveys — lectura Manager por tenant (+ políticas previas intactas)
-- -----------------------------------------------------------------------------
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers pueden ver sus encuestas" ON public.surveys;
CREATE POLICY "Managers pueden ver sus encuestas"
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

-- Refuerzo lectura pública (cuestionario + Managers sin perfil completo)
DROP POLICY IF EXISTS surveys_public_read ON public.surveys;
CREATE POLICY surveys_public_read
  ON public.surveys
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- -----------------------------------------------------------------------------
-- 3. survey_questions — lectura autenticada y anónima
-- -----------------------------------------------------------------------------
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura auténticada de preguntas" ON public.survey_questions;
CREATE POLICY "Lectura auténticada de preguntas"
  ON public.survey_questions
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS survey_questions_public_read ON public.survey_questions;
CREATE POLICY survey_questions_public_read
  ON public.survey_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);


-- -----------------------------------------------------------------------------
-- 4. responses — conteo de participación en panel Manager
-- -----------------------------------------------------------------------------
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers pueden leer respuestas de su tenant" ON public.responses;
CREATE POLICY "Managers pueden leer respuestas de su tenant"
  ON public.responses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.groups AS g
      INNER JOIN public.profiles AS p ON p.tenant_id = g.tenant_id
      WHERE g.id = responses.group_id
        AND p.id = auth.uid()
        AND g.tenant_id IS NOT NULL
    )
    OR (
      responses.survey_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.surveys AS s
        INNER JOIN public.profiles AS p ON p.tenant_id = s.tenant_id
        WHERE s.id = responses.survey_id
          AND p.id = auth.uid()
      )
    )
  );

COMMIT;
