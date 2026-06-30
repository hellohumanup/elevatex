-- =============================================================================
-- Vínculo HR SaaS — Seed EDT estándar (surveys + 28 survey_questions)
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
--
-- Requisitos previos:
--   • Migración 003 (public.tenants)
--   • Migración 004 (public.surveys, public.survey_questions)
--
-- Comportamiento:
--   • Resuelve el tenant piloto (o el primero existente)
--   • Inserta el survey EDT estándar si aún no existe
--   • Inserta / actualiza las 28 preguntas oficiales por bloque
--   • Al final muestra el UUID del survey para configurar links públicos
--
-- Idempotente: re-ejecutable sin duplicar survey ni preguntas.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Tenant piloto (ajusta el UUID si tu entorno usa otro tenant)
-- -----------------------------------------------------------------------------
INSERT INTO public.tenants (id, name)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Piloto BetaX'
)
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 1. Survey EDT estándar + 28 preguntas (CTE encadenada)
-- -----------------------------------------------------------------------------
WITH tenant AS (
  SELECT COALESCE(
    (
      SELECT t.id
      FROM public.tenants AS t
      WHERE t.id = '11111111-1111-1111-1111-111111111111'::uuid
    ),
    (
      SELECT t.id
      FROM public.tenants AS t
      ORDER BY t.created_at ASC
      LIMIT 1
    )
  ) AS id
),

inserted_survey AS (
  INSERT INTO public.surveys (tenant_id, title)
  SELECT
    tenant.id,
    'Evaluación de Dinámicas de Trabajo (EDT) Estándar'
  FROM tenant
  WHERE tenant.id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.surveys AS s
      WHERE s.tenant_id = tenant.id
        AND s.title = 'Evaluación de Dinámicas de Trabajo (EDT) Estándar'
    )
  RETURNING id
),

survey AS (
  SELECT COALESCE(
    (SELECT inserted_survey.id FROM inserted_survey LIMIT 1),
    (
      SELECT s.id
      FROM public.surveys AS s
      INNER JOIN tenant ON s.tenant_id = tenant.id
      WHERE s.title = 'Evaluación de Dinámicas de Trabajo (EDT) Estándar'
      LIMIT 1
    )
  ) AS id
),

questions AS (
  SELECT *
  FROM (
    VALUES
      -- Entorno (1–8): clima y cultura organizacional
      (1,  'Entorno', 'Siento que el ambiente de trabajo del equipo es respetuoso y colaborativo.'),
      (2,  'Entorno', 'Las normas informales del equipo facilitan la confianza entre compañeros.'),
      (3,  'Entorno', 'Existe un clima psicológico seguro para expresar opiniones sin miedo.'),
      (4,  'Entorno', 'Los rituales y hábitos del día a día refuerzan una cultura de respeto mutuo.'),
      (5,  'Entorno', 'El espacio físico y digital del equipo apoya la productividad y el bienestar.'),
      (6,  'Entorno', 'Se reconocen públicamente los comportamientos alineados con los valores corporativos.'),
      (7,  'Entorno', 'Las cargas de trabajo se distribuyen de forma equitativa dentro del equipo.'),
      (8,  'Entorno', 'Percibo coherencia entre lo que la empresa declara y lo que ocurre en el día a día.'),

      -- Dirección (9–16): liderazgo y estrategia
      (9,  'Dirección', 'Conozco con claridad la prioridad estratégica del equipo para este trimestre.'),
      (10, 'Dirección', 'La dirección comunica el propósito del negocio de forma comprensible y frecuente.'),
      (11, 'Dirección', 'Las decisiones de liderazgo están alineadas con los objetivos de la organización.'),
      (12, 'Dirección', 'Recibo feedback oportuno sobre el desempeño y la contribución al equipo.'),
      (13, 'Dirección', 'Existen criterios transparentes para priorizar proyectos e iniciativas.'),
      (14, 'Dirección', 'Mi responsable directo modela los comportamientos que espera del equipo.'),
      (15, 'Dirección', 'La estrategia del área se traduce en acciones concretas y medibles.'),
      (16, 'Dirección', 'Cuando hay cambios organizativos, entiendo el porqué y el impacto esperado.'),

      -- Talento (17–24): desarrollo y competencias
      (17, 'Talento', 'Tengo oportunidades reales para desarrollar nuevas competencias en mi rol.'),
      (18, 'Talento', 'El equipo valora y aprovecha las habilidades diversas de cada persona.'),
      (19, 'Talento', 'Recibo recursos (tiempo, formación, mentoring) para crecer profesionalmente.'),
      (20, 'Talento', 'Las personas con alto desempeño tienen visibilidad y caminos de progresión claros.'),
      (21, 'Talento', 'Se promueve la rotación de conocimiento para evitar dependencias de una sola persona.'),
      (22, 'Talento', 'Las evaluaciones de talento son justas, basadas en criterios objetivos.'),
      (23, 'Talento', 'Puedo aplicar mis fortalezas en las tareas que más valor aportan al equipo.'),
      (24, 'Talento', 'El equipo invierte en corregir brechas de competencias críticas de forma proactiva.'),

      -- EDT Transversal (25–28): alineamiento general
      (25, 'EDT Transversal', 'En general, percibo alineamiento entre mi rol, el equipo y la estrategia de la empresa.'),
      (26, 'EDT Transversal', 'Colaboro de forma efectiva con otras áreas para cumplir objetivos comunes.'),
      (27, 'EDT Transversal', 'Confío en que el liderazgo tomará decisiones que beneficien al conjunto del equipo.'),
      (28, 'EDT Transversal', 'Recomendaría este equipo como un lugar donde las dinámicas de trabajo funcionan bien.')
  ) AS q (question_number, block, text)
)

INSERT INTO public.survey_questions (survey_id, question_number, text, block)
SELECT
  survey.id,
  questions.question_number,
  questions.text,
  questions.block
FROM survey
CROSS JOIN questions
ON CONFLICT (survey_id, question_number) DO UPDATE
SET
  text  = EXCLUDED.text,
  block = EXCLUDED.block;


COMMIT;


-- -----------------------------------------------------------------------------
-- 2. Verificación: UUID del survey para links públicos (/cuestionario/{id})
-- -----------------------------------------------------------------------------
SELECT
  s.id          AS survey_id,
  s.title,
  s.tenant_id,
  t.name        AS tenant_name,
  COUNT(sq.id)  AS total_questions
FROM public.surveys AS s
LEFT JOIN public.tenants AS t ON t.id = s.tenant_id
LEFT JOIN public.survey_questions AS sq ON sq.survey_id = s.id
WHERE s.title = 'Evaluación de Dinámicas de Trabajo (EDT) Estándar'
GROUP BY s.id, s.title, s.tenant_id, t.name;
