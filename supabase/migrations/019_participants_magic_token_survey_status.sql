-- =============================================================================
-- Vínculo HR SaaS — 019: participants email + magic_token + survey_status
-- =============================================================================
-- Prepara el flujo de invitaciones masivas (Resend) y enlaces mágicos.
--
-- Campos:
--   • email          TEXT     — destino del enlace
--   • magic_token    UUID     — token único del cuestionario (default gen_random_uuid())
--   • survey_status  TEXT     — pending_send | sent | completed
--
-- Idempotente. Compatible con 012 (survey_completed_at) y 013 (email).
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- -----------------------------------------------------------------------------
-- 1. Columnas
-- -----------------------------------------------------------------------------
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS magic_token UUID DEFAULT gen_random_uuid();

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS survey_status TEXT;

-- Compatibilidad con código legacy que lee access_token
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS access_token UUID;


-- -----------------------------------------------------------------------------
-- 2. Backfill seguro
-- -----------------------------------------------------------------------------
-- Si ya existía access_token, reutilizarlo como magic_token
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'participants'
      AND column_name = 'access_token'
  ) THEN
    UPDATE public.participants
    SET magic_token = access_token
    WHERE access_token IS NOT NULL
      AND (magic_token IS NULL OR magic_token IS DISTINCT FROM access_token)
      AND NOT EXISTS (
        SELECT 1
        FROM public.participants AS other
        WHERE other.magic_token = public.participants.access_token
          AND other.id IS DISTINCT FROM public.participants.id
      );
  END IF;
END $$;

UPDATE public.participants
SET magic_token = gen_random_uuid()
WHERE magic_token IS NULL;

-- Mantener access_token alineado con magic_token (legacy send-invites / magic links)
UPDATE public.participants
SET access_token = magic_token
WHERE magic_token IS NOT NULL
  AND (access_token IS NULL OR access_token IS DISTINCT FROM magic_token);

-- survey_status desde estado de completado previo
UPDATE public.participants
SET survey_status = 'completed'
WHERE survey_completed_at IS NOT NULL
  AND (survey_status IS NULL OR survey_status = 'pending_send');

UPDATE public.participants
SET survey_status = 'pending_send'
WHERE survey_status IS NULL OR char_length(trim(survey_status)) = 0;


-- -----------------------------------------------------------------------------
-- 3. NOT NULL + defaults + constraints
-- -----------------------------------------------------------------------------
ALTER TABLE public.participants
  ALTER COLUMN magic_token SET DEFAULT gen_random_uuid();

ALTER TABLE public.participants
  ALTER COLUMN magic_token SET NOT NULL;

ALTER TABLE public.participants
  ALTER COLUMN survey_status SET DEFAULT 'pending_send';

ALTER TABLE public.participants
  ALTER COLUMN survey_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'participants_survey_status_valid'
      AND conrelid = 'public.participants'::regclass
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_survey_status_valid
      CHECK (
        survey_status IN ('pending_send', 'sent', 'completed')
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'participants_magic_token_key'
      AND conrelid = 'public.participants'::regclass
  ) THEN
    ALTER TABLE public.participants
      ADD CONSTRAINT participants_magic_token_key UNIQUE (magic_token);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- -----------------------------------------------------------------------------
-- 4. Índices y comentarios
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_participants_email
  ON public.participants (email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_participants_magic_token
  ON public.participants (magic_token);

CREATE INDEX IF NOT EXISTS idx_participants_survey_status
  ON public.participants (group_id, survey_status);

COMMENT ON COLUMN public.participants.email IS
  'Correo del colaborador para envío masivo del enlace mágico (Resend).';

COMMENT ON COLUMN public.participants.magic_token IS
  'UUID único de acceso al cuestionario (/votar/{magic_token}).';

COMMENT ON COLUMN public.participants.survey_status IS
  'Flujo de invitación: pending_send → sent → completed.';

COMMENT ON COLUMN public.participants.access_token IS
  'Alias legacy de magic_token (mantener sincronizado).';


-- -----------------------------------------------------------------------------
-- 5. Trigger: al completar encuesta, marcar survey_status = completed
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_participant_survey_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.survey_completed_at IS NOT NULL
     AND (OLD.survey_completed_at IS NULL OR NEW.survey_status IS DISTINCT FROM 'completed') THEN
    NEW.survey_status := 'completed';
  END IF;

  -- Si se asigna magic_token nuevo, alinear access_token legacy
  IF NEW.magic_token IS NOT NULL
     AND (NEW.access_token IS NULL OR NEW.access_token IS DISTINCT FROM NEW.magic_token) THEN
    NEW.access_token := NEW.magic_token;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participants_sync_survey_status ON public.participants;
CREATE TRIGGER trg_participants_sync_survey_status
  BEFORE INSERT OR UPDATE OF survey_completed_at, magic_token, survey_status
  ON public.participants
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_participant_survey_status();

COMMIT;

-- Verificación
SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'participants'
  AND column_name IN ('email', 'magic_token', 'survey_status', 'access_token')
ORDER BY column_name;
