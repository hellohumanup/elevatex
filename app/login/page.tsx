"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { translateAuthError } from "@/lib/supabase/auth-errors";
import { createClientComponentClient } from "@/lib/supabase/auth-helpers-nextjs-shim";

type AuthMode = "login" | "register";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function redirectToDashboard() {
    router.refresh();
    router.replace("/dashboard");
  }

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError("Introduce tu email y contraseña.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === "login") {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

        if (signInError) {
          setError(translateAuthError(signInError.message));
          return;
        }

        if (!data.session?.user) {
          setError("No se pudo establecer la sesión. Inténtalo de nuevo.");
          return;
        }

        await redirectToDashboard();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (signUpError) {
        setError(translateAuthError(signUpError.message));
        return;
      }

      // Si Supabase crea sesión al registrar (confirmación de email desactivada).
      if (data.session?.user) {
        await redirectToDashboard();
        return;
      }

      // Cuenta creada pero falta confirmar email → no hay sesión aún.
      setInfo(
        "Cuenta creada. Revisa tu email para confirmarla e inicia sesión.",
      );
      setMode("login");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? translateAuthError(caughtError.message)
          : "Error inesperado al autenticar.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold text-slate-900">
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Acceso al panel B2B de Vínculo
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        {info ? (
          <p
            role="status"
            className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
          >
            {info}
          </p>
        ) : null}

        <form onSubmit={handleAuth} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-60"
              placeholder="tu@empresa.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-60"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? mode === "login"
                ? "Entrando…"
                : "Registrando…"
              : mode === "login"
                ? "Entrar"
                : "Registrarme"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === "login" ? (
            <>
              ¿No tienes cuenta?{" "}
              <button
                type="button"
                className="font-medium text-violet-600 hover:text-violet-500"
                onClick={() => {
                  setMode("register");
                  setError(null);
                  setInfo(null);
                }}
                disabled={isSubmitting}
              >
                Registrarme
              </button>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{" "}
              <button
                type="button"
                className="font-medium text-violet-600 hover:text-violet-500"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setInfo(null);
                }}
                disabled={isSubmitting}
              >
                Iniciar sesión
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
