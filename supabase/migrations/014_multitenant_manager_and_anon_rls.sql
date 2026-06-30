-- =============================================================================
-- Vínculo HR SaaS — 014: RLS Multi-tenant por manager_id + cuestionario anon
-- =============================================================================
-- Modelo de aislamiento:
--   • authenticated / manager → groups.manager_id = auth.uid()
--   • participants / responses → acceso manager vía auth_user_manages_group()
--   • anon / colaborador       → lectura groups + participants, envío responses
--
-- Requisitos previos:
--   • groups.organization_id y groups.manager_id (multitenant_schema.sql)
--   • seed_tenant.sql ejecutado
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE OR REPLACE FUNCTION.
-- Nota: service_role bypass RLS (uso server-side exclusivo).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Helper — ¿el usuario autenticado gestiona este group_id?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_manages_group(p_group_id public.groups.id%TYPE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups AS g
    WHERE g.id = p_group_id
      AND g.manager_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.auth_user_manages_group(public.groups.id%TYPE) IS
  'True si auth.uid() es el manager_id del grupo indicado.';


-- -----------------------------------------------------------------------------
-- 1. Permisos base
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responses    TO authenticated;

GRANT SELECT                         ON public.groups       TO anon;
GRANT SELECT, UPDATE                 ON public.participants TO anon;
GRANT SELECT, INSERT, UPDATE         ON public.responses    TO anon;


-- -----------------------------------------------------------------------------
-- 2. Eliminar políticas legacy / re-ejecución idempotente
-- -----------------------------------------------------------------------------
-- groups
DROP POLICY IF EXISTS groups_tenant_select             ON public.groups;
DROP POLICY IF EXISTS groups_tenant_insert             ON public.groups;
DROP POLICY IF EXISTS groups_tenant_update             ON public.groups;
DROP POLICY IF EXISTS groups_tenant_delete             ON public.groups;
DROP POLICY IF EXISTS groups_dev_tenant_select         ON public.groups;
DROP POLICY IF EXISTS groups_dev_tenant_insert         ON public.groups;
DROP POLICY IF EXISTS groups_tenant_isolation          ON public.groups;
DROP POLICY IF EXISTS groups_manager_select            ON public.groups;
DROP POLICY IF EXISTS groups_manager_insert            ON public.groups;
DROP POLICY IF EXISTS groups_manager_update            ON public.groups;
DROP POLICY IF EXISTS groups_manager_delete            ON public.groups;
DROP POLICY IF EXISTS groups_anon_read_for_questionnaire ON public.groups;

-- participants
DROP POLICY IF EXISTS participants_tenant_isolation    ON public.participants;
DROP POLICY IF EXISTS participants_token_select        ON public.participants;
DROP POLICY IF EXISTS participants_token_update        ON public.participants;
DROP POLICY IF EXISTS participants_manager_select      ON public.participants;
DROP POLICY IF EXISTS participants_manager_insert      ON public.participants;
DROP POLICY IF EXISTS participants_manager_update      ON public.participants;
DROP POLICY IF EXISTS participants_manager_delete      ON public.participants;
DROP POLICY IF EXISTS participants_anon_self_select    ON public.participants;
DROP POLICY IF EXISTS participants_anon_self_update    ON public.participants;
DROP POLICY IF EXISTS participants_anon_group_roster   ON public.participants;
DROP POLICY IF EXISTS participants_anon_select         ON public.participants;
DROP POLICY IF EXISTS participants_anon_update         ON public.participants;

-- responses
DROP POLICY IF EXISTS responses_tenant_isolation       ON public.responses;
DROP POLICY IF EXISTS "Managers pueden leer respuestas de su tenant" ON public.responses;
DROP POLICY IF EXISTS responses_manager_select         ON public.responses;
DROP POLICY IF EXISTS responses_manager_insert         ON public.responses;
DROP POLICY IF EXISTS responses_manager_update         ON public.responses;
DROP POLICY IF EXISTS responses_manager_delete         ON public.responses;
DROP POLICY IF EXISTS responses_anon_insert            ON public.responses;
DROP POLICY IF EXISTS responses_anon_select            ON public.responses;
DROP POLICY IF EXISTS responses_anon_update            ON public.responses;


-- -----------------------------------------------------------------------------
-- 3. Habilitar RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responses    ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 4. POLÍTICAS MANAGER — groups (manager_id = auth.uid())
-- =============================================================================

CREATE POLICY groups_manager_select
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (manager_id = auth.uid());

CREATE POLICY groups_manager_insert
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (manager_id = auth.uid());

CREATE POLICY groups_manager_update
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (manager_id = auth.uid())
  WITH CHECK (manager_id = auth.uid());

CREATE POLICY groups_manager_delete
  ON public.groups
  FOR DELETE
  TO authenticated
  USING (manager_id = auth.uid());


-- =============================================================================
-- 5. POLÍTICAS MANAGER — participants
-- =============================================================================

CREATE POLICY participants_manager_select
  ON public.participants
  FOR SELECT
  TO authenticated
  USING (public.auth_user_manages_group(group_id));

CREATE POLICY participants_manager_insert
  ON public.participants
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_user_manages_group(group_id));

CREATE POLICY participants_manager_update
  ON public.participants
  FOR UPDATE
  TO authenticated
  USING (public.auth_user_manages_group(group_id))
  WITH CHECK (public.auth_user_manages_group(group_id));

CREATE POLICY participants_manager_delete
  ON public.participants
  FOR DELETE
  TO authenticated
  USING (public.auth_user_manages_group(group_id));


-- =============================================================================
-- 6. POLÍTICAS MANAGER — responses
-- =============================================================================

CREATE POLICY responses_manager_select
  ON public.responses
  FOR SELECT
  TO authenticated
  USING (public.auth_user_manages_group(group_id));

CREATE POLICY responses_manager_insert
  ON public.responses
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_user_manages_group(group_id));

CREATE POLICY responses_manager_update
  ON public.responses
  FOR UPDATE
  TO authenticated
  USING (public.auth_user_manages_group(group_id))
  WITH CHECK (public.auth_user_manages_group(group_id));

CREATE POLICY responses_manager_delete
  ON public.responses
  FOR DELETE
  TO authenticated
  USING (public.auth_user_manages_group(group_id));


-- =============================================================================
-- 7. POLÍTICAS ANON — cuestionario público (/cuestionario/[id]?token=)
-- =============================================================================

-- Colaborador: validar que el equipo existe (id, name, age_band)
CREATE POLICY groups_anon_read_for_questionnaire
  ON public.groups
  FOR SELECT
  TO anon
  USING (true);

-- Colaborador: leer su ficha (token = id) y el roster ONA del mismo group_id
CREATE POLICY participants_anon_select
  ON public.participants
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.groups AS g
      WHERE g.id = participants.group_id
    )
  );

-- Colaborador: marcar survey_completed_at tras enviar el cuestionario
CREATE POLICY participants_anon_update
  ON public.participants
  FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.groups AS g
      WHERE g.id = participants.group_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.groups AS g
      WHERE g.id = participants.group_id
    )
  );

-- Colaborador: comprobar duplicados antes de insertar (SELECT por participant_id)
CREATE POLICY responses_anon_select
  ON public.responses
  FOR SELECT
  TO anon
  USING (
    participant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.participants AS p
      WHERE p.id = responses.participant_id
        AND p.group_id = responses.group_id
    )
  );

-- Colaborador: enviar respuestas EDT/ONA
CREATE POLICY responses_anon_insert
  ON public.responses
  FOR INSERT
  TO anon
  WITH CHECK (
    participant_id IS NOT NULL
    AND group_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.participants AS p
      WHERE p.id = responses.participant_id
        AND p.group_id = responses.group_id
    )
  );

-- Colaborador: actualizar respuesta propia si el flujo lo requiere
CREATE POLICY responses_anon_update
  ON public.responses
  FOR UPDATE
  TO anon
  USING (
    participant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.participants AS p
      WHERE p.id = responses.participant_id
        AND p.group_id = responses.group_id
    )
  )
  WITH CHECK (
    participant_id IS NOT NULL
    AND group_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.participants AS p
      WHERE p.id = responses.participant_id
        AND p.group_id = responses.group_id
    )
  );


COMMIT;
