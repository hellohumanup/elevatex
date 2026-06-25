"use client";

import { useState } from "react";
import {
  buildSurveyResponseRecord,
  createAnonymousResponderId,
  insertSurveyResponse,
  type SurveyFormVotes,
} from "@/lib/surveyResponses";

const DEFAULT_TEAM_MEMBERS = [
  "Carlos",
  "María",
  "Lucía",
  "Juan",
  "Sofía",
  "Pedro",
  "Elena",
  "Marta",
];

const QUESTIONS = [
  {
    id: "technical-help",
    number: 1,
    subtitle: "Ayuda técnica",
    text: "¿A qué 3 compañeros de tu equipo acudes habitualmente cuando necesitas ayuda con un problema técnico o tarea?",
  },
  {
    id: "collaboration",
    number: 2,
    subtitle: "Colaboración eficaz",
    text: "¿Con qué 3 compañeros te resulta más fácil colaborar y sacar adelante proyectos?",
  },
  {
    id: "climate-referents",
    number: 3,
    subtitle: "Referente de clima laboral",
    text: "¿Quiénes consideras que son los referentes naturales en el equipo a la hora de mantener un buen clima y motivar al grupo?",
  },
] as const;

type QuestionId = (typeof QUESTIONS)[number]["id"];

type QuestionAnswers = [string, string, string];

type ParticipantOption = {
  id: string;
  name: string;
};

type SociometricNativeQuestionnaireProps = {
  teamMembers?: string[];
  participants?: ParticipantOption[];
  groupId?: string;
  organizationId?: number;
};

function getAvailableOptions(
  teamMembers: string[],
  currentAnswers: QuestionAnswers,
  slotIndex: number,
): string[] {
  const selectedElsewhere = new Set(
    currentAnswers.filter((_, index) => index !== slotIndex),
  );

  return teamMembers.filter((member) => !selectedElsewhere.has(member));
}

function QuestionSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs font-medium text-slate-500">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3.5 pr-10 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100"
        >
          <option value="">Selecciona un compañero…</option>
          {options.map((member) => (
            <option key={member} value={member}>
              {member}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

export default function SociometricNativeQuestionnaire({
  teamMembers: teamMembersProp,
  participants,
  organizationId,
}: SociometricNativeQuestionnaireProps) {
  const teamMembers =
    teamMembersProp ??
    participants?.map((participant) => participant.name) ??
    DEFAULT_TEAM_MEMBERS;

  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [formVotes, setFormVotes] = useState<SurveyFormVotes>({
    p1: ["", "", ""],
    p2: ["", "", ""],
    p3: ["", "", ""],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresIdentity = Boolean(participants && participants.length > 0);

  const answersByQuestion: Record<QuestionId, QuestionAnswers> = {
    "technical-help": formVotes.p1,
    collaboration: formVotes.p2,
    "climate-referents": formVotes.p3,
  };

  function updateAnswer(
    questionId: QuestionId,
    slotIndex: number,
    value: string,
  ) {
    const voteKey =
      questionId === "technical-help"
        ? "p1"
        : questionId === "collaboration"
          ? "p2"
          : "p3";

    setFormVotes((current) => {
      const nextVotes = [...current[voteKey]] as QuestionAnswers;
      nextVotes[slotIndex] = value;
      return { ...current, [voteKey]: nextVotes };
    });
    setError(null);
  }

  function validateAnswers(): boolean {
    if (requiresIdentity && !selectedParticipantId) {
      setError("Selecciona tu nombre antes de enviar.");
      return false;
    }

    for (const question of QUESTIONS) {
      const questionAnswers = answersByQuestion[question.id];

      if (questionAnswers.some((answer) => !answer)) {
        setError(
          `Completa las 3 selecciones de la pregunta ${question.number} (${question.subtitle}) antes de enviar.`,
        );
        return false;
      }

      const uniqueAnswers = new Set(questionAnswers);
      if (uniqueAnswers.size !== questionAnswers.length) {
        setError(
          `En la pregunta ${question.number}, elige a 3 compañeros distintos.`,
        );
        return false;
      }
    }

    return true;
  }

  function resolveResponderId(): string {
    if (selectedParticipantId && participants) {
      const participant = participants.find(
        (entry) => entry.id === selectedParticipantId,
      );

      if (participant) {
        return participant.name;
      }
    }

    return createAnonymousResponderId();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateAnswers()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const record = buildSurveyResponseRecord({
      organizationId,
      responderId: resolveResponderId(),
      votes: formVotes,
    });

    const { error: insertError } = await insertSurveyResponse(record);

    setIsSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setIsSubmitted(true);
  }

  if (isSubmitted) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6 py-16">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden="true">
              <path
                d="M6 12.5 10 16.5 18 8.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
            ¡Cuestionario enviado con éxito! Gracias por tu tiempo
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Tus respuestas han sido registradas de forma segura. Puedes cerrar
            esta ventana.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-10 text-center">
          <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Cuestionario Sociométrico
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
            Dinámica de Equipo
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            Tu participación nos ayuda a construir un equipo más conectado. Tus
            respuestas son 100% confidenciales.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {requiresIdentity && (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Identificación
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">
                  Selecciona tu nombre
                </h2>
              </div>
              <div className="px-6 py-6">
                <QuestionSelect
                  id="participant-identity"
                  label="Tu nombre"
                  value={
                    participants?.find(
                      (participant) => participant.id === selectedParticipantId,
                    )?.name ?? ""
                  }
                  options={participants?.map((participant) => participant.name) ?? []}
                  onChange={(name) => {
                    const participant = participants?.find(
                      (entry) => entry.name === name,
                    );
                    setSelectedParticipantId(participant?.id ?? "");
                    setError(null);
                  }}
                />
              </div>
            </section>
          )}

          {QUESTIONS.map((question) => (
            <section
              key={question.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Pregunta {question.number}: {question.subtitle}
                </p>
                <h2 className="mt-2 text-lg font-semibold leading-snug text-slate-900">
                  {question.text}
                </h2>
              </div>

              <div className="grid gap-4 px-6 py-6 sm:grid-cols-3">
                {answersByQuestion[question.id].map((value, slotIndex) => (
                  <QuestionSelect
                    key={`${question.id}-${slotIndex}`}
                    id={`${question.id}-${slotIndex}`}
                    label={`Compañero ${slotIndex + 1}`}
                    value={value}
                    options={getAvailableOptions(
                      teamMembers,
                      answersByQuestion[question.id],
                      slotIndex,
                    )}
                    onChange={(nextValue) =>
                      updateAnswer(question.id, slotIndex, nextValue)
                    }
                  />
                ))}
              </div>
            </section>
          ))}

          <div className="flex justify-center pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full max-w-xl overflow-hidden rounded-xl bg-gradient-to-b from-slate-800 to-slate-950 px-6 py-4 text-base font-semibold tracking-wide text-white shadow-[0_1px_2px_rgba(15,23,42,0.12),0_8px_24px_rgba(15,23,42,0.18)] ring-1 ring-white/10 transition-all duration-200 hover:from-slate-700 hover:to-slate-900 hover:shadow-[0_2px_4px_rgba(15,23,42,0.14),0_12px_32px_rgba(15,23,42,0.22)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
              />
              {isSubmitting ? (
                <span className="inline-flex items-center justify-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  Enviando de forma segura...
                </span>
              ) : (
                "Enviar Respuestas de Forma Segura"
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
