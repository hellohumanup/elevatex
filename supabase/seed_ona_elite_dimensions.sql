-- =============================================================================
-- Vínculo — Seed rápido ONA Élite (SQL Editor)
-- Ejecutar DESPUÉS de 018_ona_elite_dynamic_dimensions.sql si solo quieres
-- re-sembrar las 3 preguntas sin reaplicar toda la migración.
-- =============================================================================

INSERT INTO public.surveys (id, organization_id, name, is_active, created_at)
VALUES (
  'a1000001-0001-4000-8000-000000000000'::uuid,
  NULL,
  'ONA Élite · Dimensiones',
  true,
  now()
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, is_active = true;

INSERT INTO public.survey_questions (
  id, survey_id, question_text, question_type, dimension,
  order_index, max_choices, created_at, text, block, question_number
) VALUES
(
  'a1000001-0001-4000-8000-000000000001'::uuid,
  'a1000001-0001-4000-8000-000000000000'::uuid,
  '¿A quién acudes cuando necesitas información crítica o conocimiento especializado para avanzar en tu trabajo? (Selecciona hasta 3)',
  'ona_nomination', 'informacion', 1, 3, now(),
  '¿A quién acudes cuando necesitas información crítica o conocimiento especializado para avanzar en tu trabajo? (Selecciona hasta 3)',
  'informacion', 1
),
(
  'a1000001-0001-4000-8000-000000000002'::uuid,
  'a1000001-0001-4000-8000-000000000000'::uuid,
  '¿En quién confías para hablar con sinceridad sobre problemas delicados del equipo o pedir apoyo cuando lo necesitas? (Selecciona hasta 3)',
  'ona_nomination', 'confianza', 2, 3, now(),
  '¿En quién confías para hablar con sinceridad sobre problemas delicados del equipo o pedir apoyo cuando lo necesitas? (Selecciona hasta 3)',
  'confianza', 2
),
(
  'a1000001-0001-4000-8000-000000000003'::uuid,
  'a1000001-0001-4000-8000-000000000000'::uuid,
  '¿Con quién generas las mejores ideas o experimentas enfoques nuevos para mejorar el trabajo del equipo? (Selecciona hasta 3)',
  'ona_nomination', 'innovacion', 3, 3, now(),
  '¿Con quién generas las mejores ideas o experimentas enfoques nuevos para mejorar el trabajo del equipo? (Selecciona hasta 3)',
  'innovacion', 3
)
ON CONFLICT (id) DO UPDATE
SET
  question_text = EXCLUDED.question_text,
  dimension = EXCLUDED.dimension,
  max_choices = 3,
  question_type = 'ona_nomination',
  text = EXCLUDED.question_text,
  block = EXCLUDED.dimension;

SELECT id, dimension, max_choices, left(question_text, 64) AS preview
FROM public.survey_questions
WHERE survey_id = 'a1000001-0001-4000-8000-000000000000'::uuid
ORDER BY order_index;
