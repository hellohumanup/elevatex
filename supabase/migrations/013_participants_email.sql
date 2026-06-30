-- =============================================================================
-- Vínculo HR SaaS — participants.email para invitaciones ElevateX
-- =============================================================================

BEGIN;

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.participants.email IS
  'Correo del colaborador para envío de enlace único al cuestionario EDT/ONA.';

CREATE INDEX IF NOT EXISTS idx_participants_email
  ON public.participants (email)
  WHERE email IS NOT NULL;

COMMIT;
