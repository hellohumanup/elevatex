-- =============================================================================
-- Vínculo HR SaaS — Seed tenant demo (Supabase SQL Editor)
-- =============================================================================
-- Corresponde a DEMO_DASHBOARD_ORGANIZATION_ID en lib/groups.ts:
--   00000000-0000-0000-0000-000000000000
--
-- Ejecutar después de multitenant_schema.sql si el insert en groups falla por FK
-- en organizations (tabla vacía).
-- Requisito: al menos un usuario en auth.users para el INSERT en profiles.
-- =============================================================================

BEGIN;

-- 1. Organización demo (tenant raíz del dashboard local)
INSERT INTO public.organizations (id, name)
VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'Organización Demo'
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name;

-- 2. Perfil manager vinculado al primer usuario de auth.users
--    groups.manager_id → profiles.id requiere fila en profiles para el usuario auth.
INSERT INTO public.profiles (id, organization_id, email, role)
SELECT
  u.id,
  '00000000-0000-0000-0000-000000000000'::uuid,
  COALESCE(u.email, 'demo@vinculo.app'),
  'manager'
FROM auth.users AS u
ORDER BY u.created_at ASC
LIMIT 1
ON CONFLICT (id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      email = EXCLUDED.email,
      role = EXCLUDED.role;

COMMIT;
