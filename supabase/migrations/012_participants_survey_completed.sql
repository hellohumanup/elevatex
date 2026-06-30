-- =============================================================================
-- Vínculo HR SaaS — participants.survey_completed_at + acceso por token (ONA)
--
-- Marca cuándo un participante completó el cuestionario EDT/ONA vía enlace único.
-- Políticas amplias para anon en lectura/actualización de participants (token = id).
-- =============================================================================

BEGIN;

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS survey_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.participants.survey_completed_at IS
  'Timestamp en que el participante completó el cuestionario vía enlace personalizado.';

CREATE INDEX IF NOT EXISTS idx_participants_survey_completed_at
  ON public.participants (survey_completed_at)
  WHERE survey_completed_at IS NOT NULL;

GRANT SELECT, UPDATE ON public.participants TO anon, authenticated;

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS participants_token_select ON public.participants;
CREATE POLICY participants_token_select
  ON public.participants
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS participants_token_update ON public.participants;
CREATE POLICY participants_token_update
  ON public.participants
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;
