-- =============================================================================
-- responses.started_at / responses.completed_at
-- Medición del tiempo de dedicación del participante en el cuestionario
-- =============================================================================

BEGIN;

ALTER TABLE public.responses
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.responses.started_at IS
  'Momento en que el participante abre el cuestionario.';

COMMENT ON COLUMN public.responses.completed_at IS
  'Momento en que el participante envía el cuestionario.';

CREATE INDEX IF NOT EXISTS idx_responses_started_at
  ON public.responses (started_at)
  WHERE started_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_responses_completed_at
  ON public.responses (completed_at)
  WHERE completed_at IS NOT NULL;

COMMIT;
