# Vínculo — Resumen ejecutivo de contexto

**Vínculo** es un SaaS B2B de diagnóstico de equipos desarrollado bajo la marca **ElevateX**. Combina el cuestionario **EDT** (Evaluación de Dinámicas de Trabajo) con análisis **ONA** (Organizational Network Analysis) para que managers visualicen influencia informal, reciprocidad, densidad de red y afinidad entre colaboradores.

---

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Framework | **Next.js 16** (App Router) + **React 19** + **TypeScript** |
| Estilos | **Tailwind CSS 4** |
| Backend / datos | **Supabase** (PostgreSQL, RLS multi-tenant, JSONB en `responses.answers`) |
| Grafo interactivo | **react-force-graph-2d** (canvas 2D, carga dinámica sin SSR) |
| Email | **Resend** (invitaciones con token por participante) |
| IA / informes | **OpenAI** (insights e informes ejecutivos vía API Routes) |
| Exportación | **html2pdf.js** |

Variables de entorno clave: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `OPENAI_API_KEY`.

---

## Estructura de rutas (`app/`)

```
app/
├── page.tsx                          → Dashboard principal (listado de grupos)
├── group/
│   └── [id]/
│       ├── page.tsx                  → Detalle del equipo (alumnos, invitaciones)
│       └── resultados/
│           └── page.tsx              → ★ Panel ONA + EDT  →  /group/[id]/resultados
├── cuestionario/
│   ├── page.tsx                      → Landing sin ID
│   └── [id]/
│       ├── page.tsx
│       └── CuestionarioTeamPageClient.tsx  →  /cuestionario/[id]?token=<participant_uuid>
├── survey/
│   ├── [survey_id]/page.tsx          → Cuestionario alternativo (?group=&token=)
│   └── gracias/page.tsx
├── informe-individual/page.tsx
├── login/page.tsx
├── admin/                            → Panel admin (surveys, red ONA)
└── api/
    ├── groups/
    ├── send-invitations/
    ├── generate-report/
    ├── team-insights/
    └── analyze-graph/
```

**Ruta de resultados:** `/group/[id]/resultados` — p. ej. `/group/8/resultados`.

Componentes compartidos relevantes en `components/`: `SociogramGraph`, `SociometricNativeQuestionnaire`, `EdtExecutiveDashboard`, `DemoModePanel`.

Lógica de dominio en `lib/`: `mathEngine.ts`, `edtMetrics.ts`, `edtAffinityGraph.ts`, `networkMetrics.ts`, `surveyQuestions.ts`.

---

## Motor matemático ONA — `lib/mathEngine.ts`

Estado: **refactorizado** con matrices de adyacencia dirigidas y tipado estricto.

### Funciones core

| Función | Descripción |
|---------|-------------|
| `buildDirectedAdjacencyMatrix(links)` | Matriz ponderada `source → target → peso` (multigrafo: influencia + comunicación) |
| `calculateIndegree(links)` | Votos/conexiones **entrantes** por ID de colaborador |
| `calculateReciprocity(links)` | Pares mutuos A↔B; suma `min(weight(A→B), weight(B→A))` por nodo |
| `calculateNetworkDensity(N, links)` | Red dirigida: **D = L / (N(N−1))** → `densityPercent = D × 100` |
| `buildGraphLinksFromResponses(...)` | Transforma `participants` + `responses` (JSONB) → `GraphLink[]` |
| `parseResponseAnswers(answers)` | Extrae IDs ONA desde JSONB (`influencia`, `comunicacion`, arrays legacy) |
| `detectNetworkSilos(...)` | Componentes conexas (silos) |
| `computeGroupOnaMetrics(...)` | Orquestador de métricas ONA completas |

Logs de depuración en desarrollo: prefijo `[mathEngine:ONA]` (matrices, vectores indegree/reciprocidad, densidad).

### Integración en la vista de resultados

`app/group/[id]/resultados/page.tsx` ejecuta `computeOnaClientMetrics()` sobre datos reales de Supabase y registra `[CLIENTE ONA]` en consola con `{ indegree, reciprocity, density, nodes, links }`.

---

## Flujo de datos (resumen)

1. Manager crea **grupo** y **participantes** en Supabase.
2. Colaborador responde en `/cuestionario/[groupId]?token=<participant_id>`.
3. Respuestas EDT (preguntas 1–28) + nominaciones ONA se guardan en `responses.answers` (JSONB).
4. Manager abre `/group/[id]/resultados` → fetch de `participants` + `responses` → motor ONA → `SociogramGraph` + métricas EDT.

---

## Estado actual

La vista de resultados en la ruta dinámica `/group/[id]/resultados` carga correctamente. El sociograma se renderiza, los cálculos del motor ONA corren sin problemas y los bugs de renderizado de React (keys duplicadas) han sido solucionados. El MVP está estable y cerrado.

---

## Estado de la Base de Datos / Arquitectura

Arquitectura Multi-tenant implementada con éxito. La tabla `groups` ya recibe y guarda correctamente las foreign keys de `organization_id` y `manager_id` desde el frontend (`insertGroup`). El flujo end-to-end de creación de equipos está validado sin errores de Foreign Key ni restricciones Not Null.
