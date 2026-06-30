-- =============================================================================
-- Vínculo HR SaaS — Tenant de desarrollo + actualización de perfil propio
--
-- Permite asignar tenant_id por defecto cuando profiles.tenant_id es NULL
-- (flujo local / registro sin onboarding de tenant).
-- =============================================================================

BEGIN;

INSERT INTO public.tenants (id, name)
VALUES (
  'cbd62767-1644-477c-a496-e26ea31dc109',
  'Local Dev Tenant'
)
ON CONFLICT (id) DO NOTHING;

GRANT UPDATE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

COMMIT;
