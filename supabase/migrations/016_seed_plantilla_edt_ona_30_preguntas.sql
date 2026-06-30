-- =============================================================================
-- Vínculo HR SaaS — SEED completo: Plantilla EDT + ONA Estándar (30 preguntas)
-- Ejecutar en: Supabase Dashboard → SQL Editor → Run
--
-- Fuente: EDT FINAL.xlsx — Hoja2 (28 preguntas EDT oficiales)
--         + 2 preguntas ONA (influencia / comunicación, order_index 29–30)
--
-- Idempotente: elimina preguntas 1–30 del survey global y las reinserta.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_survey_id UUID;
BEGIN
  SELECT s.id
  INTO v_survey_id
  FROM public.surveys AS s
  WHERE s.organization_id IS NULL
    AND s.name = 'Plantilla EDT + ONA Estándar'
  LIMIT 1;

  IF v_survey_id IS NULL THEN
    INSERT INTO public.surveys (organization_id, name, is_active)
    VALUES (NULL, 'Plantilla EDT + ONA Estándar', true)
    RETURNING id INTO v_survey_id;
  END IF;

  DELETE FROM public.survey_questions
  WHERE survey_id = v_survey_id
    AND order_index BETWEEN 1 AND 30;

  INSERT INTO public.survey_questions (
    survey_id,
    question_text,
    question_type,
    dimension,
    order_index,
    text,
    block,
    question_number,
    option_a,
    option_b,
    option_c,
    option_d
  )
  VALUES
      (
        v_survey_id,
        'Siento que el ambiente de trabajo del equipo es respetuoso y colaborativo.',
        'edt_metric',
        'Entorno',
        1,
        'Siento que el ambiente de trabajo del equipo es respetuoso y colaborativo.',
        'Entorno',
        1,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Las normas informales del equipo facilitan la confianza entre compañeros.',
        'edt_metric',
        'Entorno',
        2,
        'Las normas informales del equipo facilitan la confianza entre compañeros.',
        'Entorno',
        2,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Existe un clima psicológico seguro para expresar opiniones sin miedo.',
        'edt_metric',
        'Entorno',
        3,
        'Existe un clima psicológico seguro para expresar opiniones sin miedo.',
        'Entorno',
        3,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Los rituales y hábitos del día a día refuerzan una cultura de respeto mutuo.',
        'edt_metric',
        'Entorno',
        4,
        'Los rituales y hábitos del día a día refuerzan una cultura de respeto mutuo.',
        'Entorno',
        4,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'El espacio físico y digital del equipo apoya la productividad y el bienestar.',
        'edt_metric',
        'Entorno',
        5,
        'El espacio físico y digital del equipo apoya la productividad y el bienestar.',
        'Entorno',
        5,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Se reconocen públicamente los comportamientos alineados con los valores corporativos.',
        'edt_metric',
        'Entorno',
        6,
        'Se reconocen públicamente los comportamientos alineados con los valores corporativos.',
        'Entorno',
        6,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Las cargas de trabajo se distribuyen de forma equitativa dentro del equipo.',
        'edt_metric',
        'Entorno',
        7,
        'Las cargas de trabajo se distribuyen de forma equitativa dentro del equipo.',
        'Entorno',
        7,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Percibo coherencia entre lo que la empresa declara y lo que ocurre en el día a día.',
        'edt_metric',
        'Entorno',
        8,
        'Percibo coherencia entre lo que la empresa declara y lo que ocurre en el día a día.',
        'Entorno',
        8,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Conozco con claridad la prioridad estratégica del equipo para este trimestre.',
        'edt_metric',
        'Dirección',
        9,
        'Conozco con claridad la prioridad estratégica del equipo para este trimestre.',
        'Dirección',
        9,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'La dirección comunica el propósito del negocio de forma comprensible y frecuente.',
        'edt_metric',
        'Dirección',
        10,
        'La dirección comunica el propósito del negocio de forma comprensible y frecuente.',
        'Dirección',
        10,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Las decisiones de liderazgo están alineadas con los objetivos de la organización.',
        'edt_metric',
        'Dirección',
        11,
        'Las decisiones de liderazgo están alineadas con los objetivos de la organización.',
        'Dirección',
        11,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Recibo feedback oportuno sobre el desempeño y la contribución al equipo.',
        'edt_metric',
        'Dirección',
        12,
        'Recibo feedback oportuno sobre el desempeño y la contribución al equipo.',
        'Dirección',
        12,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Existen criterios transparentes para priorizar proyectos e iniciativas.',
        'edt_metric',
        'Dirección',
        13,
        'Existen criterios transparentes para priorizar proyectos e iniciativas.',
        'Dirección',
        13,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Mi responsable directo modela los comportamientos que espera del equipo.',
        'edt_metric',
        'Dirección',
        14,
        'Mi responsable directo modela los comportamientos que espera del equipo.',
        'Dirección',
        14,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'La estrategia del área se traduce en acciones concretas y medibles.',
        'edt_metric',
        'Dirección',
        15,
        'La estrategia del área se traduce en acciones concretas y medibles.',
        'Dirección',
        15,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Cuando hay cambios organizativos, entiendo el porqué y el impacto esperado.',
        'edt_metric',
        'Dirección',
        16,
        'Cuando hay cambios organizativos, entiendo el porqué y el impacto esperado.',
        'Dirección',
        16,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Tengo oportunidades reales para desarrollar nuevas competencias en mi rol.',
        'edt_metric',
        'Talento',
        17,
        'Tengo oportunidades reales para desarrollar nuevas competencias en mi rol.',
        'Talento',
        17,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'El equipo valora y aprovecha las habilidades diversas de cada persona.',
        'edt_metric',
        'Talento',
        18,
        'El equipo valora y aprovecha las habilidades diversas de cada persona.',
        'Talento',
        18,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Recibo recursos (tiempo, formación, mentoring) para crecer profesionalmente.',
        'edt_metric',
        'Talento',
        19,
        'Recibo recursos (tiempo, formación, mentoring) para crecer profesionalmente.',
        'Talento',
        19,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Las personas con alto desempeño tienen visibilidad y caminos de progresión claros.',
        'edt_metric',
        'Talento',
        20,
        'Las personas con alto desempeño tienen visibilidad y caminos de progresión claros.',
        'Talento',
        20,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Se promueve la rotación de conocimiento para evitar dependencias de una sola persona.',
        'edt_metric',
        'Talento',
        21,
        'Se promueve la rotación de conocimiento para evitar dependencias de una sola persona.',
        'Talento',
        21,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Las evaluaciones de talento son justas, basadas en criterios objetivos.',
        'edt_metric',
        'Talento',
        22,
        'Las evaluaciones de talento son justas, basadas en criterios objetivos.',
        'Talento',
        22,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Puedo aplicar mis fortalezas en las tareas que más valor aportan al equipo.',
        'edt_metric',
        'Talento',
        23,
        'Puedo aplicar mis fortalezas en las tareas que más valor aportan al equipo.',
        'Talento',
        23,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'El equipo invierte en corregir brechas de competencias críticas de forma proactiva.',
        'edt_metric',
        'Talento',
        24,
        'El equipo invierte en corregir brechas de competencias críticas de forma proactiva.',
        'Talento',
        24,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'En general, percibo alineamiento entre mi rol, el equipo y la estrategia de la empresa.',
        'edt_metric',
        'EDT Transversal',
        25,
        'En general, percibo alineamiento entre mi rol, el equipo y la estrategia de la empresa.',
        'EDT Transversal',
        25,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Colaboro de forma efectiva con otras áreas para cumplir objetivos comunes.',
        'edt_metric',
        'EDT Transversal',
        26,
        'Colaboro de forma efectiva con otras áreas para cumplir objetivos comunes.',
        'EDT Transversal',
        26,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Confío en que el liderazgo tomará decisiones que beneficien al conjunto del equipo.',
        'edt_metric',
        'EDT Transversal',
        27,
        'Confío en que el liderazgo tomará decisiones que beneficien al conjunto del equipo.',
        'EDT Transversal',
        27,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        'Recomendaría este equipo como un lugar donde las dinámicas de trabajo funcionan bien.',
        'edt_metric',
        'EDT Transversal',
        28,
        'Recomendaría este equipo como un lugar donde las dinámicas de trabajo funcionan bien.',
        'EDT Transversal',
        28,
        'Totalmente de acuerdo',
        'De acuerdo',
        'En desacuerdo',
        'Totalmente en desacuerdo'
      ),
      (
        v_survey_id,
        '¿Con qué compañeros te sientes más alineado/a en la visión y los objetivos del equipo? (Selecciona hasta 3)',
        'ona_nomination',
        'influencia',
        29,
        '¿Con qué compañeros te sientes más alineado/a en la visión y los objetivos del equipo? (Selecciona hasta 3)',
        'influencia',
        29,
        '',
        '',
        '',
        ''
      ),
      (
        v_survey_id,
        '¿Con quién te comunicas con más frecuencia en el día a día para resolver el trabajo? (Selecciona hasta 3)',
        'ona_nomination',
        'comunicacion',
        30,
        '¿Con quién te comunicas con más frecuencia en el día a día para resolver el trabajo? (Selecciona hasta 3)',
        'comunicacion',
        30,
        '',
        '',
        '',
        ''
      );


  RAISE NOTICE 'SEED OK — Plantilla EDT + ONA Estándar: % preguntas (survey_id = %)',
    (SELECT COUNT(*) FROM public.survey_questions WHERE survey_id = v_survey_id),
    v_survey_id;
END $$;

COMMIT;

-- Verificación
SELECT
  s.id AS survey_id,
  s.name,
  sq.order_index,
  sq.question_type,
  sq.dimension,
  LEFT(sq.question_text, 60) AS enunciado_preview
FROM public.surveys AS s
JOIN public.survey_questions AS sq ON sq.survey_id = s.id
WHERE s.organization_id IS NULL
  AND s.name = 'Plantilla EDT + ONA Estándar'
ORDER BY sq.order_index;
