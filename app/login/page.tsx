"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { translateAuthError } from "@/lib/supabase/auth-errors";

const inputClassName =
  "w-full rounded-lg border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 transition-all focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("Introduce tu email y contraseña.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
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

      router.push("/admin/surveys");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? translateAuthError(caughtError.message)
          : "Error inesperado al iniciar sesión.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !email.trim() || !password) {
      setError("Completa nombre, email y contraseña.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim() },
        },
      });

      if (signUpError) {
        setError(translateAuthError(signUpError.message));
        return;
      }

      if (data.session?.user) {
        router.push("/admin/surveys");
        return;
      }

      setSuccessMessage(
        "Cuenta creada. Confirma tu email si es necesario y luego inicia sesión.",
      );
      setIsSignUp(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? translateAuthError(caughtError.message)
          : "Error inesperado al registrarse.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function switchTab(signUp: boolean) {
    setIsSignUp(signUp);
    setError(null);
    setSuccessMessage(null);
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-950 px-6 py-16">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-8 shadow-2xl shadow-black/30 ring-1 ring-white/5 sm:p-10">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-400/90">
              ElevateX
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              {isSignUp ? "Registrarse" : "Iniciar Sesión"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Panel de administración de encuestas EDT
            </p>
          </div>

          <div className="mb-8 flex rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => switchTab(false)}
              className={`flex-1 rounded-md py-2.5 text-sm font-medium transition-colors ${
                !isSignUp
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => switchTab(true)}
              className={`flex-1 rounded-md py-2.5 text-sm font-medium transition-colors ${
                isSignUp
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Registrarse
            </button>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
              {successMessage}
            </div>
          )}

          <form
            onSubmit={isSignUp ? handleSignUp : handleSignIn}
            className="space-y-4"
          >
            {isSignUp && (
              <div>
                <label
                  htmlFor="name"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Nombre
                </label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={isSubmitting}
                  className={inputClassName}
                  placeholder="Tu nombre"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                className={inputClassName}
                placeholder="tu@empresa.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                className={inputClassName}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_15px_rgba(147,51,234,0.25)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? isSignUp
                  ? "Registrando…"
                  : "Entrando…"
                : isSignUp
                  ? "Crear cuenta"
                  : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
