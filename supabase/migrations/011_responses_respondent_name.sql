-- =============================================================================
-- responses.respondent_name — nombre visible del colaborador que respondió
-- (equipo identificado o anónimo/ficticio en cuestionario público EDT)
-- =============================================================================

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS respondent_name TEXT;

COMMENT ON COLUMN public.responses.respondent_name IS
  'Nombre del respondiente tal como lo indicó en el cuestionario público.';

CREATE INDEX IF NOT EXISTS idx_responses_respondent_name
  ON public.responses (respondent_name)
  WHERE respondent_name IS NOT NULL;
