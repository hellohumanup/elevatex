"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { translateAuthError } from "@/lib/supabase/auth-errors";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { waitForBrowserSession } from "@/lib/supabase/client";

function decodeAuthError(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");
  const clientEnv = getSupabaseEnv();

  const supabase = useMemo(() => {
    if (!clientEnv) {
      return null;
    }

    return createBrowserClient(clientEnv.supabaseUrl, clientEnv.supabaseAnonKey);
  }, [clientEnv]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(decodeAuthError(authError));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("Introduce tu email y contraseña.");
      return;
    }

    if (!clientEnv || !supabase) {
      setError(
        "No se detectaron NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword(
        {
          email: email.trim(),
          password,
        },
      );

      if (signInError) {
        setError(translateAuthError(signInError.message));
        return;
      }

      if (!data || !data.session || !data.session.user) {
        setError(
          "El inicio de sesión no devolvió una sesión válida. Inténtalo de nuevo.",
        );
        return;
      }

      const sessionReady = await waitForBrowserSession(supabase);

      if (!sessionReady) {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError || !sessionData?.session?.user) {
          setError(
            "La sesión no se guardó en las cookies del navegador. Recarga e inténtalo otra vez.",
          );
          return;
        }
      }

      router.refresh();
      router.push("/cuestionario");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? translateAuthError(caughtError.message)
          : "Error inesperado al iniciar sesión.";

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Acceso Seguro
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
              Iniciar sesión
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Accede a tu espacio confidencial de dinámica de equipo.
            </p>
          </div>

          {!clientEnv && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Configuración incompleta: revisa las variables de entorno de Supabase
              en `.env.local`.
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Email corporativo
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
                placeholder="tu@empresa.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !clientEnv}
              className="w-full rounded-xl bg-gradient-to-b from-slate-800 to-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:from-slate-700 hover:to-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Iniciando sesión…" : "Entrar"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            ¿Eres responsable de equipo?{" "}
            <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">
              Ir al panel
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-slate-50 px-6">
          <p className="text-sm text-slate-500">Cargando acceso…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
