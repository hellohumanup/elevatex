-- =============================================================================
-- Vínculo HR SaaS — RLS local: groups con tenant de desarrollo
--
-- Permite crear y listar equipos en localhost sin sesión o con perfil incompleto,
-- siempre que tenant_id = cbd62767-1644-477c-a496-e26ea31dc109.
-- =============================================================================

BEGIN;

GRANT SELECT, INSERT ON public.groups TO authenticated, anon;

DROP POLICY IF EXISTS groups_dev_tenant_insert ON public.groups;
CREATE POLICY groups_dev_tenant_insert
  ON public.groups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    tenant_id = 'cbd62767-1644-477c-a496-e26ea31dc109'::uuid
  );

DROP POLICY IF EXISTS groups_dev_tenant_select ON public.groups;
CREATE POLICY groups_dev_tenant_select
  ON public.groups
  FOR SELECT
  TO anon, authenticated
  USING (
    tenant_id = 'cbd62767-1644-477c-a496-e26ea31dc109'::uuid
  );

COMMIT;
