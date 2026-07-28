import { NextResponse } from "next/server";
import {
  fetchActiveOnaCampaignQuestion,
  fetchOnaEliteQuestions,
  fetchOnaQuestionByDimension,
  isOnaEliteDimension,
  ONA_ELITE_DIMENSION_LABELS,
  setGroupActiveOnaDimension,
} from "@/lib/surveyQuestions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/survey-questions/active
 *   ?dimension=confianza
 *   ?groupId=123          → usa groups.active_ona_dimension
 *   ?catalog=1            → lista las 3 preguntas ONA élite
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const catalog = searchParams.get("catalog");
  const dimension = searchParams.get("dimension");
  const groupId = searchParams.get("groupId");

  if (catalog === "1" || catalog === "true") {
    const result = await fetchOnaEliteQuestions();

    if (result.error && result.data.length === 0) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      questions: result.data,
      labels: ONA_ELITE_DIMENSION_LABELS,
    });
  }

  if (dimension && isOnaEliteDimension(dimension) && !groupId) {
    const result = await fetchOnaQuestionByDimension(dimension);

    if (result.error || !result.data) {
      return NextResponse.json(
        {
          success: false,
          error: result.error ?? "Pregunta no encontrada.",
          dimension,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      dimension,
      label: ONA_ELITE_DIMENSION_LABELS[dimension],
      question: result.data,
    });
  }

  const result = await fetchActiveOnaCampaignQuestion({
    dimension,
    groupId,
  });

  if (result.error || !result.data) {
    return NextResponse.json(
      {
        success: false,
        error: result.error ?? "No se pudo resolver la pregunta activa.",
        dimension: result.dimension,
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    dimension: result.dimension,
    label: ONA_ELITE_DIMENSION_LABELS[result.dimension],
    question: result.data,
  });
}

/**
 * POST /api/survey-questions/active
 * Body: { groupId, dimension } — fija la dimensión de campaña del equipo.
 */
export async function POST(request: Request) {
  let body: { groupId?: string | number; dimension?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  if (body.groupId == null || !body.dimension) {
    return NextResponse.json(
      {
        success: false,
        error: "Se requiere { groupId, dimension }.",
      },
      { status: 400 },
    );
  }

  if (!isOnaEliteDimension(body.dimension)) {
    return NextResponse.json(
      {
        success: false,
        error:
          'dimension debe ser "informacion" | "confianza" | "innovacion".',
      },
      { status: 400 },
    );
  }

  const result = await setGroupActiveOnaDimension({
    groupId: body.groupId,
    dimension: body.dimension,
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 400 },
    );
  }

  const question = await fetchOnaQuestionByDimension(body.dimension);

  return NextResponse.json({
    success: true,
    groupId: body.groupId,
    dimension: body.dimension,
    label: ONA_ELITE_DIMENSION_LABELS[body.dimension],
    question: question.data,
  });
}
